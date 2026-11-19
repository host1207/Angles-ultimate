const state = { page: 'folders', chapters: [], selectedFolder: null, files: [], activeFile: null, activeContent: '', activeHtmlFile: null, activeHtmlContent: '', saveTimer: null, gridOn: true, creationType: null, previewRevision: 0, previewZoom: 1, previewRows: 70, previewCols: 75, previewCellWidth: 0, flowBoxObserver: null, canvasPan: false, panPointer: null, diagramQuestionGroups: [], diagramReturnScroll: null, questionIndex: null, questionRoot: '', dryRun: null };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const formatName = (value) => value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

async function api(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}
function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('is-visible'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 2400); }
function setPage(page) { const previousPage = state.page; state.page = page; $$('.page').forEach((section) => section.classList.toggle('is-visible', section.dataset.route === page)); $$('.nav-item').forEach((button) => button.classList.toggle('is-active', button.dataset.page === page)); if (page === 'preview' && previousPage !== 'diagram-questions') renderPreview(); if (page === 'question-index' && window.refreshQuestionIndex) void window.refreshQuestionIndex(); if (page === 'tracker' && window.refreshTracker) void window.refreshTracker(); window.history.replaceState({}, '', page === 'folders' ? '/' : `/#${page}`); }

function renderFolders() {
  const grid = $('#chapter-grid'); $('#folder-empty').classList.toggle('is-hidden', state.chapters.length > 0);
  $('#chapter-total').textContent = state.chapters.length; $('#note-total').textContent = state.chapters.reduce((total, chapter) => total + chapter.htmlCount, 0);
  grid.innerHTML = state.chapters.map((chapter, index) => `<article class="chapter-card" data-folder="${escapeHtml(chapter.folder)}" tabindex="0" role="button" aria-label="Open ${escapeHtml(chapter.name)} chapter"><div class="chapter-card-top"><span class="chapter-number">${String(index + 1).padStart(2, '0')}</span><span class="chapter-arrow">↗</span></div><div><h2 class="chapter-name">${escapeHtml(chapter.name)}</h2><span class="chapter-slug">/${escapeHtml(chapter.folder)}/</span></div><div class="chapter-meta"><strong>${chapter.htmlCount}</strong> ${chapter.htmlCount === 1 ? 'HTML note' : 'HTML notes'}<span>·</span><span>${chapter.cssCount || 0} CSS</span></div></article>`).join('');
  $$('.chapter-card').forEach((card) => { const open = () => openChapter(card.dataset.folder); card.addEventListener('click', open); card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } }); });
}
async function loadChapters() { try { state.chapters = (await api('/api/chapters')).chapters; renderFolders(); } catch (error) { showToast(error.message); } }
function setSaveStatus(text, mode = '') { const status = $('#save-status'); status.className = `save-status ${mode ? `is-${mode}` : ''}`; status.innerHTML = `<span class="status-dot"></span> ${text}`; }
function updateEditorMeta() { $('#editor-chapter-breadcrumb').textContent = state.selectedFolder ? formatName(state.selectedFolder) : 'Chapter'; $('#editor-file-name').textContent = state.activeFile || 'Select a file'; $('#char-count').textContent = `${state.activeContent.length.toLocaleString()} characters`; $('#line-numbers').textContent = Array.from({ length: Math.max(1, state.activeContent.split('\n').length) }, (_, index) => index + 1).join('\n'); }

