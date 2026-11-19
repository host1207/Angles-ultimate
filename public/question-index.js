(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let indexData = null;
  let selectedRoot = '';
  let selectedType = 'ALL TYPES';
  let selectedTypeFolder = 'ALL';
  const expandedTypeFolders = new Set();
  let previewValid = false;
  async function api(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...options });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
    return body;
  }
  function status(text) { $('#qi-status').textContent = text; }
  async function refreshQuestionIndex() {
    status('Scanning current files from disk…');
    try { indexData = await api('/api/question-index'); render(); status('Index refreshed from disk.'); }
    catch (error) { status(error.message); }
  }
  window.refreshQuestionIndex = refreshQuestionIndex;
  function renderBatchSummary(batch) {
    $('#qi-batch-completion').innerHTML = batch.total ? `<strong>${batch.completion.toFixed(1)}%</strong><span>PASTED-BATCH COMPLETION</span><small>${batch.total} questions · ${batch.unmapped} UN · ${batch.completed} complete</small>` : 'PASTED-BATCH COMPLETION · no questions yet';
  }
  function render() {
    if (!indexData) return;
    const chapters = indexData.chapters.filter((c) => c.rootMid && c.rootMid !== 'UN');
    const batch = window.AnglesQuestionBatch.calculatePastedBatchCompletion($('#qi-input').value);
    renderBatchSummary(batch);
    const unassigned = indexData.chapters.filter((c) => !c.rootMid && c.folder.toLowerCase() !== 'global unmapped');
    const sorted = [...chapters].sort((a, b) => b.totalQuestions - a.totalQuestions);
    renderBatchResults(batch, chapters);
    $('#qi-chapter-list').innerHTML = sorted.length ? sorted.map((c) => `<button class="qi-bar-row qi-chapter-row" data-root="${esc(c.rootMid)}"><span class="qi-bar-label"><strong>${esc(c.rootMid)}</strong><small>${esc(c.name)}</small></span><span class="qi-bar-track"><i style="width:${c.totalQuestions ? Math.max(2, c.totalShare) : 0}%"></i></span><span class="qi-bar-value">${c.totalQuestions}<small>${c.totalShare.toFixed(1)}% share</small></span><span class="qi-completion-value">${esc(c.readiness.label)}<small>${c.mappedUnique} mapped · ${c.unmappedCount} UN</small></span></button>`).join('') : '<p class="qi-empty">No saved chapter index yet.</p>';
    const select = $('#qi-chapter-select');
    select.innerHTML = chapters.map((c) => `<option value="${esc(c.rootMid)}">${esc(c.rootMid)} · ${esc(c.name)}</option>`).join('');
    if (chapters.some((c) => c.rootMid === selectedRoot)) select.value = selectedRoot;
    selectedRoot = select.value || '';
    const chapter = chapters.find((c) => c.rootMid === selectedRoot);
    const mappedPct = chapter?.totalQuestions ? chapter.mappedUnique / chapter.totalQuestions * 100 : null;
    const unmappedPct = chapter?.totalQuestions ? chapter.unmappedCount / chapter.totalQuestions * 100 : null;
    $('#qi-readiness').innerHTML = chapter ? `<div class="readiness-number">${esc(chapter.readiness.label)}</div><div class="readiness-copy"><strong>${esc(chapter.rootMid)} stored note coverage</strong><span>${chapter.totalQuestions ? `${mappedPct.toFixed(1)}% mapped · ${unmappedPct.toFixed(1)}% unmapped gap · ${chapter.mappedUnique} mapped unique / ${chapter.unmappedCount} unmapped` : 'No questions ingested yet'}</span></div><div class="readiness-track"><i style="width:${mappedPct == null ? 0 : mappedPct}%"></i></div>` : '<p class="qi-empty">No chapter selected.</p>';
    const concepts = chapter ? chapter.concepts.filter((c) => c.mid !== `${chapter.rootMid}.UN`) : [];
    if (chapter && chapter.unmappedCount) concepts.push({ mid: `${chapter.rootMid}.UN`, title: 'Unmapped', folder: chapter.folder, file: 'unmapped.html', questions: chapter.unmappedCount });
    const max = Math.max(1, ...concepts.map((c) => c.questions));
    $('#qi-concept-list').innerHTML = concepts.length ? [...concepts].sort((a, b) => b.questions - a.questions || a.mid.localeCompare(b.mid)).map((c) => `<button class="qi-bar-row qi-concept-row" data-folder="${esc(c.folder)}" data-file="${esc(c.file)}"><span class="qi-bar-label"><strong>${esc(c.mid)}</strong><small>${esc(c.title)}</small></span><span class="qi-bar-track"><i style="width:${c.questions / max * 100}%"></i></span><span class="qi-bar-value">${c.questions}</span></button>`).join('') : '<p class="qi-empty">No concept questions indexed yet.</p>';
    $('#qi-gap-list').innerHTML = chapter?.gaps.length ? chapter.gaps.map((g) => `<div class="gap-row"><span>${esc(g.label)}</span><strong>${g.count}</strong></div>`).join('') : '<p class="qi-empty">No unmapped questions in this chapter.</p>';
    $('#qi-unassigned').innerHTML = unassigned.length ? `<div class="unassigned-title">FOLDERS WITHOUT A ROOT MID <span>Assign once to enable concept routing</span></div>${unassigned.map((c) => `<div class="unassigned-row"><span>${esc(c.name)} <small>/${esc(c.folder)}/</small></span><button class="mini-button qi-assign" data-folder="${esc(c.folder)}">Assign root MID</button></div>`).join('')}` : '';
    document.querySelectorAll('#qi-chapter-list [data-root]').forEach((button) => button.addEventListener('click', () => { selectedRoot = button.dataset.root; render(); }));
    document.querySelectorAll('.qi-assign').forEach((button) => button.addEventListener('click', () => assignMid(button.dataset.folder)));
    document.querySelectorAll('.qi-concept-row').forEach((button) => button.addEventListener('click', () => window.openQuestionFile(button.dataset.folder, button.dataset.file)));
    renderTypeBreakdown();
  }
  function renderBatchResults(batch, chapters) {
    if (!batch.total) { $('#qi-batch-results').innerHTML = '<tr><td colspan="5" class="qi-report-empty">Paste a batch to calculate completion.</td></tr>'; return; }
    const chapterByRoot = new Map(chapters.map((chapter) => [chapter.rootMid, chapter]));
    const rows = Object.entries(batch.byRoot).map(([root, stats]) => {
      const chapter = chapterByRoot.get(root);
      const completed = stats.total - stats.unmapped;
      const pct = completed / stats.total * 100;
      return `<tr><th scope="row"><strong>${esc(root)}</strong><small>${esc(chapter?.name || 'Chapter')}</small></th><td>${stats.total}</td><td>${stats.unmapped}</td><td>${completed}</td><td class="qi-report-pct">${pct.toFixed(1)}%</td></tr>`;
    });
    if (batch.globalTotal) {
      const completed = batch.globalTotal - batch.globalUnmapped;
      const pct = completed / batch.globalTotal * 100;
      rows.push(`<tr class="qi-report-global"><th scope="row"><strong>UN</strong><small>Global Unmapped</small></th><td>${batch.globalTotal}</td><td>${batch.globalUnmapped}</td><td>${completed}</td><td class="qi-report-pct">${pct.toFixed(1)}%</td></tr>`);
    }
    $('#qi-batch-results').innerHTML = rows.length ? rows.join('') : '<tr><td colspan="5" class="qi-report-empty">No chapter MID or Global Unmapped MID was found in these questions.</td></tr>';
  }
  function renderTypeBreakdown() {
    const breakdown = indexData?.typeBreakdown;
    if (!breakdown) return;
    const types = breakdown.types || [];
    if (selectedType !== 'ALL TYPES' && !types.includes(selectedType)) selectedType = 'ALL TYPES';
    $('#qi-type-pills').innerHTML = ['ALL TYPES', ...types].map((type) => `<button type="button" class="qi-type-pill ${selectedType === type ? 'is-active' : ''}" data-type="${esc(type)}">${esc(type)}</button>`).join('');
    const filter = $('#qi-type-folder-filter');
    filter.innerHTML = `<option value="ALL">All folders</option>${breakdown.folders.map((folder) => `<option value="${esc(folder.folder)}">${esc(folder.name)} (${esc(folder.rootMid)})</option>`).join('')}`;
    if (selectedTypeFolder !== 'ALL' && !breakdown.folders.some((folder) => folder.folder === selectedTypeFolder)) selectedTypeFolder = 'ALL';
    filter.value = selectedTypeFolder;
    const folders = breakdown.folders.filter((folder) => selectedTypeFolder === 'ALL' || folder.folder === selectedTypeFolder);
    const countOf = (folder) => selectedType === 'ALL TYPES' ? folder.uniqueCount : (folder.counts[selectedType] || 0);
    const total = folders.reduce((sum, folder) => sum + countOf(folder), 0);
    const sorted = [...folders].sort((a, b) => countOf(b) - countOf(a) || a.name.localeCompare(b.name));
    $('#qi-type-folder-ranking').innerHTML = sorted.length ? sorted.map((folder) => {
      const count = countOf(folder); const share = total ? count / total * 100 : 0;
      const expanded = expandedTypeFolders.has(folder.folder);
      const concepts = folder.concepts.map((concept) => ({ ...concept, count: selectedType === 'ALL TYPES' ? concept.uniqueCount : (concept.counts[selectedType] || 0) })).filter((concept) => concept.count > 0).sort((a, b) => b.count - a.count || a.mid.localeCompare(b.mid));
      const max = Math.max(1, ...concepts.map((concept) => concept.count));
      return `<article class="qi-type-folder ${expanded ? 'is-expanded' : ''}"><button type="button" class="qi-type-folder-row" aria-expanded="${expanded}" data-folder="${esc(folder.folder)}"><span class="qi-type-folder-name"><span class="qi-type-chevron">${expanded ? '▾' : '▸'}</span><strong>${esc(folder.name)}</strong><small>${esc(folder.rootMid)}</small></span><span class="qi-type-count"><b>${count}</b><i><em style="width:${count ? Math.max(2, share) : 0}%"></em></i></span><span class="qi-type-share">${share.toFixed(1)}%</span></button>${expanded ? `<div class="qi-type-concepts">${concepts.length ? concepts.map((concept) => `<div class="qi-type-concept"><span><strong>${esc(concept.mid)}</strong><small>${esc(concept.title)}</small></span><i><em style="width:${concept.count / max * 100}%"></em></i><b>${concept.count}</b></div>`).join('') : '<p class="qi-empty">No questions for this type in this folder.</p>'}</div>` : ''}</article>`;
    }).join('') : '<p class="qi-empty">No folders have a root MID assigned.</p>';
    document.querySelectorAll('.qi-type-pill').forEach((button) => button.addEventListener('click', () => { selectedType = button.dataset.type; renderTypeBreakdown(); }));
    document.querySelectorAll('.qi-type-folder-row').forEach((button) => button.addEventListener('click', () => { const folder = button.dataset.folder; if (expandedTypeFolders.has(folder)) expandedTypeFolders.delete(folder); else expandedTypeFolders.add(folder); renderTypeBreakdown(); }));
  }
  async function assignMid(folder) {
    const mid = window.prompt(`Root MID for ${folder} (e.g. PN):`); if (!mid) return;
    try { await api(`/api/chapters/${encodeURIComponent(folder)}/mid`, { method: 'PUT', body: JSON.stringify({ mid }) }); await refreshQuestionIndex(); status(`Assigned ${mid.trim().toUpperCase()} to ${folder}`); }
    catch (error) { status(error.message); }
  }
  function showDryRun(data) {
    previewValid = data.valid;
    const needsConfirmation = data.routes.some((q) => q.targets.some((target) => target.kind === 'unknown-concept'));
    $('#qi-commit').disabled = !data.valid || needsConfirmation;
    const routes = data.routes.map((q) => {
      const destinations = q.targets.map((t) => `${t.kind === 'mapped' ? 'Mapped' : t.kind === 'unknown-concept' ? 'Unknown concept → chapter unmapped' : 'Unmapped'} · ${esc(t.folder)}/${esc(t.file)} · ${esc(t.conceptMid)}`).join('<br>');
      const unknownTargets = q.targets.filter((target) => target.kind === 'unknown-concept');
      const confirmRoute = unknownTargets.length ? `<label class="qi-unknown-confirm"><input type="checkbox" class="qi-confirm-unknown"> Confirm routing missing ${unknownTargets.map((target) => esc(target.requestedMid)).join(', ')} to ${unknownTargets.map((target) => esc(target.conceptMid)).join(', ')}</label>` : '';
      return `<article class="qi-route ${q.issues.length ? 'has-issue' : ''}"><div class="qi-route-top"><strong>Q${q.index}</strong><span>${esc(q.mids.join(' / ') || 'MID missing')}</span></div><p>${esc(q.text || '(Question text missing)')}</p><div class="qi-route-destination">Type: ${esc(q.type || 'MISSING')}<br>${destinations || 'No destination resolved'}</div>${q.issues.length ? `<div class="qi-route-errors">${q.issues.map(esc).join(' · ')}</div>` : ''}${confirmRoute}${q.gap ? `<span class="gap-chip">GAP · ${esc(q.gap)}</span>` : ''}</article>`;
    }).join('');
    $('#qi-preview').innerHTML = `<div class="qi-summary"><strong>${data.routes.length} questions</strong> · ${data.mapped} mapped · ${data.unmapped} unmapped${data.valid ? '' : ' · fix validation errors before committing'}</div>${routes}`;
    document.querySelectorAll('.qi-confirm-unknown').forEach((checkbox) => checkbox.addEventListener('change', () => {
      const allConfirmed = [...document.querySelectorAll('.qi-confirm-unknown')].every((item) => item.checked);
      $('#qi-commit').disabled = !data.valid || (needsConfirmation && !allConfirmed);
    }));
  }
  async function dryRun() {
    try { showDryRun(await api('/api/question-index/dry-run', { method: 'POST', body: JSON.stringify({ source: $('#qi-input').value }) })); }
    catch (error) { previewValid = false; $('#qi-commit').disabled = true; $('#qi-preview').innerHTML = `<p class="qi-route-errors">${esc(error.message)}</p>`; }
  }
  async function commit() {
    if (!previewValid || $('#qi-commit').disabled || !window.confirm('Append this batch to the shown local HTML destinations?')) return;
    const allowUnknown = [...document.querySelectorAll('.qi-confirm-unknown')].every((item) => item.checked);
    try { const result = await api('/api/question-index/commit', { method: 'POST', body: JSON.stringify({ source: $('#qi-input').value, allowUnknown }) }); previewValid = false; $('#qi-commit').disabled = true; status(`${result.added.length} copies added · ${result.duplicates.length} duplicates skipped${result.warnings.length ? ` · ${result.warnings.length} warnings` : ''}`); await refreshQuestionIndex(); }
    catch (error) { status(error.message); }
  }
  async function resync() {
    try { const result = await api('/api/question-index/resync', { method: 'POST', body: '{}' }); status(`${result.moved.length} moved · ${result.conflicts.length} unresolved`); await refreshQuestionIndex(); }
    catch (error) { status(error.message); }
  }
  $('#qi-refresh').addEventListener('click', refreshQuestionIndex);
  $('#qi-dry-run').addEventListener('click', dryRun);
  $('#qi-commit').addEventListener('click', commit);
  $('#qi-resync').addEventListener('click', resync);
  $('#qi-chapter-select').addEventListener('change', (event) => { selectedRoot = event.target.value; render(); });
  $('#qi-type-folder-filter').addEventListener('change', (event) => { selectedTypeFolder = event.target.value; renderTypeBreakdown(); });
  $('#qi-input').addEventListener('input', () => { previewValid = false; $('#qi-commit').disabled = true; if (indexData) render(); else { const batch = window.AnglesQuestionBatch.calculatePastedBatchCompletion($('#qi-input').value); renderBatchSummary(batch); renderBatchResults(batch, []); } });
  if (window.location.hash === '#question-index') void refreshQuestionIndex();
})();
