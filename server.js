const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { normalizeMid, parseMids, rootOf, conceptOf, parseQuestionBlocks, normalizeQuestionType, normalizeQuestionText, uniqueQuestionsByText, scanConcepts, validateQuestion, calculateChapterReadiness, gapsByFrequency } = require('./question-engine');
const TrackerEngine = require('./public/tracker-engine');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = process.env.ANGLES_DATA_DIR || path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');
app.use(express.json({ limit: '4mb' }));

function isSafeSegment(value) {
  return typeof value === 'string' && value.length > 0 && value !== '.' && value !== '..' && !value.includes('/') && !value.includes('\\') && !value.includes('..');
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
function ensureInsideData(target) {
  const relative = path.relative(DATA_DIR, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path escapes data directory');
}
function folderPath(folder) {
  if (!isSafeSegment(folder)) throw new Error('Invalid chapter name');
  const target = path.join(DATA_DIR, folder); ensureInsideData(target); return target;
}
function filePath(folder, file) {
  if (!isSafeSegment(folder) || !isSafeSegment(file)) throw new Error('Invalid file path');
  if (!(file.endsWith('.html') || file.endsWith('.css'))) throw new Error('Only .html and .css files are supported');
  const target = path.join(folderPath(folder), file); ensureInsideData(target); return target;
}
function cleanChapterName(name) {
  const cleaned = String(name || '').trim().replace(/[\\/]+/g, '-').replace(/\s+/g, ' ');
  if (!cleaned || cleaned === '.' || cleaned === '..') throw new Error('Chapter name is required');
  return cleaned.slice(0, 80);
}
function cleanFileName(name, type = 'html') {
  let cleaned = String(name || '').trim().replace(/[\\/]+/g, '-').replace(/\s+/g, '-');
  if (!cleaned) throw new Error('File name is required');
  const extension = type === 'css' ? '.css' : '.html';
  if (!/\.(html|css)$/i.test(cleaned)) cleaned += extension;
  if (!/^[\w .-]+\.(html|css)$/i.test(cleaned) || cleaned.includes('..')) throw new Error('Use a simple .html or .css filename');
  if (type === 'css' && !cleaned.endsWith('.css')) throw new Error('CSS files must end with .css');
  if (type === 'html' && !cleaned.endsWith('.html')) throw new Error('HTML files must end with .html');
  return cleaned.slice(0, 100);
}

function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function folderRoot(content) { return normalizeMid(/<!--\s*angles-root-mid:\s*([\w.-]+)\s*-->/i.exec(content)?.[1] || ''); }
async function rootMidInUse(mid, exceptFolder = '') {
  for (const chapter of await scanChapters()) {
    if (chapter.folder === exceptFolder) continue;
    for (const file of chapter.files.filter((name) => name.toLowerCase().endsWith('.html'))) {
      if (folderRoot(await fs.readFile(path.join(folderPath(chapter.folder), file), 'utf8')) === mid) return chapter.folder;
    }
  }
  return '';
}
function withRootMid(content, root) {
  const marker = `<!-- angles-root-mid: ${normalizeMid(root)} -->`;
  if (/<!--\s*angles-root-mid:/i.test(content)) return content.replace(/<!--\s*angles-root-mid:[\s\S]*?-->/i, marker);
  return /<!doctype\b[^>]*>/i.test(content) ? content.replace(/<!doctype\b[^>]*>/i, (doctype) => `${doctype}\n${marker}`) : `${marker}\n${content}`;
}
function wrapConceptFile(content, conceptMid) {
  const local = conceptOf(conceptMid);
  if (!local || !/^(?:C\d+|UN)$/.test(local)) return { content, found: false };
  const pattern = new RegExp(`<mid\\s*=\\s*${escapeRegExp(local)}\\s*>([\\s\\S]*?)<\\/mid\\s*>`, 'i');
  const match = pattern.exec(content);
  if (!match) return { content, found: false };
  const existing = match[1];
  const qn = /<qn\s+all\b([\s\S]*?)<\/qn\s+all\s*>/i.exec(existing);
  const questionBlocks = [];
  return { found: true, content, insert(block) {
    const blockQuestions = parseQuestionBlocks(existing);
    if (blockQuestions.some((q) => normalizeQuestionText(q.text) === normalizeQuestionText(parseQuestionBlocks(block)[0]?.text))) return { content, duplicate: true };
    let nextBody;
    if (qn) {
      const qnStart = match.index + match[0].indexOf(qn[0]);
      const close = qnStart + qn[0].lastIndexOf('</qn');
      nextBody = content.slice(0, close) + `\n${block}\n` + content.slice(close);
    } else {
      const insertAt = match.index + match[0].length - '</mid>'.length;
      nextBody = content.slice(0, insertAt) + `\n<qn all>\n${block}\n</qn all>\n` + content.slice(insertAt);
    }
    return { content: nextBody, duplicate: false };
  } };
}
async function locateConcept(folder, targetMid) {
  const dir = folderPath(folder); const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries.filter((item) => item.isFile() && item.name.toLowerCase().endsWith('.html'))) {
    const content = await fs.readFile(path.join(dir, entry.name), 'utf8');
    if (scanConcepts(content).some((concept) => concept.localMid === conceptOf(targetMid))) return { folder, file: entry.name, content };
  }
  return null;
}
async function indexQuestionData() {
  const chapters = await scanChapters(); const registry = {}; const results = [];
  for (const chapter of chapters) {
    const files = chapter.files.filter((name) => name.toLowerCase().endsWith('.html'));
    let root = '';
    for (const file of files) { const content = await fs.readFile(path.join(folderPath(chapter.folder), file), 'utf8'); root = root || folderRoot(content); }
    const row = { folder: chapter.folder, name: chapter.name, rootMid: root, concepts: [], questions: [], unmapped: [] };
    for (const file of files) {
      const content = await fs.readFile(path.join(folderPath(chapter.folder), file), 'utf8');
      for (const concept of scanConcepts(content)) {
        const mid = concept.localMid === 'UN' ? `${root || 'UN'}.UN` : `${root}.${concept.localMid}`;
        const entry = { mid, title: concept.title || mid, folder: chapter.folder, file, content: concept.body };
        if (root) registry[mid] = { folder: chapter.folder, file, conceptTitle: entry.title };
        const parsed = parseQuestionBlocks(concept.body).map((question) => ({ ...question, folder: chapter.folder, file, conceptMid: mid }));
        const midUnmapped = parsed.filter((question) => question.mids.some((questionMid) => rootOf(questionMid) === 'UN' || conceptOf(questionMid) === 'UN'));
        const mappedByMid = parsed.filter((question) => !midUnmapped.includes(question));
        if (concept.localMid === 'UN') row.unmapped.push(...parsed);
        else { row.unmapped.push(...midUnmapped); row.questions.push(...mappedByMid); }
        row.concepts.push({ mid, title: entry.title, folder: chapter.folder, file, questions: parsed.length, questionTypes: parsed.map((question) => question.type || 'UNTYPED') });
      }
    }
    const visited = new Set(); const countedTexts = new Set(); let mappedUnique = 0; const typeCounts = {};
    for (const concept of row.concepts.filter((item) => !item.mid.endsWith('.UN'))) {
      for (const question of row.questions.filter((item) => item.conceptMid === concept.mid)) {
        const tagged = question.mids.filter((mid) => rootOf(mid) === root);
        if (!tagged.includes(concept.mid)) continue;
        if (tagged.some((mid) => visited.has(mid))) continue;
        const textKey = normalizeQuestionText(question.text);
        if (!textKey || countedTexts.has(textKey)) continue;
        countedTexts.add(textKey);
        mappedUnique++;
        const type = normalizeQuestionType(question.type) || 'UNTYPED';
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      }
      visited.add(concept.mid);
    }
    row.unmapped = uniqueQuestionsByText(row.unmapped);
    row.mappedUnique = mappedUnique; row.unmappedCount = row.unmapped.length;
    for (const question of row.unmapped) {
      const type = normalizeQuestionType(question.type) || 'UNTYPED';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    }
    row.typeCounts = typeCounts;
    row.uniqueQuestionCount = Object.values(typeCounts).reduce((sum, count) => sum + count, 0);
    row.concepts.forEach((concept) => {
      const questions = uniqueQuestionsByText(concept.mid.endsWith('.UN') ? row.unmapped.filter((question) => question.conceptMid === concept.mid) : row.questions.filter((question) => question.conceptMid === concept.mid));
      concept.typeCounts = {};
      questions.forEach((question) => { const type = normalizeQuestionType(question.type) || 'UNTYPED'; concept.typeCounts[type] = (concept.typeCounts[type] || 0) + 1; });
      concept.uniqueQuestionCount = questions.length;
    });
    row.totalQuestions = mappedUnique + row.unmappedCount;
    row.readiness = calculateChapterReadiness(mappedUnique, row.unmappedCount);
    row.gaps = gapsByFrequency(row.unmapped);
    results.push(row);
  }
  const globalUnmappedRow = results.find((row) => row.rootMid === 'UN' || row.folder.toLowerCase() === 'global unmapped');
  const chapterRows = results.filter((row) => row.rootMid && row.rootMid !== 'UN');
  const total = chapterRows.reduce((sum, row) => sum + row.totalQuestions, 0);
  results.forEach((row) => { row.totalShare = total ? row.totalQuestions / total * 100 : 0; });
  const typeSet = new Set();
  results.forEach((row) => Object.keys(row.typeCounts || {}).forEach((type) => typeSet.add(type)));
  const types = [...typeSet].sort((a, b) => a === 'UNTYPED' ? 1 : b === 'UNTYPED' ? -1 : a.localeCompare(b));
  const typeFolders = results.filter((row) => row.rootMid && row.rootMid !== 'UN').map((row) => ({ folder: row.folder, name: row.name, rootMid: row.rootMid, counts: row.typeCounts, uniqueCount: row.uniqueQuestionCount, concepts: row.concepts.map((concept) => ({ mid: concept.mid, title: concept.title, counts: concept.typeCounts, uniqueCount: concept.uniqueQuestionCount })) }));
  if (globalUnmappedRow) typeFolders.push({ folder: globalUnmappedRow.folder, name: globalUnmappedRow.name, rootMid: 'UN', counts: globalUnmappedRow.typeCounts, uniqueCount: globalUnmappedRow.unmappedCount, concepts: globalUnmappedRow.concepts.map((concept) => ({ mid: concept.mid, title: concept.title, counts: concept.typeCounts, uniqueCount: concept.uniqueQuestionCount })) });
  return { chapters: results, registry, typeBreakdown: { types, folders: typeFolders } };
}
async function resolveTarget(mid) {
  const { chapters } = await indexQuestionData(); const root = rootOf(mid); const chapter = chapters.find((item) => item.rootMid === root);
  if (!chapter || root === 'UN') {
    const global = chapters.find((item) => item.rootMid === 'UN' || item.folder.toLowerCase() === 'global unmapped');
    return global ? { kind: 'unmapped', folder: global.folder, file: 'unmapped.html', conceptMid: 'UN.UN' } : { kind: 'missing-global', root };
  }
  if (conceptOf(mid) === 'UN') return { kind: 'unmapped', folder: chapter.folder, file: 'unmapped.html', conceptMid: `${root}.UN` };
  const match = await locateConcept(chapter.folder, mid);
  return match ? { kind: 'mapped', folder: match.folder, file: match.file, conceptMid: mid } : { kind: 'unknown-concept', folder: chapter.folder, file: 'unmapped.html', conceptMid: `${root}.UN`, requestedMid: mid };
}
async function getOrCreateUnmapped(folder, root) {
  const dir = folderPath(folder); await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, 'unmapped.html');
  try { return await fs.readFile(target, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const content = `<!-- angles-root-mid: ${normalizeMid(root)} -->\n<h1>${root === 'UN' ? 'Global Unmapped' : `${root} Unmapped Questions`}</h1>\n<mid = un>\n  <h2>Unmapped Questions</h2>\n</mid>\n`;
  await fs.writeFile(target, content, 'utf8'); return content;
}
async function ensureGlobalUnmapped() {
  const dir = folderPath('Global Unmapped'); await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'unmapped.html');
  try { await fs.access(file); } catch (_) { await fs.writeFile(file, '<!-- angles-root-mid: UN -->\n<h1>Global Unmapped</h1>\n<mid = un>\n  <h2>Unmapped Questions</h2>\n</mid>\n', 'utf8'); }
}
async function ensureRegisteredUnmappedFiles() {
  for (const chapter of await scanChapters()) {
    if (chapter.folder.toLowerCase() === 'global unmapped') continue;
    let root = '';
    for (const name of chapter.files.filter((file) => file.toLowerCase().endsWith('.html'))) {
      root = root || folderRoot(await fs.readFile(path.join(folderPath(chapter.folder), name), 'utf8'));
    }
    if (root && root !== 'UN' && !chapter.files.some((file) => file.toLowerCase() === 'unmapped.html')) await getOrCreateUnmapped(chapter.folder, root);
  }
}
async function atomicWriteBatch(changes) {
  const originals = new Map();
  try {
    for (const [file, content] of changes) {
      let original;
      try { original = await fs.readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; original = null; }
      originals.set(file, original);
      const temp = `${file}.angles-tmp`; await fs.writeFile(temp, content, 'utf8'); await fs.rename(temp, file);
    }
  } catch (error) {
    for (const [file, content] of originals) { try { if (content === null) await fs.unlink(file); else await fs.writeFile(file, content, 'utf8'); } catch (_) {} }
    for (const file of changes.keys()) { try { await fs.unlink(`${file}.angles-tmp`); } catch (_) {} }
    throw error;
  }
}

class TrackerError extends Error {
  constructor(code, message, status = 409, details = []) { super(message); this.code = code; this.status = status; this.details = details; }
}
const trackerLocks = new Map();
async function withTrackerLock(key, task) {
  const previous = trackerLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  trackerLocks.set(key, current);
  await previous;
  try { return await task(); }
  finally { release(); if (trackerLocks.get(key) === current) trackerLocks.delete(key); }
}
function trackerApiError(res, error) {
  res.status(error.status || 500).json({ error: error.message || 'Tracker request failed', code: error.code || 'TRACKER_ERROR', details: error.details || [] });
}
function stripHtmlCommentsPreservingOffsets(source) {
  return String(source || '').replace(/<!--[\s\S]*?-->/g, (comment) => ' '.repeat(comment.length));
}
function trackerQuestionSignature(question) {
  const optionsBlock = /<Options\s*>([\s\S]*?)<\/Options\s*>/i.exec(question.block || '')?.[1] || '';
  const options = [...optionsBlock.matchAll(/<([A-D])\s*=\s*([\s\S]*?)(?=<[A-D]\s*=|$)/gi)]
    .map((match) => [match[1].toUpperCase(), normalizeQuestionText(match[2])]);
  const prompt = normalizeQuestionText(question.text) || normalizeQuestionText(question.block);
  return crypto.createHash('sha256').update(JSON.stringify({ prompt, options })).digest('hex');
}
async function trackerChapterInventory() {
  const chapters = await scanChapters();
  const rows = [];
  for (const chapter of chapters) {
    const mids = new Set();
    for (const file of chapter.files.filter((name) => name.toLowerCase().endsWith('.html'))) {
      const root = folderRoot(await fs.readFile(path.join(folderPath(chapter.folder), file), 'utf8'));
      if (root) mids.add(root);
    }
    rows.push({ folder: chapter.folder, name: chapter.name, htmlCount: chapter.htmlCount, rootMids: [...mids].sort() });
  }
  const owners = new Map();
  for (const row of rows) for (const mid of row.rootMids.filter((value) => value !== 'UN')) {
    if (!owners.has(mid)) owners.set(mid, new Set());
    owners.get(mid).add(row.folder);
  }
  for (const row of rows) {
    row.rootMid = row.rootMids.length === 1 ? row.rootMids[0] : '';
    row.status = 'ready'; row.issue = '';
    if (row.rootMids.length === 0) { row.status = 'missing-mid'; row.issue = 'No chapter MID marker was found in this folder.'; }
    else if (row.rootMids.length > 1) { row.status = 'mid-conflict'; row.issue = `Conflicting MIDs in this folder: ${row.rootMids.join(', ')}.`; }
    else if (row.rootMid === 'UN') { row.status = 'reserved'; row.issue = 'UN is reserved for global unmapped questions, not a chapter tracker.'; }
    else if ((owners.get(row.rootMid)?.size || 0) > 1) {
      row.status = 'duplicate-mid';
      row.issue = `Root MID ${row.rootMid} is shared by: ${[...owners.get(row.rootMid)].join(', ')}.`;
    }
  }
  return rows;
}
async function collectTrackerQuestionPool(folder, rootMid, files) {
  const pool = []; const warnings = []; const conceptMids = new Set(); const seen = new Set();
  for (const file of files.filter((name) => name.toLowerCase().endsWith('.html')).sort((a, b) => a.localeCompare(b))) {
    const raw = await fs.readFile(path.join(folderPath(folder), file), 'utf8');
    const source = stripHtmlCommentsPreservingOffsets(raw);
    const wrappers = scanConcepts(source);
    wrappers.forEach((wrapper) => conceptMids.add(wrapper.localMid));
    for (const question of parseQuestionBlocks(source)) {
      const enclosing = wrappers.filter((wrapper) => question.start >= wrapper.start && question.start < wrapper.end).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
      let conceptMid = TrackerEngine.selectConceptMid(question.mids, enclosing?.localMid, rootMid);
      conceptMid = /^(?:C\d+|UN)$/i.test(conceptMid) ? conceptMid.toUpperCase() : 'UN';
      conceptMids.add(conceptMid);
      if (conceptMid === 'UN' && !enclosing && !question.mids.some((mid) => rootOf(mid) === rootMid && conceptOf(mid) === 'UN')) warnings.push({ code: 'QUESTION_UNCLASSIFIED', file, message: 'Question has no matching concept MID; counted in the chapter UN pool.' });
      const signature = trackerQuestionSignature(question);
      if (seen.has(signature)) continue;
      seen.add(signature);
      if (!question.text) warnings.push({ code: 'QUESTION_TEXT_MISSING', file, message: 'A question block has no readable <text> value; it is still counted using its source signature.' });
      pool.push({ conceptMid, signature, sourceFile: file, type: question.type || 'UNTYPED', text: question.text || '', mids: question.mids || [] });
    }
  }
  return { pool, conceptMids: [...conceptMids].sort((a, b) => a === 'UN' ? 1 : b === 'UN' ? -1 : a.localeCompare(b)), warnings };
}
async function readOrSyncTracker(folder, rootMid, topic, lockHeld = false) {
  const sync = async () => {
    const dir = folderPath(folder); const filePathname = path.join(dir, 'tracker-ledger.json');
    let original = '';
    try { original = await fs.readFile(filePathname, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    let ledger;
    if (original) {
      try { ledger = JSON.parse(original); } catch (_) { throw new TrackerError('INVALID_LEDGER_JSON', `The tracker ledger for ${folder} is not valid JSON. Preserve the file and repair it before continuing.`, 409); }
      if (ledger.chapterMid && ledger.chapterMid !== rootMid) throw new TrackerError('LEDGER_MID_MISMATCH', `The saved ledger MID is ${ledger.chapterMid}, but this folder now has MID ${rootMid}. No IDs or records were changed.`, 409);
      ledger.chapterMid = rootMid; ledger.topic = topic;
      ledger.timingConfig ||= { locked: false, fastLimit: null, mediumLimit: null, slowLimit: null };
      ledger.concepts ||= {};
    } else ledger = TrackerEngine.createLedger(rootMid, topic);
    const chapter = (await scanChapters()).find((item) => item.folder === folder);
    if (!chapter) throw new TrackerError('CHAPTER_NOT_FOUND', `Folder ${folder} no longer exists.`, 404);
    const collected = await collectTrackerQuestionPool(folder, rootMid, chapter.files);
    TrackerEngine.reconcileQuestionPool(ledger, collected.pool, collected.conceptMids);
    const result = TrackerEngine.calculateMetrics(ledger);
    if (!result.ok) throw new TrackerError('LEDGER_VALIDATION_FAILED', `The saved tracker ledger for ${folder} failed validation. Totals are withheld.`, 409, result.errors);
    const serialized = `${JSON.stringify(ledger, null, 2)}\n`;
    if (original !== serialized) await atomicWriteBatch(new Map([[filePathname, serialized]]));
    return { ledger, metrics: result.metrics, invariants: result.invariants, warnings: collected.warnings };
  };
  return lockHeld ? sync() : withTrackerLock(folder, sync);
}

async function ensureData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
  if (entries.some((entry) => entry.isDirectory())) return;
  const starterChapters = [
    { folder: 'subject-verb-agreement', content: `<h1>Subject–Verb Agreement</h1>\n<p class="lede">Build the rule once. Retrieve it under pressure.</p>\n<table r = 3 c = 3>\n  <c11 = Signal> <c12 = Rule> <c13 = Example>\n  <c21 = Singular subject> <c22 = Use a singular verb> <c23 = The dog <strong>runs</strong> fast.>\n  <c31 = Either / neither> <c32 = Match the nearer subject> <c33 = Either the cats or the dog <strong>has</strong> eaten.>\n</table>\n\n<qn all mode = exam>\n  <text = Choose the correct verb.>\n  <A = The list of names are on the desk.>\n  <B = The list of names is on the desk.>\n  <answer = b>\n  <explanation = “List” is the head noun, so the singular verb “is” agrees.>\n</qn>` },
    { folder: 'time-and-work', content: `<h1>Time & Work</h1>\n<p class="lede">A compact calculation sheet for rate-based questions.</p>\n<grid pos="2, 4" span="11, 8">\n  <span class="eyebrow">RULE 01</span>\n  <h2>Work = Rate × Time</h2>\n  <p>When two workers combine, add their daily rates before taking the reciprocal.</p>\n</grid>\n<p class="note-callout">Try writing one line of reasoning before checking the answer.</p>` }
  ];
  await Promise.all(starterChapters.map(async ({ folder, content }) => {
    const dir = path.join(DATA_DIR, folder); await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'styles.css'), ':root { --chapter-accent: #2457ff; }\n.preview-content h1 { color: var(--chapter-accent); }\n', 'utf8');
    await fs.writeFile(path.join(dir, '01-start-here.html'), content, 'utf8');
  }));
}