function renderFileList() {
  $('#file-list').innerHTML = state.files.map((file) => `<div class="file-item ${file.name === state.activeFile ? 'is-active' : ''} ${file.type === 'css' ? 'is-css' : ''}" data-file="${escapeHtml(file.name)}"><span class="file-icon">${file.type === 'css' ? '◈' : '◇'}</span><button class="file-open" type="button">${escapeHtml(file.name)}</button><span class="file-actions"><button class="file-action file-rename" type="button" title="Rename">✎</button><button class="file-action file-delete" type="button" title="Delete">×</button></span></div>`).join('');
  $$('.file-open').forEach((button) => button.addEventListener('click', () => openFile(button.closest('.file-item').dataset.file)));
  $$('.file-rename').forEach((button) => button.addEventListener('click', () => renameFile(button.closest('.file-item').dataset.file)));
  $$('.file-delete').forEach((button) => button.addEventListener('click', () => deleteFile(button.closest('.file-item').dataset.file)));
}
async function loadFiles(folder) { const result = await api(`/api/chapters/${encodeURIComponent(folder)}/files`); state.files = result.files; $('#sidebar-chapter-name').textContent = formatName(folder); renderFileList(); }
async function openChapter(folder) { await flushSave(); state.selectedFolder = folder; state.activeFile = null; state.activeHtmlFile = null; state.activeHtmlContent = ''; await loadFiles(folder); const firstFile = state.files.find((file) => file.type === 'html') || state.files[0]; if (firstFile) await openFile(firstFile.name); setPage('coding'); }
async function openFile(file) { if (!state.selectedFolder) return; await flushSave(); try { setSaveStatus('Opening…', 'saving'); const result = await api(`/api/chapters/${encodeURIComponent(state.selectedFolder)}/files/${encodeURIComponent(file)}`); state.activeFile = file; state.activeContent = result.content; if (file.endsWith('.html')) { state.activeHtmlFile = file; state.activeHtmlContent = result.content; } $('#code-editor').value = result.content; updateEditorMeta(); await loadFiles(state.selectedFolder); setSaveStatus('Saved to disk'); } catch (error) { showToast(error.message); setSaveStatus('Could not open', 'dirty'); } }
async function saveCurrentFile() { if (!state.selectedFolder || !state.activeFile) return; const content = $('#code-editor').value; state.activeContent = content; setSaveStatus('Saving…', 'saving'); try { await api(`/api/chapters/${encodeURIComponent(state.selectedFolder)}/files/${encodeURIComponent(state.activeFile)}`, { method: 'PUT', body: JSON.stringify({ content }) }); setSaveStatus('Saved to disk'); if (state.activeFile.endsWith('.html') && window.refreshQuestionIndex) void window.refreshQuestionIndex(); } catch (error) { setSaveStatus('Save failed', 'dirty'); showToast(error.message); } updateEditorMeta(); }
function queueSave() { state.activeContent = $('#code-editor').value; updateEditorMeta(); setSaveStatus('Unsaved changes', 'dirty'); clearTimeout(state.saveTimer); state.saveTimer = setTimeout(saveCurrentFile, 650); }
async function flushSave() { clearTimeout(state.saveTimer); if (state.selectedFolder && state.activeFile && $('#code-editor').value !== state.activeContent) await saveCurrentFile(); }

function openCreator(type) { state.creationType = type; $('#inline-file-label').textContent = type === 'css' ? 'New Style.css' : 'New Topic.html'; $('#inline-file-input').value = ''; $('#inline-file-creator').classList.remove('is-hidden'); $('#inline-file-input').focus(); }
function closeCreator() { state.creationType = null; $('#inline-file-creator').classList.add('is-hidden'); }
async function submitCreator() { const input = $('#inline-file-input'); const name = input.value.trim(); if (!name || !state.selectedFolder) return; try { const result = await api(`/api/chapters/${encodeURIComponent(state.selectedFolder)}/files`, { method: 'POST', body: JSON.stringify({ name, type: state.creationType }) }); closeCreator(); await loadFiles(state.selectedFolder); await openFile(result.file); showToast(`${result.file} created on disk`); } catch (error) { showToast(error.message); } }
async function renameFile(file) { const base = file.replace(/\.(html|css)$/i, ''); const name = window.prompt(`Rename ${file}:`, base); if (!name || name === base) return; try { const result = await api(`/api/chapters/${encodeURIComponent(state.selectedFolder)}/files/${encodeURIComponent(file)}`, { method: 'PATCH', body: JSON.stringify({ name }) }); if (state.activeFile === file) state.activeFile = result.file; if (state.activeHtmlFile === file) state.activeHtmlFile = result.file; await loadFiles(state.selectedFolder); updateEditorMeta(); showToast(`${result.file} renamed`); } catch (error) { showToast(error.message); } }
async function deleteFile(file) { if (!window.confirm(`Delete ${file} from disk?`)) return; try { await flushSave(); await api(`/api/chapters/${encodeURIComponent(state.selectedFolder)}/files/${encodeURIComponent(file)}`, { method: 'DELETE' }); if (state.activeFile === file) { state.activeFile = null; state.activeContent = ''; $('#code-editor').value = ''; } if (state.activeHtmlFile === file) { state.activeHtmlFile = null; state.activeHtmlContent = ''; } await loadFiles(state.selectedFolder); const next = state.files.find((item) => item.type === 'html') || state.files[0]; if (next) await openFile(next.name); else updateEditorMeta(); showToast(`${file} deleted`); } catch (error) { showToast(error.message); } }

function insertSnippet(kind) {
  const snippets = {
    math: '<math == x/y>',
    table: '<table r = 2 c = 3>\n  <c11 = S.No> <c12 = Rule> <c13 = Example>\n  <c21 = 1> <c22 = Your rule> <c23 = Write an example.>\n</table>',
    question: '<qn all>\n  <Qn>\n    <text = Write the question here.>\n    <Options>\n      <A = Option one>\n      <B = Option two>\n    </Options>\n    <answer = B>\n    <explanation = Add the reasoning here.>\n  </Qn>\n</qn all>',
    tags: '<x = incorrect> <ok = corrected> <hide == reveal me>\n<rule == Add a grammar rule.>\n<trap == Add an exam trap.>\n<chain == Step one -> Step two -> Step three>',
    grid: '<grid id="spatial-note" class="spatial-card">\n  <h2>Spatial note</h2>\n  <p>Place this box on the graph sheet.</p>\n</grid>'
  };
  const editor = $('#code-editor'); const start = editor.selectionStart; const end = editor.selectionEnd;
  editor.setRangeText((start > 0 && editor.value[start - 1] !== '\n' ? '\n' : '') + (snippets[kind] || '') + '\n', start, end, 'end');
  editor.focus(); queueSave();
}
function compileAngles(source) { return window.MKML.compile(source); }

