'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'angles-question-index-'));
  const server = path.join(__dirname, '..', 'server.js');
  const port = await new Promise((resolve, reject) => { const listener = net.createServer(); listener.once('error', reject); listener.listen(0, '127.0.0.1', () => { const value = listener.address().port; listener.close(() => resolve(value)); }); });
  const child = spawn(process.execPath, [server], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(port), ANGLES_DATA_DIR: temp }, stdio: 'inherit' });
  const base = `http://127.0.0.1:${port}`;
  async function api(route, options = {}) { const response = await fetch(base + route, { headers: { 'Content-Type': 'application/json' }, ...options }); const json = await response.json(); if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(json)}`); return json; }
  try {
    let ready = false; let lastError = null;
    for (let i = 0; i < 100; i++) { try { await api('/api/health'); ready = true; break; } catch (error) { lastError = error; await new Promise((r) => setTimeout(r, 100)); } }
    if (!ready) console.error('Health probe cause:', lastError?.cause);
    assert.ok(ready, `server started: ${lastError?.message || 'unknown startup error'}`);
    await api('/api/chapters', { method: 'POST', body: JSON.stringify({ name: 'Pronouns', mid: 'pn' }) });
    await api('/api/chapters/Pronouns/files', { method: 'POST', body: JSON.stringify({ name: 'notes', type: 'html', content: '<mid = c1><h2>Case Matrix</h2></mid>\n<mid = c2><h2>Pronoun Order</h2></mid>' }) });
    await api('/api/chapters', { method: 'POST', body: JSON.stringify({ name: 'Verbs', mid: 'VB' }) });
    await api('/api/chapters/Verbs/files', { method: 'POST', body: JSON.stringify({ name: 'notes', type: 'html', content: '<mid = c1><h2>Verb Agreement</h2></mid>' }) });
    const compound = '<Qn><mid = PN.C1 / PN.C2><type = Error Spotting><text = The compound prompt?><Options><A = Yes><B = No></Options><answer = A></Qn>';
    const unmapped = '<Qn><mid = PN.UN><type = fill in the blanks><gap = Pronoun Order><text = Missing concept prompt?><Options><A = Yes><B = No></Options><answer = B></Qn>';
    const batch = `<qn-ingest>${compound}${unmapped}</qn-ingest>`;
    const dry = await api('/api/question-index/dry-run', { method: 'POST', body: JSON.stringify({ source: batch }) });
    assert.equal(dry.valid, true);
    assert.equal(dry.routes.length, 2);
    assert.equal(dry.routes[0].targets.filter((x) => x.kind === 'mapped').length, 2);
    assert.equal(dry.routes[1].targets[0].conceptMid, 'PN.UN');
    const committed = await api('/api/question-index/commit', { method: 'POST', body: JSON.stringify({ source: batch }) });
    assert.equal(committed.added.length, 3, 'compound copied twice plus one unmapped question');
    const repeat = await api('/api/question-index/commit', { method: 'POST', body: JSON.stringify({ source: `<qn-ingest>${compound}</qn-ingest>` }) });
    assert.equal(repeat.added.length, 0);
    assert.equal(repeat.duplicates.length, 2, 'text-only duplicate check applies within both target concepts');
    let index = await api('/api/question-index');
    const pn = index.chapters.find((c) => c.rootMid === 'PN');
    assert.equal(pn.mappedUnique, 1);
    assert.equal(pn.unmappedCount, 1);
    assert.equal(pn.readiness.label, '50%');
    assert.deepEqual(pn.typeCounts, { 'ERROR SPOTTING': 1, 'FILL IN THE BLANKS': 1 });
    assert.deepEqual(pn.gaps, [{ label: 'Pronoun Order', count: 1 }]);
    let note = await api('/api/chapters/Pronouns/files/notes.html');
    await api('/api/chapters/Pronouns/files/notes.html', { method: 'PUT', body: JSON.stringify({ content: `${note.content}\n<mid = c3><h2>New concept</h2></mid>` }) });
    let unFile = await api('/api/chapters/Pronouns/files/unmapped.html');
    assert.match(unFile.content, /PN\.UN/);
    const promoted = unFile.content.replace('<mid = PN.UN>', '<mid = PN.C3>');
    await api('/api/chapters/Pronouns/files/unmapped.html', { method: 'PUT', body: JSON.stringify({ content: promoted }) });
    const resync = await api('/api/question-index/resync', { method: 'POST', body: '{}' });
    assert.equal(resync.moved.length, 1);
    unFile = await api('/api/chapters/Pronouns/files/unmapped.html');
    assert.doesNotMatch(unFile.content, /Missing concept prompt/);
    note = await api('/api/chapters/Pronouns/files/notes.html');
    assert.match(note.content, /Missing concept prompt/);
    index = await api('/api/question-index');
    const readiness = index.chapters.find((c) => c.rootMid === 'PN').readiness;
    assert.equal(readiness.label, '100%');
    const cross = '<Qn><mid = PN.C1 / VB.C1><type = Sentence Improvement><text = Cross chapter prompt?><Options><A = Yes><B = No></Options><answer = A></Qn>';
    const crossResult = await api('/api/question-index/commit', { method: 'POST', body: JSON.stringify({ source: `<qn-ingest>${cross}</qn-ingest>` }) });
    assert.equal(crossResult.added.length, 2);
    console.log('Question Index API integration passed: compound routing, unmapped gaps, text deduplication, cross-chapter MIDs, and re-sync.');
  } finally {
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
    await fs.rm(temp, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