async function scanChapters() {
  await ensureData();
  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
  const chapters = [];
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = path.join(DATA_DIR, entry.name);
    const files = await fs.readdir(dir, { withFileTypes: true });
    const topicFiles = files.filter((file) => file.isFile() && /\.(html|css)$/i.test(file.name)).sort((a, b) => (a.name.endsWith('.css') ? 1 : 0) - (b.name.endsWith('.css') ? 1 : 0) || a.name.localeCompare(b.name));
    chapters.push({ folder: entry.name, name: entry.name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()), htmlCount: topicFiles.filter((file) => file.name.endsWith('.html')).length, cssCount: topicFiles.filter((file) => file.name.endsWith('.css')).length, files: topicFiles.map((file) => file.name), hasStyles: topicFiles.some((file) => file.name.endsWith('.css')) });
  }
  return chapters;
}
function apiError(res, error, status = 400) { res.status(status).json({ error: error.message || 'Something went wrong' }); }

app.get('/api/chapters', async (_req, res) => { try { res.json({ chapters: await scanChapters() }); } catch (error) { apiError(res, error, 500); } });
app.post('/api/chapters', async (req, res) => {
  try {
    await ensureData(); const folder = cleanChapterName(req.body?.name); const target = folderPath(folder);
    const rootMid = normalizeMid(req.body?.mid || '');
    if (!/^[A-Z][A-Z0-9-]*$/.test(rootMid) || rootMid === 'UN') throw new Error('Enter a valid folder MID (letters, numbers, hyphens); UN is reserved.');
    const duplicateRoot = await rootMidInUse(rootMid);
    if (duplicateRoot) throw new Error(`Root MID ${rootMid} is already assigned to ${duplicateRoot}.`);
    await fs.mkdir(target, { recursive: false });
    await fs.writeFile(path.join(target, 'styles.css'), ':root { --chapter-accent: #2457ff; }\n', 'utf8');
    await fs.writeFile(path.join(target, 'unmapped.html'), `<!-- angles-root-mid: ${rootMid} -->\n<h1>${escapeHtml(rootMid)} Unmapped Questions</h1>\n<mid = un>\n  <h2>Unmapped Questions</h2>\n</mid>\n`, 'utf8');
    await fs.writeFile(path.join(target, '01-start-here.html'), `<!-- angles-root-mid: ${rootMid} -->\n<h1>New chapter</h1>\n<p>Start shaping this sheet.</p>\n`, 'utf8');
    res.status(201).json({ folder, chapter: (await scanChapters()).find((chapter) => chapter.folder === folder) });
  } catch (error) { apiError(res, error, error.code === 'EEXIST' ? 409 : 400); }
});
app.put('/api/chapters/:folder/mid', async (req, res) => {
  try {
    const folder = req.params.folder; const rootMid = normalizeMid(req.body?.mid || '');
    if (!/^[A-Z][A-Z0-9-]*$/.test(rootMid) || rootMid === 'UN') throw new Error('Enter a valid chapter MID other than reserved UN.');
    const duplicateRoot = await rootMidInUse(rootMid, folder);
    if (duplicateRoot) throw new Error(`Root MID ${rootMid} is already assigned to ${duplicateRoot}.`);
    const dir = folderPath(folder);
    const files = (await fs.readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.html'));
    for (const entry of files) { const file = path.join(dir, entry.name); const content = withRootMid(await fs.readFile(file, 'utf8'), rootMid); await fs.writeFile(file, content, 'utf8'); }
    await getOrCreateUnmapped(folder, rootMid);
    res.json({ ok: true, folder, mid: rootMid });
  } catch (error) { apiError(res, error, error.code === 'ENOENT' ? 404 : 400); }
});
app.get('/api/chapters/:folder/files', async (req, res) => {
  try {
    const dir = folderPath(req.params.folder); const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && /\.(html|css)$/i.test(entry.name)).sort((a, b) => (a.name.endsWith('.css') ? 1 : 0) - (b.name.endsWith('.css') ? 1 : 0) || a.name.localeCompare(b.name)).map((entry) => ({ name: entry.name, type: entry.name.endsWith('.css') ? 'css' : 'html' }));
    res.json({ folder: req.params.folder, files });
  } catch (error) { apiError(res, error, error.code === 'ENOENT' ? 404 : 400); }
});
app.get('/api/chapters/:folder/files/:file', async (req, res) => { try { const target = filePath(req.params.folder, req.params.file); const [content, stat] = await Promise.all([fs.readFile(target, 'utf8'), fs.stat(target)]); res.json({ folder: req.params.folder, file: req.params.file, content, updatedAt: stat.mtime.toISOString() }); } catch (error) { apiError(res, error, error.code === 'ENOENT' ? 404 : 400); } });
app.put('/api/chapters/:folder/files/:file', async (req, res) => { try { const target = filePath(req.params.folder, req.params.file); if (typeof req.body?.content !== 'string') throw new Error('File content must be a string'); await fs.writeFile(target, req.body.content, 'utf8'); res.json({ ok: true, folder: req.params.folder, file: req.params.file, savedAt: new Date().toISOString() }); } catch (error) { apiError(res, error, error.code === 'ENOENT' ? 404 : 400); } });
app.post('/api/chapters/:folder/files', async (req, res) => { try { const file = cleanFileName(req.body?.name, req.body?.type); const target = path.join(folderPath(req.params.folder), file); ensureInsideData(target); await fs.writeFile(target, typeof req.body?.content === 'string' ? req.body.content : req.body?.type === 'css' ? '/* New chapter stylesheet */\n' : '<h1>New topic</h1>\n', { encoding: 'utf8', flag: 'wx' }); res.status(201).json({ file, type: file.endsWith('.css') ? 'css' : 'html', content: await fs.readFile(target, 'utf8') }); } catch (error) { apiError(res, error, error.code === 'EEXIST' ? 409 : error.code === 'ENOENT' ? 404 : 400); } });
app.patch('/api/chapters/:folder/files/:file', async (req, res) => { try { const current = filePath(req.params.folder, req.params.file); const next = cleanFileName(req.body?.name, req.params.file.endsWith('.css') ? 'css' : 'html'); const target = path.join(folderPath(req.params.folder), next); ensureInsideData(target); await fs.rename(current, target); res.json({ ok: true, oldName: req.params.file, file: next }); } catch (error) { apiError(res, error, error.code === 'EEXIST' ? 409 : error.code === 'ENOENT' ? 404 : 400); } });
app.delete('/api/chapters/:folder/files/:file', async (req, res) => { try { await fs.unlink(filePath(req.params.folder, req.params.file)); res.json({ ok: true, file: req.params.file }); } catch (error) { apiError(res, error, error.code === 'ENOENT' ? 404 : 400); } });
app.get('/api/question-index', async (_req, res) => { try { res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate').set('Pragma', 'no-cache').set('Expires', '0').json(await indexQuestionData()); } catch (error) { apiError(res, error, 500); } });
app.post('/api/question-index/dry-run', async (req, res) => {
  try {
    const source = String(req.body?.source || ''); const questions = parseQuestionBlocks(source);
    if (!questions.length) throw new Error('No <Qn> question blocks were found.');
    const routes = [];
    for (const question of questions) {
      const issues = validateQuestion(question); const targets = [];
      for (const mid of question.mids) targets.push({ ...(await resolveTarget(mid)), requestedMid: mid });
      const unique = [...new Map(targets.map((target) => [`${target.folder}/${target.file}/${target.conceptMid}`, target])).values()];
      routes.push({ index: question.index, text: question.text, type: question.type, mids: question.mids, gap: question.gap, issues, targets: unique, duplicate: false });
    }
    res.json({ routes, valid: routes.every((route) => !route.issues.length), mapped: routes.filter((route) => route.targets.some((target) => target.kind === 'mapped')).length, unmapped: routes.filter((route) => route.targets.some((target) => target.kind !== 'mapped')).length });
  } catch (error) { apiError(res, error); }
});
app.post('/api/question-index/commit', async (req, res) => {
  try {
    const questions = parseQuestionBlocks(String(req.body?.source || ''));
    if (!questions.length) throw new Error('No <Qn> question blocks were found.');
    const issues = questions.flatMap((question) => validateQuestion(question).map((message) => `Q${question.index}: ${message}`));
    if (issues.length) return res.status(422).json({ error: 'Fix validation issues before committing.', issues });
    if (req.body?.allowUnknown !== true) {
      for (const question of questions) for (const mid of question.mids) {
        const target = await resolveTarget(mid);
        if (target.kind === 'unknown-concept') return res.status(409).json({ error: `Confirm routing missing concept ${target.requestedMid} to ${target.conceptMid} in the dry-run preview.` });
      }
    }
    const changed = new Map(); const added = []; const duplicates = []; const warnings = [];
    for (const question of questions) {
      const targets = [];
      for (const mid of question.mids) targets.push(await resolveTarget(mid));
      const uniqueTargets = [...new Map(targets.map((target) => [`${target.folder}/${target.file}/${target.conceptMid}`, target])).values()];
      for (const target of uniqueTargets) {
        if (target.kind === 'missing-global') { warnings.push(`No Global Unmapped folder is configured for ${question.mids.join('/')}.`); continue; }
        const file = path.join(folderPath(target.folder), target.file);
        let content = changed.has(file) ? changed.get(file) : target.kind === 'unmapped' ? await getOrCreateUnmapped(target.folder, rootOf(target.conceptMid)) : await fs.readFile(file, 'utf8');
        const wrapped = wrapConceptFile(content, target.conceptMid);
        if (!wrapped.found) { warnings.push(`${target.conceptMid} has no matching wrapper in ${target.folder}/${target.file}.`); continue; }
        const result = wrapped.insert(question.block);
        if (result.duplicate) duplicates.push({ text: question.text, mid: target.conceptMid });
        else { changed.set(file, result.content); added.push({ folder: target.folder, file: target.file, mid: target.conceptMid }); }
      }
    }
    await atomicWriteBatch(changed);
    res.json({ ok: true, added, duplicates, warnings, index: await indexQuestionData() });
  } catch (error) { apiError(res, error, error.code === 'ENOENT' ? 404 : 400); }
});
app.post('/api/question-index/resync', async (_req, res) => {
  try {
    const { chapters } = await indexQuestionData(); const changes = new Map(); const moved = []; const conflicts = [];
    for (const chapter of chapters.filter((row) => row.rootMid && row.rootMid !== 'UN')) {
      const unmappedPath = path.join(folderPath(chapter.folder), 'unmapped.html'); let source;
      try { source = await fs.readFile(unmappedPath, 'utf8'); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      let nextSource = source;
      const questions = parseQuestionBlocks(source).filter((question) => question.mids.some((mid) => rootOf(mid) === chapter.rootMid && conceptOf(mid) !== 'UN'));
      for (const question of questions) {
        let allSafe = true; const destinations = [];
        for (const mid of question.mids.filter((value) => rootOf(value) === chapter.rootMid && conceptOf(value) !== 'UN')) {
          const dest = await locateConcept(chapter.folder, mid);
          if (!dest) { allSafe = false; conflicts.push({ text: question.text, mid, reason: 'Concept wrapper not found' }); continue; }
          const key = path.join(folderPath(dest.folder), dest.file); const content = changes.has(key) ? changes.get(key) : dest.content;
          const wrapper = wrapConceptFile(content, mid);
          if (!wrapper.found) { allSafe = false; conflicts.push({ text: question.text, mid, reason: 'Concept wrapper not found' }); continue; }
          const result = wrapper.insert(question.block);
          if (!result.duplicate) changes.set(key, result.content);
          destinations.push(mid);
        }
        if (allSafe && destinations.length) {
          nextSource = nextSource.replace(question.block, ''); moved.push({ text: question.text, mids: destinations });
        }
      }
      if (nextSource !== source) changes.set(unmappedPath, nextSource);
    }
    await atomicWriteBatch(changes);
    res.json({ ok: true, moved, conflicts, index: await indexQuestionData() });
  } catch (error) { apiError(res, error, error.code === 'ENOENT' ? 404 : 400); }
});
app.get('/api/tracker', async (_req, res) => {
  try {
    const chapters = await trackerChapterInventory();
    for (const chapter of chapters.filter((row) => row.status === 'ready')) {
      try {
        const record = await readOrSyncTracker(chapter.folder, chapter.rootMid, chapter.name);
        chapter.questionCount = Object.values(record.ledger.concepts).reduce((sum, questions) => sum + Object.keys(questions).length, 0);
        chapter.conceptCount = Object.keys(record.ledger.concepts).length;
        chapter.completionPercent = record.metrics.completionPercent;
        chapter.timingLocked = record.ledger.timingConfig.locked === true;
      } catch (error) { chapter.status = 'ledger-error'; chapter.issue = error.message; chapter.errorCode = error.code || 'TRACKER_ERROR'; }
    }
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate').json({ chapters });
  } catch (error) { trackerApiError(res, error); }
});
app.get('/api/tracker/:folder', async (req, res) => {
  try {
    const folder = req.params.folder;
    const chapter = (await trackerChapterInventory()).find((row) => row.folder === folder);
    if (!chapter) throw new TrackerError('CHAPTER_NOT_FOUND', `Folder ${folder} was not found.`, 404);
    if (chapter.status !== 'ready') throw new TrackerError(chapter.status.toUpperCase().replace(/-/g, '_'), chapter.issue, 409, [{ folder, rootMids: chapter.rootMids }]);
    const record = await readOrSyncTracker(folder, chapter.rootMid, chapter.name);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate').json({ chapter, ...record });
  } catch (error) { trackerApiError(res, error); }
});
app.put('/api/tracker/:folder/timing', async (req, res) => {
  try {
    const folder = req.params.folder;
    const chapter = (await trackerChapterInventory()).find((row) => row.folder === folder);
    if (!chapter) throw new TrackerError('CHAPTER_NOT_FOUND', `Folder ${folder} was not found.`, 404);
    if (chapter.status !== 'ready') throw new TrackerError(chapter.status.toUpperCase().replace(/-/g, '_'), chapter.issue, 409);
    const saved = await withTrackerLock(folder, async () => {
      const record = await readOrSyncTracker(folder, chapter.rootMid, chapter.name, true);
      if (record.ledger.timingConfig.locked === true) throw new TrackerError('TIMING_ALREADY_LOCKED', 'Timing limits are already locked. Use the confirmed chapter reset to re-enter them.', 409);
      const timingConfig = { locked: true, fastLimit: req.body?.fastLimit, mediumLimit: req.body?.mediumLimit, slowLimit: req.body?.slowLimit };
      const validation = TrackerEngine.timingConfigErrors(timingConfig);
      if (validation.length) throw new TrackerError('INVALID_TIMING_CONFIG', 'Timing limits were not saved. Enter positive integers with strict Fast < Medium < Slow ordering.', 422, validation);
      record.ledger.timingConfig = timingConfig;
      const valid = TrackerEngine.calculateMetrics(record.ledger);
      if (!valid.ok) throw new TrackerError('LEDGER_VALIDATION_FAILED', 'Timing limits were not saved because the ledger is invalid.', 409, valid.errors);
      const pathname = path.join(folderPath(folder), 'tracker-ledger.json');
      await atomicWriteBatch(new Map([[pathname, `${JSON.stringify(record.ledger, null, 2)}\n`]]));
      return { ledger: record.ledger, metrics: valid.metrics, invariants: valid.invariants };
    });
    res.json({ ok: true, ...saved });
  } catch (error) { trackerApiError(res, error); }
});
app.post('/api/tracker/:folder/reset', async (req, res) => {
  try {
    const folder = req.params.folder;
    if (req.body?.confirm !== true) throw new TrackerError('CONFIRMATION_REQUIRED', 'Explicit confirmation is required before clearing a chapter tracker.', 400);
    const chapter = (await trackerChapterInventory()).find((row) => row.folder === folder);
    if (!chapter) throw new TrackerError('CHAPTER_NOT_FOUND', `Folder ${folder} was not found.`, 404);
    if (chapter.status !== 'ready') throw new TrackerError(chapter.status.toUpperCase().replace(/-/g, '_'), chapter.issue, 409);
    const reset = await withTrackerLock(folder, async () => {
      const record = await readOrSyncTracker(folder, chapter.rootMid, chapter.name, true);
      TrackerEngine.clearAttempts(record.ledger);
      const valid = TrackerEngine.calculateMetrics(record.ledger);
      if (!valid.ok) throw new TrackerError('LEDGER_VALIDATION_FAILED', 'The reset could not be saved because the ledger is invalid.', 409, valid.errors);
      const pathname = path.join(folderPath(folder), 'tracker-ledger.json');
      await atomicWriteBatch(new Map([[pathname, `${JSON.stringify(record.ledger, null, 2)}\n`]]));
      return { ledger: record.ledger, metrics: valid.metrics, invariants: valid.invariants };
    });
    res.json({ ok: true, ...reset });
  } catch (error) { trackerApiError(res, error); }
});
app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'angles' }));
app.use(express.static(PUBLIC_DIR));
app.get(/^(?!\/api(?:\/|$)|\/manus-routes\.json$).*/, (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
ensureData().then(ensureGlobalUnmapped).then(ensureRegisteredUnmappedFiles).then(() => app.listen(PORT, '0.0.0.0', () => console.log(`Angles listening on ${PORT}`))).catch((error) => { console.error(error); process.exit(1); });