function setQuestionRlVisibility(card, visible) {
  card.querySelectorAll('.mkml-rl-target').forEach((item) => item.classList.toggle('is-rl-hidden', !visible));
}
function stopQuizTimer(group, clear = false) {
  if (group._quizTimerId) window.clearInterval(group._quizTimerId);
  group._quizTimerId = null;
  if (clear) {
    group._quizTimerStarted = null;
    const timer = group.querySelector('.quiz-group-timer');
    if (timer) { timer.textContent = ''; timer.hidden = true; }
  }
}
function startQuizTimer(group) {
  if (group._quizTimerStarted != null) return;
  group._quizTimerStarted = performance.now();
  const timer = group.querySelector('.quiz-group-timer');
  if (!timer) return;
  timer.hidden = false;
  const update = () => { timer.textContent = `Time: ${((performance.now() - group._quizTimerStarted) / 1000).toFixed(1)} s`; };
  update();
  group._quizTimerId = window.setInterval(update, 100);
}
function updateQuizProgress(group, submittedScore = null) {
  const cards = [...group.querySelectorAll('.question-card')];
  const answered = cards.filter((card) => Boolean(card.dataset.selected)).length;
  const progress = group.querySelector('.quiz-progress');
  if (!progress) return;
  progress.textContent = submittedScore == null
    ? `Answered ${answered} / ${cards.length}`
    : `Answered ${answered} / ${cards.length} · Score ${submittedScore} / ${cards.length}`;
}
function revealQuizCard(card) {
  const answer = card.dataset.answer;
  const selected = card.dataset.selected || '';
  const options = [...card.querySelectorAll('.answer-option')];
  options.forEach((option) => {
    option.classList.remove('is-selected', 'is-correct', 'is-incorrect');
    option.disabled = true;
    if (option.dataset.answer === answer) option.classList.add('is-correct');
    if (selected && option.dataset.answer === selected) {
      option.classList.add('is-selected');
      if (selected !== answer) option.classList.add('is-incorrect');
    }
  });
  card.classList.add('is-revealed');
  card.dataset.locked = 'true';
  setQuestionRlVisibility(card, true);
  const explanation = card.querySelector('.explanation');
  if (explanation) explanation.hidden = false;
  const explainButton = card.querySelector('.quiz-explanation');
  if (explainButton) explainButton.hidden = true;
  const result = card.querySelector('.question-result');
  if (result) {
    result.textContent = selected
      ? (selected === answer ? 'CORRECT — KEEP THE RULE.' : `NOT QUITE — ANSWER: ${answer.toUpperCase()}`)
      : `ANSWER: ${answer.toUpperCase()}`;
  }
  return Boolean(selected && selected === answer);
}
function resetQuizGroup(group, mode) {
  stopQuizTimer(group, true);
  group.dataset.mode = mode;
  delete group.dataset.submitted;
  const toggle = group.querySelector('.quiz-mode-toggle');
  if (toggle) { toggle.textContent = `Mode: ${mode === 'exam' ? 'Exam' : 'Normal'}`; toggle.setAttribute('aria-pressed', String(mode === 'exam')); }
  const submit = group.querySelector('.quiz-group-submit');
  if (submit) { submit.hidden = mode !== 'exam'; submit.disabled = false; submit.textContent = 'Submit'; }
  group.querySelectorAll('.question-card').forEach((card) => {
    card.dataset.mode = mode;
    delete card.dataset.selected;
    delete card.dataset.locked;
    card.classList.remove('is-revealed', 'has-selection');
    card.querySelectorAll('.answer-option').forEach((option) => { option.disabled = false; option.classList.remove('is-selected', 'is-correct', 'is-incorrect'); });
    const explanation = card.querySelector('.explanation');
    if (explanation) explanation.hidden = true;
    const explainButton = card.querySelector('.quiz-explanation');
    if (explainButton) explainButton.hidden = mode !== 'exam';
    const result = card.querySelector('.question-result');
    if (result) result.textContent = '';
    setQuestionRlVisibility(card, false);
  });
  updateQuizProgress(group);
}
function bindQuizGroups(root) {
  root.querySelectorAll('.quiz-group').forEach((group) => {
    const initialMode = group.dataset.mode === 'exam' ? 'exam' : 'normal';
    resetQuizGroup(group, initialMode);
    group.querySelector('.quiz-mode-toggle')?.addEventListener('click', () => resetQuizGroup(group, group.dataset.mode === 'exam' ? 'normal' : 'exam'));
    group.querySelector('.quiz-group-submit')?.addEventListener('click', () => {
      if (group.dataset.mode !== 'exam' || group.dataset.submitted) return;
      const cards = [...group.querySelectorAll('.question-card')];
      const score = cards.reduce((total, card) => total + Number(revealQuizCard(card)), 0);
      group.dataset.submitted = 'true';
      stopQuizTimer(group);
      const submit = group.querySelector('.quiz-group-submit');
      if (submit) { submit.disabled = true; submit.textContent = 'Submitted'; }
      updateQuizProgress(group, score);
    });
    group.querySelectorAll('.quiz-explanation').forEach((button) => button.addEventListener('click', () => {
      const card = button.closest('.question-card');
      if (group.dataset.mode !== 'exam' || !card || card.dataset.locked) return;
      revealQuizCard(card);
    }));
    group.querySelectorAll('.answer-option').forEach((button) => button.addEventListener('click', () => {
      const card = button.closest('.question-card');
      if (!card || card.dataset.locked || group.dataset.submitted) return;
      card.dataset.selected = button.dataset.answer;
      card.querySelectorAll('.answer-option').forEach((option) => option.classList.toggle('is-selected', option === button));
      if (group.dataset.mode === 'normal') revealQuizCard(card);
      else startQuizTimer(group);
      updateQuizProgress(group);
    }));
  });
}
function prepareDiagramQuestionThumbnails(root) {
  state.diagramQuestionGroups = [];
  root.querySelectorAll('.mkml-flow-box').forEach((box) => {
    const groups = [...box.querySelectorAll('.mkml-flow-box-content .quiz-group')]
      .filter((group) => group.closest('.mkml-flow-box') === box);
    groups.forEach((group) => {
      const count = Number(group.dataset.questionCount) || group.querySelectorAll('.question-card').length;
      const index = state.diagramQuestionGroups.push({ group: group.cloneNode(true), count }) - 1;
      const thumbnail = document.createElement('button');
      thumbnail.type = 'button';
      thumbnail.className = 'mkml-qn-thumbnail';
      thumbnail.setAttribute('aria-label', `Open ${count} ${count === 1 ? 'question' : 'questions'}`);
      const countText = document.createElement('strong');
      countText.textContent = String(count);
      const label = document.createElement('span');
      label.textContent = count === 1 ? 'question' : 'questions';
      const openMark = document.createElement('span');
      openMark.className = 'mkml-qn-open-mark';
      openMark.textContent = '↗';
      thumbnail.append(countText, label, openMark);
      thumbnail.addEventListener('click', () => openDiagramQuestionPage(index));
      group.replaceWith(thumbnail);
    });
  });
}
function openDiagramQuestionPage(index) {
  const entry = state.diagramQuestionGroups[index];
  if (!entry) return;
  const viewport = $('#preview-viewport');
  state.diagramReturnScroll = { left: viewport.scrollLeft, top: viewport.scrollTop };
  $('#diagram-question-title').textContent = `Question set ${index + 1}`;
  $('#diagram-question-count').textContent = `${entry.count} ${entry.count === 1 ? 'question' : 'questions'} in this diagram node.`;
  const list = $('#diagram-question-list');
  list.replaceChildren();
  if (entry.count === 0) {
    const empty = document.createElement('div');
    empty.className = 'diagram-question-empty';
    empty.textContent = 'This question placeholder is empty. Add <Qn>…</Qn> cards inside its <qn all> container in the note source.';
    list.append(empty);
  } else {
    const group = entry.group.cloneNode(true);
    list.append(group);
    window.MKML.renderMath(list);
    bindQuizGroups(list);
  }
  setPage('diagram-questions');
}
function returnToDiagram() {
  setPage('preview');
  const viewport = $('#preview-viewport');
  const position = state.diagramReturnScroll;
  requestAnimationFrame(() => {
    if (position) { viewport.scrollLeft = position.left; viewport.scrollTop = position.top; }
    renderVisibleGridLabels();
  });
}

async function loadChapterStyles(source, revision = state.previewRevision) {
  const cssFiles = state.files.filter((file) => file.type === 'css').map((file) => file.name);
  const linked = [...source.matchAll(/<link[^>]+href=["']([^"']+\.css)["'][^>]*>/gi)].map((match) => match[1].split('/').pop());
  const names = [...new Set([...cssFiles, ...linked].filter((name) => state.files.some((file) => file.type === 'css' && file.name === name)))];
  const contents = await Promise.all(names.map(async (name) => { try { return (await api(`/api/chapters/${encodeURIComponent(state.selectedFolder)}/files/${encodeURIComponent(name)}`)).content; } catch { return ''; } }));
  if (revision !== state.previewRevision) return;
  const requestedCssIds = [...new Set([...source.matchAll(/<link-css-id\s*:\s*([\w.-]+)\s*>|<link\s*=\s*([\w.-]+)\s*>/gi)].map((match) => match[1] || match[2]))];
  const availableCssIds = new Set(contents.flatMap((css) => [...String(css || '').matchAll(/<css-id\s*:\s*([\w.-]+)\s*>/gi)].map((match) => match[1])));
  const missingCssIds = requestedCssIds.filter((id) => !availableCssIds.has(id));
  if (missingCssIds.length) missingCssIds.forEach((id) => console.warn(`Warning: CSS ID ${id} not found. Rendering with default styles.`));
  else if (requestedCssIds.length) console.info(`[Angles] Linked CSS IDs: ${requestedCssIds.join(', ')}`);
  let linkedCssContent = '';
  try { linkedCssContent = window.MKML.linkedCss(contents, source); }
  catch (error) { console.warn('Warning: CSS ID resolution failed. Rendering with default styles.', error); }
  if (/<(?:qn\s+all|Qn\s*>|math\s*==|table\s+r\s*=|grid\s+)/i.test(linkedCssContent.replace(/\/\*[\s\S]*?\*\//g, ''))) {
    showToast('Linked CSS contains MKML/HTML. Move that quiz or note markup into the HTML file; CSS IDs are matched.');
  }
  let compiledCss = '';
  try { compiledCss = window.MKML.compileCss(window.MKML.cleanCss(linkedCssContent)); }
  catch (error) { console.warn('Warning: Chapter CSS could not be compiled. Rendering with default styles.', error); }
  if (revision !== state.previewRevision) return;
  const old = document.getElementById('chapter-styles'); if (old) old.remove();
  let style = null;
  if (compiledCss.trim()) { style = document.createElement('style'); style.id = 'chapter-styles'; style.textContent = compiledCss; document.head.appendChild(style); }
  if (requestedCssIds.length) requestAnimationFrame(() => {
    const target = document.getElementById('lmk');
    let rules = [];
    try { rules = style?.sheet ? [...style.sheet.cssRules].filter((rule) => rule.selectorText?.split(',').some((selector) => selector.trim() === '#lmk')) : []; } catch (error) { console.warn('[Angles] CSS diagnostic could not inspect stylesheet rules.', error); }
    console.info('[Angles] CSS link verification', { ids: requestedCssIds, parsedLmkRules: rules.length, targetFound: Boolean(target), computedColor: target ? getComputedStyle(target).color : '(no #lmk element)' });
  });
  const requiredRows = [...compiledCss.matchAll(/--grid-required-row\s*:\s*(\d+)/g)].reduce((max, match) => Math.max(max, Number(match[1])), 35);
  const requiredCols = [...compiledCss.matchAll(/--grid-required-col\s*:\s*(\d+)/g)].reduce((max, match) => Math.max(max, Number(match[1])), 25);
  const gridBoxes = [...$('#preview-canvas').querySelectorAll('.grid-box')];
  const htmlRows = gridBoxes.reduce((max, node) => Math.max(max, Number(node.style.getPropertyValue('--grid-row') || 1) + Number(node.style.getPropertyValue('--grid-row-span') || 1) - 1), 35);
  const htmlCols = gridBoxes.reduce((max, node) => Math.max(max, Number(node.style.getPropertyValue('--grid-col') || 1) + Number(node.style.getPropertyValue('--grid-col-span') || 1) - 1), 25);
  const flowNodes = [...$('#preview-flow-lines-layer').querySelectorAll('[data-max-col], [data-max-row]'), ...$('#preview-flow-boxes-layer').querySelectorAll('[data-max-col], [data-max-row]'), ...$('#preview-flow-lines-m-layer').querySelectorAll('[data-max-col], [data-max-row]')];
  const flowRows = flowNodes.reduce((max, node) => Math.max(max, Number(node.dataset.maxRow) || 1), 35);
  const flowCols = flowNodes.reduce((max, node) => Math.max(max, Number(node.dataset.maxCol) || 1), 25);
  const rows = Math.max(requiredRows, htmlRows, flowRows);
  const cols = Math.max(requiredCols, htmlCols, flowCols, 25);
  const previewContent = $('#preview-content');
  previewContent.style.minHeight = `${rows * 32}px`;
  const contentRows = Math.max(rows, Math.ceil(previewContent.scrollHeight / 32));
  previewContent.style.minHeight = `${contentRows * 32}px`;
  updateGridExtent(contentRows, cols);
  requestAnimationFrame(fitFlowBoxes);
}
function renderPreview() {
  const revision = ++state.previewRevision;
  const previewFile = state.activeFile?.endsWith('.html') ? state.activeFile : state.activeHtmlFile;
  const previewSource = state.activeFile?.endsWith('.html') ? state.activeContent : state.activeHtmlContent;
  $('#preview-file-name').textContent = previewFile || 'your active file';
  $('#preview-chapter-name').textContent = state.selectedFolder ? formatName(state.selectedFolder) : 'no chapter';
  const content = $('#preview-content');
  state.flowBoxObserver?.disconnect();
  state.flowBoxObserver = null;
  $('#preview-canvas').querySelectorAll('.quiz-group').forEach((group) => stopQuizTimer(group, true));
  content.replaceChildren();
  $('#preview-flow-lines-layer').replaceChildren();
  $('#preview-flow-boxes-layer').replaceChildren();
  $('#preview-flow-lines-m-layer').replaceChildren();
  content.style.minHeight = '';
  updateGridExtent(35, 25);
  document.getElementById('chapter-styles')?.remove();
  if (!previewFile || !previewSource) {
    content.innerHTML = '<div class="preview-blank"><span class="preview-blank-mark">∠</span><p>Open an HTML note to see its compiled sheet.</p></div>';
    return;
  }
  try { content.innerHTML = compileAngles(previewSource); }
  catch (error) {
    console.error('Preview compilation failed; showing source as plain text.', error);
    const fallback = document.createElement('pre');
    fallback.className = 'preview-error-fallback';
    fallback.textContent = previewSource;
    content.replaceChildren(fallback);
    return;
  }
  window.MKML.renderMath(content);
  const flowLines = [...content.children].filter((node) => node.matches('.mkml-flow-lines'));
  $('#preview-flow-lines-layer').replaceChildren(...flowLines);
  const overFlowLines = [...content.children].filter((node) => node.matches('.mkml-flow-lines-m'));
  $('#preview-flow-lines-m-layer').replaceChildren(...overFlowLines);
  const flowBoxes = [...content.querySelectorAll('.mkml-flow-box')];
  $('#preview-flow-boxes-layer').replaceChildren(...flowBoxes);
  window.MKML.renderMath($('#preview-flow-boxes-layer'));
  prepareDiagramQuestionThumbnails($('#preview-flow-boxes-layer'));
  observeFlowBoxes($('#preview-flow-boxes-layer'));
  $$('.mkml-spoiler').forEach((item) => {
    const reveal = () => item.classList.toggle('revealed');
    item.addEventListener('click', reveal);
    item.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); reveal(); } });
  });
  void loadChapterStyles(previewSource, revision).catch((error) => console.warn('Warning: Chapter CSS could not be loaded. Rendering with default styles.', error));
  bindQuizGroups($('#preview-canvas'));
}

function setupGridLabels() { renderVisibleGridLabels(); }
function renderVisibleGridLabels() {
  const viewport = $('#preview-viewport');
  const columnLabels = $('#column-labels');
  const rowLabels = $('#row-labels');
  if (!viewport || !columnLabels || !rowLabels) return;
  const zoom = state.previewZoom || 1;
  const cell = state.previewCellWidth || (viewport.clientWidth ? viewport.clientWidth / 25 : 1);
  const visibleCols = Math.ceil((viewport.clientWidth || cell * 25) / (cell * zoom)) + 2;
  const firstCol = Math.max(1, Math.floor(viewport.scrollLeft / (cell * zoom)) + 1);
  const colCount = Math.max(0, Math.min(state.previewCols - firstCol + 1, visibleCols));
  columnLabels.style.left = `${(firstCol - 1) * cell}px`;
  columnLabels.style.top = `${viewport.scrollTop / zoom + 9}px`;
  columnLabels.style.right = 'auto';
  columnLabels.style.width = `${colCount * cell}px`;
  columnLabels.style.gridTemplateColumns = `repeat(${colCount}, ${cell}px)`;
  columnLabels.innerHTML = Array.from({ length: colCount }, (_item, index) => `<span>${firstCol + index}</span>`).join('');
  const visibleRows = Math.ceil((viewport.clientHeight || window.innerHeight) / (32 * zoom)) + 2;
  const firstRow = Math.max(1, Math.floor((viewport.scrollTop / zoom - 47) / 32) + 1);
  const rowCount = Math.max(0, Math.min(state.previewRows - firstRow + 1, visibleRows));
  rowLabels.style.top = `${47 + (firstRow - 1) * 32}px`;
  rowLabels.style.left = `${viewport.scrollLeft / zoom + 11}px`;
  rowLabels.style.gridTemplateRows = `repeat(${rowCount}, 32px)`;
  rowLabels.innerHTML = Array.from({ length: rowCount }, (_item, index) => `<span>${firstRow + index}</span>`).join('');
}
function updateGridExtent(rows = 70, cols = 75) {
  state.previewRows = Math.max(70, Number.isSafeInteger(Number(rows)) ? Number(rows) : 70);
  state.previewCols = Math.max(75, Number.isSafeInteger(Number(cols)) ? Number(cols) : 75);
  $('#preview-canvas')?.querySelectorAll('.mkml-flow-lines, .mkml-flow-lines-m').forEach((svg) => {
    const width = state.previewCols * 100;
    const height = state.previewRows * 32;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('height', String(height));
  });
  setupGridLabels();
  applyPreviewCanvasSize(false);
}
function extendGraphAtViewportEdge() {
  const viewport = $('#preview-viewport');
  if (!viewport || !viewport.clientWidth) return;
  const zoom = state.previewZoom || 1;
  const marginX = Math.max(4 * state.previewCellWidth * zoom, viewport.clientWidth * 0.15);
  const marginY = Math.max(4 * 32 * zoom, viewport.clientHeight * 0.15);
  let rows = state.previewRows;
  let cols = state.previewCols;
  if (viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - marginX) cols += 25;
  if (viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - marginY) rows += 35;
  if (rows !== state.previewRows || cols !== state.previewCols) updateGridExtent(rows, cols);
}
function applyPreviewCanvasSize(fitBoxes = true) {
  const viewport = $('#preview-viewport');
  const canvas = $('#preview-canvas');
  if (!viewport || !canvas || viewport.clientWidth <= 0) return;
  let availableWidth = viewport.clientWidth;
  let cell = availableWidth / 25;
  canvas.style.setProperty('--grid-column-count', String(state.previewCols));
  canvas.style.minHeight = `${Math.max(window.innerHeight - 204, state.previewRows * 32 + 69)}px`;
  canvas.style.zoom = String(state.previewZoom);
  availableWidth = viewport.clientWidth;
  cell = availableWidth / 25;
  state.previewCellWidth = cell;
  canvas.style.setProperty('--grid-cell-width', `${cell}px`);
  canvas.style.width = `${Math.max(availableWidth, cell * state.previewCols)}px`;
  renderVisibleGridLabels();
  if (fitBoxes) fitFlowBoxes();
}
function fitFlowBoxes() {
  const cell = state.previewCellWidth;
  const layer = $('#preview-flow-boxes-layer');
  if (!cell || !layer) return;
  let neededCols = state.previewCols;
  let neededRows = state.previewRows;
  layer.querySelectorAll('.mkml-flow-box').forEach((box) => {
    const content = box.querySelector(':scope > .mkml-flow-box-content');
    if (!content) return;
    const authoredWidth = (Number(box.dataset.gridWidth) || 1) * cell;
    const authoredHeight = (Number(box.dataset.gridHeight) || 1) * 32;
    const width = Math.max(authoredWidth, content.scrollWidth);
    const height = Math.max(authoredHeight, content.scrollHeight);
    box.style.width = `${Math.ceil(width)}px`;
    box.style.height = `${Math.ceil(height)}px`;
    const minCol = Number(box.dataset.minCol) || 1;
    const minRow = Number(box.dataset.minRow) || 1;
    neededCols = Math.max(neededCols, Math.ceil(minCol - 1 + width / cell) + 1);
    neededRows = Math.max(neededRows, minRow - 1 + Math.ceil(height / 32) + 1);
  });
  if (neededCols > state.previewCols || neededRows > state.previewRows) updateGridExtent(neededRows, neededCols);
}
function observeFlowBoxes(root) {
  state.flowBoxObserver?.disconnect();
  state.flowBoxObserver = window.ResizeObserver ? new ResizeObserver(() => fitFlowBoxes()) : null;
  root.querySelectorAll('.mkml-flow-box-content').forEach((content) => state.flowBoxObserver?.observe(content));
  requestAnimationFrame(fitFlowBoxes);
}
function setPreviewZoom(value) {
  const viewport = $('#preview-viewport');
  const oldZoom = state.previewZoom;
  const scrollLeft = viewport.scrollLeft / oldZoom;
  const scrollTop = viewport.scrollTop / oldZoom;
  state.previewZoom = Math.max(0.05, Math.min(3, Math.round(Number(value) * 100) / 100));
  $('#preview-canvas').style.zoom = String(state.previewZoom);
  requestAnimationFrame(() => {
    viewport.scrollLeft = scrollLeft * state.previewZoom;
    viewport.scrollTop = scrollTop * state.previewZoom;
    renderVisibleGridLabels();
  });
}
function changePreviewZoom(direction) {
  const step = state.previewZoom <= 0.5 ? 0.05 : 0.25;
  setPreviewZoom(state.previewZoom + direction * step);
}
function updateGridState() { state.gridOn = !state.gridOn; $('#preview-canvas').classList.toggle('is-grid-off', !state.gridOn); }
async function toggleImmersiveMode() {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }
  if (document.documentElement.requestFullscreen) {
    try { await document.documentElement.requestFullscreen(); }
    catch (error) { console.warn('Browser fullscreen was unavailable; using in-page immersive view.', error); document.body.classList.toggle('study-mode'); }
  } else document.body.classList.toggle('study-mode');
}
function syncImmersiveMode() { document.body.classList.toggle('study-mode', Boolean(document.fullscreenElement)); }
function beginCanvasPan(event) {
  if (event.button !== 1) return;
  const viewport = $('#preview-viewport');
  state.panPointer = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
  viewport.classList.add('is-panning');
  viewport.setPointerCapture(event.pointerId);
  event.preventDefault();
}
function moveCanvasPan(event) {
  if (!state.panPointer || state.panPointer.id !== event.pointerId) return;
  const viewport = $('#preview-viewport');
  viewport.scrollLeft = state.panPointer.left - (event.clientX - state.panPointer.x);
  viewport.scrollTop = state.panPointer.top - (event.clientY - state.panPointer.y);
  event.preventDefault();
}
function endCanvasPan(event) {
  if (!state.panPointer || state.panPointer.id !== event.pointerId) return;
  state.panPointer = null;
  $('#preview-viewport').classList.remove('is-panning');
}
function setupEvents() {
  $$('.nav-item, [data-page="folders"], [data-page="coding"]').forEach((button) => button.addEventListener('click', () => setPage(button.dataset.page)));
  $('#new-chapter-button').addEventListener('click', createChapter); $('[data-action="new-chapter"]').addEventListener('click', createChapter); $('#refresh-button').addEventListener('click', async () => { await loadChapters(); showToast('Disk refreshed'); });
  $('#new-html-button').addEventListener('click', () => openCreator('html')); $('#new-css-button').addEventListener('click', () => openCreator('css')); $('#inline-file-input').addEventListener('keydown', (event) => { if (event.key === 'Enter') submitCreator(); if (event.key === 'Escape') closeCreator(); }); $('#inline-file-cancel').addEventListener('click', closeCreator);
  $('#sidebar-collapse').addEventListener('click', () => $('#chapter-sidebar').classList.toggle('is-collapsed')); $('#open-preview-button').addEventListener('click', async () => { await flushSave(); setPage('preview'); }); $$('.quick-toolbar [data-insert]').forEach((button) => button.addEventListener('click', () => insertSnippet(button.dataset.insert))); $('#code-editor').addEventListener('input', queueSave); $('#code-editor').addEventListener('scroll', () => { $('#line-numbers').scrollTop = $('#code-editor').scrollTop; });
  $('#diagram-question-back').addEventListener('click', returnToDiagram);
  const viewport = $('#preview-viewport');
  viewport.addEventListener('pointerdown', beginCanvasPan);
  viewport.addEventListener('pointermove', moveCanvasPan);
  viewport.addEventListener('pointerup', endCanvasPan);
  viewport.addEventListener('pointercancel', endCanvasPan);
  document.addEventListener('fullscreenchange', syncImmersiveMode);
  viewport.addEventListener('scroll', () => { renderVisibleGridLabels(); extendGraphAtViewportEdge(); }, { passive: true });
  window.addEventListener('resize', () => applyPreviewCanvasSize());
  $('#preview-canvas').addEventListener('mousemove', (event) => { const canvas = $('#preview-canvas'); const rect = canvas.getBoundingClientRect(); const zoom = state.previewZoom; const column = Math.max(1, Math.floor((event.clientX - rect.left) / (rect.width / state.previewCols)) + 1); const row = Math.max(1, Math.floor((event.clientY - rect.top - 47 * zoom) / (32 * zoom)) + 1); const tooltip = $('#coordinate-tooltip'); tooltip.textContent = `Col ${column}, Row ${row}`; tooltip.style.left = `${event.clientX + 14}px`; tooltip.style.top = `${event.clientY + 14}px`; tooltip.classList.add('is-visible'); }); $('#preview-canvas').addEventListener('mouseleave', () => $('#coordinate-tooltip').classList.remove('is-visible'));
  document.addEventListener('keydown', async (event) => {
    const key = event.key.toLowerCase();
    const inPreview = state.page === 'preview';
    if (inPreview && event.altKey && (event.code === 'Equal' || key === '+' || key === '=')) { event.preventDefault(); changePreviewZoom(1); return; }
    if (inPreview && event.altKey && (event.code === 'Minus' || key === '-' || key === '_')) { event.preventDefault(); changePreviewZoom(-1); return; }
    if (inPreview && event.altKey && key === 'g') { event.preventDefault(); updateGridState(); return; }
    if (event.altKey && key === 't') { event.preventDefault(); insertSnippet('table'); }
    if (event.altKey && key === 'q') { event.preventDefault(); insertSnippet('question'); }
    if (event.altKey && key === 'g' && !inPreview) { event.preventDefault(); insertSnippet('grid'); }
    if (event.altKey && key === 'p') { event.preventDefault(); await flushSave(); setPage('preview'); }
    if (event.ctrlKey && key === 'b') { event.preventDefault(); $('#chapter-sidebar').classList.toggle('is-collapsed'); }
    if (event.key === 'F11' && inPreview) { event.preventDefault(); await toggleImmersiveMode(); }
  });
}
async function createChapter() { const name = window.prompt('Name your new chapter folder:'); if (!name) return; const mid = window.prompt('Root MID for this chapter (e.g. PN):'); if (!mid) return; try { const result = await api('/api/chapters', { method: 'POST', body: JSON.stringify({ name, mid }) }); await loadChapters(); showToast(`Created ${formatName(result.folder)} · ${mid.trim().toUpperCase()}`); await openChapter(result.folder); } catch (error) { showToast(error.message); } }
window.openQuestionFile = async (folder, file) => { await openChapter(folder); await openFile(file); setPage('coding'); };
function updateClock() { $('#topbar-clock').textContent = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(new Date()); }
setupGridLabels(); setupEvents(); setPreviewZoom(state.previewZoom); updateClock(); setInterval(updateClock, 30000); loadChapters(); const initialPage = window.location.hash.slice(1); if (['coding', 'preview', 'graph', 'shortcuts', 'settings', 'question-index', 'tracker'].includes(initialPage)) setPage(initialPage);
