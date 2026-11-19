(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const state = { chapters: [], selectedFolder: '', record: null, sandboxByFolder: new Map(), sandboxSequence: new Map(), sandboxActive: false, busy: false, selectionRequest: 0 };
  const Engine = window.AnglesTrackerEngine;

  async function api(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || `Request failed (${response.status})`);
      error.code = body.code || 'TRACKER_ERROR'; error.details = body.details || [];
      throw error;
    }
    return body;
  }
  function prettyNumber(value) { return Number(value || 0).toFixed(2); }
  function percentage(value) { return value == null ? 'N/A (0 Questions)' : `${prettyNumber(value)}%`; }
  function currentLedger() { return state.sandboxActive ? state.sandboxByFolder.get(state.selectedFolder) : state.record?.ledger; }
  function countQuestions(ledger) { return Object.values(ledger?.concepts || {}).reduce((sum, questions) => sum + Object.keys(questions || {}).length, 0); }
  function dateLabel(value) {
    if (!value) return 'No evaluations yet';
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? 'Evaluation date unavailable' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }
  function friendlyIssue(status) {
    return ({ 'missing-mid': 'MID not assigned', 'mid-conflict': 'Folder has conflicting MIDs', 'duplicate-mid': 'Root MID is shared', reserved: 'Reserved MID' })[status] || 'Tracker ledger needs attention';
  }
  function renderChapterList() {
    const target = $('#tracker-chapter-list');
    if (!state.chapters.length) { target.innerHTML = '<p class="tracker-empty">No chapter folders found on disk.</p>'; return; }
    target.innerHTML = state.chapters.map((chapter) => {
      const ready = chapter.status === 'ready';
      const selectable = ready || chapter.status === 'ledger-error';
      const roots = chapter.rootMids?.length ? chapter.rootMids.join(' / ') : 'MID —';
      const selected = state.selectedFolder === chapter.folder;
      return `<button type="button" class="tracker-chapter-row ${selected ? 'is-selected' : ''} ${selectable ? '' : 'is-blocked'} ${chapter.status === 'ledger-error' ? 'is-ledger-error' : ''}" data-folder="${esc(chapter.folder)}" ${selectable ? '' : 'disabled'} aria-pressed="${selected}">
        <span class="tracker-chapter-row-top"><strong>${esc(chapter.name)}</strong><span class="tracker-mid-chip">${esc(roots)}</span></span>
        <small class="tracker-folder-path">/${esc(chapter.folder)}/</small>
        ${ready ? `<span class="tracker-chapter-row-stats"><b>${Number.isInteger(chapter.questionCount) ? chapter.questionCount : '—'}</b> questions <span>·</span> ${chapter.timingLocked ? 'timing locked' : 'timing not set'}</span>` : `<span class="tracker-folder-issue"><b>${esc(friendlyIssue(chapter.status))}</b><small>${esc(chapter.issue || '')}</small></span>`}
      </button>`;
    }).join('');
    target.querySelectorAll('.tracker-chapter-row:not(:disabled)').forEach((button) => button.addEventListener('click', () => void loadChapter(button.dataset.folder)));
  }
  function renderError(error) {
    const details = Array.isArray(error.details) && error.details.length
      ? `<ul>${error.details.map((item) => `<li><code>${esc(item.path || item.code || 'validation')}</code> — ${esc(item.message || JSON.stringify(item))}</li>`).join('')}</ul>`
      : '';
    $('#tracker-detail').innerHTML = `<section class="tracker-panel tracker-error"><span class="panel-index">LEDGER SAFETY CHECK</span><h2>Totals withheld</h2><p>${esc(error.message)}</p>${details}<p class="tracker-error-code">${esc(error.code || 'TRACKER_ERROR')}</p></section>`;
  }
  function timingMarkup(ledger) {
    const config = ledger.timingConfig || {};
    const locked = config.locked === true;
    const sandbox = state.sandboxActive;
    const canReset = !sandbox && (locked || Object.values(ledger.concepts || {}).some((questions) => Object.values(questions || {}).some((attempts) => attempts.length)));
    const saved = locked
      ? `<div class="tracker-locked-timing"><div><span>FAST</span><strong>${config.fastLimit}s</strong></div><div><span>MEDIUM</span><strong>${config.mediumLimit}s</strong></div><div><span>SLOW</span><strong>${config.slowLimit}s</strong></div><small>${sandbox ? 'Read-only snapshot of the permanent chapter limits.' : 'Locked for this chapter. Resetting permanent records is required to change the limits.'}</small></div>`
      : sandbox ? '<p class="tracker-form-note">Timing limits are not set on the permanent ledger. Return to the permanent view to configure and lock them before simulating attempts.</p>'
        : `<form id="tracker-timing-form" class="tracker-timing-form"><label>Fast limit (seconds)<input name="fastLimit" type="number" min="1" step="1" inputmode="numeric" required value="${esc(config.fastLimit ?? '')}"></label><label>Medium limit (seconds)<input name="mediumLimit" type="number" min="1" step="1" inputmode="numeric" required value="${esc(config.mediumLimit ?? '')}"></label><label>Slow limit (seconds)<input name="slowLimit" type="number" min="1" step="1" inputmode="numeric" required value="${esc(config.slowLimit ?? '')}"></label><button class="button button-primary" type="submit">Save &amp; lock timing</button><p class="tracker-form-note">Positive whole seconds only · required order: Fast &lt; Medium &lt; Slow.</p></form>`;
    const resetControl = canReset ? '<button type="button" class="tracker-reset-link" id="tracker-reset-records">Reset PERMANENT chapter records &amp; re-enter timings</button>' : sandbox ? '<p class="tracker-form-note">Permanent timing and attempt records cannot be changed from the sandbox.</p>' : '<p class="tracker-form-note">Once saved, these thresholds stay fixed until the chapter ledger is reset.</p>';
    return `<section class="tracker-panel tracker-timing-panel"><div class="tracker-panel-head"><div><span class="panel-index">01 / ONE-TIME TIMING CONFIG</span><h2>Set the pace tiers</h2></div><span class="tracker-lock-state ${locked ? 'is-locked' : ''}">${locked ? 'LOCKED' : 'NOT SET'}</span></div>${saved}<div class="tracker-panel-feedback" id="tracker-timing-feedback" aria-live="polite"></div>${resetControl}</section>`;
  }
  function metricCards(metrics) {
    return `<div class="tracker-metric-grid">
      <article class="tracker-metric-card tracker-metric-primary"><span>TOTAL COMPLETION</span><strong>${percentage(metrics.completionPercent)}</strong><small>Lifetime marks ÷ maximum marks</small></article>
      <article class="tracker-metric-card"><span>MAXIMUM MARKS · MM</span><strong>${prettyNumber(metrics.MM)}</strong><small>${metrics.TQ} questions × 3</small></article>
      <article class="tracker-metric-card"><span>LIFETIME MARKS · LTM</span><strong>${prettyNumber(metrics.LTM)}</strong><small>Accuracy + time marks</small></article>
      <article class="tracker-metric-card"><span>AVAILABLE MARKS · AM</span><strong>${prettyNumber(metrics.AM)}</strong><small>Maximum marks − lifetime marks</small></article>
    </div>`;
  }
  function accuracyTable(metrics) {
    const rows = [
      ['NQC', 'Correct', metrics.NQC, '+1.00', metrics.NQC],
      ['NQW', 'Wrong', metrics.NQW, '−0.50', metrics.NQW * -0.5],
      ['NQS', 'Skipped', metrics.NQS, '−0.20', metrics.NQS * -0.2],
      ['NQNA', 'Not asked', metrics.NQNA, '0.00', 0]
    ];
    return `<section class="tracker-panel"><div class="tracker-panel-head"><div><span class="panel-index">03 / ACCURACY OVERVIEW</span><h2>Accuracy &amp; score deductions</h2></div><span class="tracker-panel-total">ARMNT</span></div><div class="tracker-table-wrap"><table class="tracker-table"><thead><tr><th>STATE</th><th>QUESTIONS</th><th>MARK EACH</th><th>MARKS</th></tr></thead><tbody>${rows.map(([code, label, count, each, total]) => `<tr><th scope="row"><code>${code}</code> ${label}</th><td>${count}</td><td>${each}</td><td>${prettyNumber(total)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="3">ACCURACY REAL MARKS NET TOTAL · ARMNT</th><td>${prettyNumber(metrics.ARMNT)}</td></tr></tfoot></table></div></section>`;
  }
  function timeTable(metrics, config) {
    const tiers = [
      ['NQF', 'Fast correct', metrics.NQF, '+2.00', metrics.NQF * 2, `≤ ${config.fastLimit ?? '—'}s`],
      ['NQM', 'Medium correct', metrics.NQM, '+1.00', metrics.NQM, `${Number(config.fastLimit || 0) + 1}s–${config.mediumLimit ?? '—'}s`],
      ['NQSl', 'Slow correct', metrics.NQSl, '+0.50', metrics.NQSl * 0.5, `${Number(config.mediumLimit || 0) + 1}s–${config.slowLimit ?? '—'}s`],
      ['NQOT', 'Overtime correct', metrics.NQOT, '0.00', 0, `> ${config.slowLimit ?? '—'}s`],
      ['—', 'Wrong / skipped / not asked', metrics.NQW + metrics.NQS + metrics.NQNA, '0.00', 0, 'No time marks']
    ];
    return `<section class="tracker-panel"><div class="tracker-panel-head"><div><span class="panel-index">04 / SPEED TIERS</span><h2>Time performance</h2></div><span class="tracker-panel-total">NTM</span></div><div class="tracker-table-wrap"><table class="tracker-table"><thead><tr><th>STATE</th><th>COUNT</th><th>TIME BAND</th><th>MARKS</th></tr></thead><tbody>${tiers.map(([code, label, count, each, total, band]) => `<tr><th scope="row"><code>${code}</code> ${label}<small class="tracker-tier-mark">${each} each</small></th><td>${count}</td><td>${band}</td><td>${prettyNumber(total)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="3">NET TIME MARKS · NTM</th><td>${prettyNumber(metrics.NTM)}</td></tr></tfoot></table></div></section>`;
  }
  function synthesisCard(metrics, invariants) {
    const status = invariants.every((item) => item.passed);
    return `<section class="tracker-panel tracker-synthesis"><div class="tracker-panel-head"><div><span class="panel-index">05 / FINAL SYNTHESIS</span><h2>Formula verification</h2></div><span class="tracker-invariant-state ${status ? 'is-valid' : 'is-invalid'}">${status ? 'ALL INVARIANTS PASS' : 'INVARIANT FAILURE'}</span></div><div class="tracker-formula-grid"><div><span>LIFETIME MARKS</span><strong>${prettyNumber(metrics.LTM)} = ${prettyNumber(metrics.ARMNT)} + ${prettyNumber(metrics.NTM)}</strong><small>LTM = ARMNT + NTM</small></div><div><span>COMPLETION</span><strong>${percentage(metrics.completionPercent)}</strong><small>${metrics.MM ? `${prettyNumber(metrics.LTM)} ÷ ${prettyNumber(metrics.MM)} × 100` : 'No questions in this pool'}</small></div><div><span>POOL COUNTS</span><strong>${metrics.TQ} questions · ${metrics.NQC} correct · ${metrics.NQW} wrong · ${metrics.NQS} skipped · ${metrics.NQNA} not asked</strong><small>Latest attempt only; older attempts remain preserved.</small></div></div><details class="tracker-invariants"><summary>Show validation invariants</summary><ol>${invariants.map((item) => `<li class="${item.passed ? 'is-valid' : 'is-invalid'}"><span>${esc(item.expression)}</span><b>${item.passed ? 'PASS' : 'FAIL'}</b></li>`).join('')}</ol></details></section>`;
  }
  function testPanel() {
    const sandbox = state.sandboxActive;
    const ledger = currentLedger();
    const locked = ledger?.timingConfig?.locked === true;
    return `<section class="tracker-panel tracker-test-panel"><div class="tracker-panel-head"><div><span class="panel-index">06 / LEDGER TEST BAR</span><h2>Test the formulas safely</h2></div><span class="tracker-sandbox-chip ${sandbox ? 'is-active' : ''}">${sandbox ? 'SANDBOX · MEMORY ONLY' : 'PERMANENT LEDGER · READ ONLY'}</span></div><p class="tracker-test-copy">${sandbox ? 'Simulated questions and attempts are isolated in this browser session and never write to the chapter ledger.' : 'Page 1 does not change permanent attempts. Open a sandbox to simulate results without touching your saved records.'}</p><div class="tracker-test-actions">${sandbox ? `<button class="button button-quiet" type="button" id="tracker-sandbox-exit">Return to permanent ledger</button><button class="button button-quiet" type="button" id="tracker-sandbox-reset">Reset sandbox to clean skeleton</button>` : '<button class="button button-quiet" type="button" id="tracker-sandbox-open">Open isolated sandbox</button>'}<button class="button button-quiet" type="button" id="tracker-json-open">View / Copy Ledger JSON</button></div>${sandbox ? `<div class="tracker-sim-controls"><label>Correct-answer pace<select id="tracker-test-tier"><option value="fast">Fast</option><option value="medium">Medium</option><option value="slow">Slow</option><option value="overtime">Overtime</option></select></label><button type="button" class="tracker-sim-button" data-sim="correct" ${locked ? '' : 'disabled'}>＋ Test Correct</button><button type="button" class="tracker-sim-button" data-sim="wrong" ${locked ? '' : 'disabled'}>＋ Test Wrong</button><button type="button" class="tracker-sim-button" data-sim="skip" ${locked ? '' : 'disabled'}>＋ Skip</button><button type="button" class="tracker-sim-button" data-sim="unasked">＋ Add Unattempted Pool Q</button></div>${locked ? '' : '<p class="tracker-form-note">Lock valid timing limits before simulating attempted questions.</p>'}<p id="tracker-sandbox-feedback" class="tracker-panel-feedback" aria-live="polite"></p>` : ''}</section>`;
  }
  function renderDetail() {
    const record = state.record;
    if (!record) return;
    const ledger = currentLedger();
    const calculated = Engine.calculateMetrics(ledger);
    if (!calculated.ok) { renderError({ code: 'LEDGER_VALIDATION_FAILED', message: 'The ledger did not pass validation, so no totals are displayed.', details: calculated.errors }); return; }
    const { metrics, invariants } = calculated;
    const chapter = record.chapter;
    const conceptRows = Object.entries(ledger.concepts || {}).map(([concept, questions]) => `<span><b>${esc(concept)}</b> ${Object.keys(questions).length}</span>`).join('') || '<span>No concept wrappers found</span>';
    const mode = state.sandboxActive ? '<span class="tracker-mode-warning">SANDBOX DATA — NOT SAVED</span>' : '';
    const warnings = record.warnings?.length ? `<details class="tracker-pool-warnings"><summary>${record.warnings.length} question-pool notice${record.warnings.length === 1 ? '' : 's'}</summary><ul>${record.warnings.slice(0, 20).map((warning) => `<li>${esc(warning.file)} — ${esc(warning.message)}</li>`).join('')}</ul></details>` : '';
    $('#tracker-detail').innerHTML = `<div class="tracker-selected-header"><div><p class="kicker">/ TOPIC OVERVIEW</p><div class="tracker-selected-title"><h2>${esc(chapter.name)}</h2><span class="tracker-root-badge">${esc(chapter.rootMid)}</span>${mode}</div><p>Latest evaluation: <strong>${esc(state.sandboxActive ? dateLabel(ledger.lastUpdated) : dateLabel(ledger.lastUpdated))}</strong></p></div><div class="tracker-header-stats"><span>${metrics.TQ} UNIQUE QUESTIONS</span><span>${Object.keys(ledger.concepts || {}).length} CONCEPT MIDs</span></div></div>
      ${warnings}
      ${timingMarkup(ledger)}
      <section class="tracker-panel tracker-concepts-panel"><div class="tracker-panel-head"><div><span class="panel-index">02 / POOL SCOPE</span><h2>Questions grouped by concept MID</h2></div><span class="tracker-pool-total">${metrics.TQ} TOTAL</span></div><div class="tracker-concept-chips">${conceptRows}</div><p class="tracker-form-note">IDs are permanent and monotonic: <code>${esc(chapter.rootMid)}-CN1-q11</code> is the generated form for Concept C1, question 11. Deleted IDs are not reassigned.</p></section>
      ${metricCards(metrics)}
      <div class="tracker-breakdown-grid">${accuracyTable(metrics)}${timeTable(metrics, ledger.timingConfig || {})}</div>
      ${synthesisCard(metrics, invariants)}
      ${testPanel()}`;
    bindDetailEvents(chapter);
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function cleanSandboxFrom(ledger) {
    const sandbox = clone(ledger);
    for (const questions of Object.values(sandbox.concepts || {})) for (const id of Object.keys(questions || {})) questions[id] = [];
    if (sandbox.identity) sandbox.identity.retiredAttemptsByConcept = {};
    sandbox.lastUpdated = null;
    return sandbox;
  }
  function getSandbox() {
    let sandbox = state.sandboxByFolder.get(state.selectedFolder);
    if (!sandbox) {
      sandbox = clone(state.record.ledger);
      state.sandboxByFolder.set(state.selectedFolder, sandbox);
    }
    return sandbox;
  }
  function addSandboxQuestion(attempt) {
    const sandbox = getSandbox();
    const conceptMid = Object.keys(sandbox.concepts || {}).find((key) => key !== 'UN') || Object.keys(sandbox.concepts || {})[0] || 'C1';
    sandbox.concepts[conceptMid] ||= {};
    const sequence = (state.sandboxSequence.get(state.selectedFolder) || 0) + 1;
    state.sandboxSequence.set(state.selectedFolder, sequence);
    const id = `TEST-${sandbox.chapterMid}-${Engine.conceptToken(conceptMid)}-q${sequence}`;
    sandbox.concepts[conceptMid][id] = attempt ? [attempt] : [];
    sandbox.questionMeta ||= {};
    sandbox.questionMeta[id] = { conceptMid, type: 'SANDBOX TEST', text: 'Synthetic sandbox question; not part of the authored pool.', active: true, sandbox: true };
    sandbox.lastUpdated = attempt ? new Date().toISOString() : sandbox.lastUpdated;
    return id;
  }
  function testAttempt(status, tier) {
    const sandbox = getSandbox();
    const config = sandbox.timingConfig;
    if (!config?.locked) return;
    const seconds = status !== 'C' ? 1 : ({ fast: config.fastLimit, medium: config.fastLimit + 1, slow: config.mediumLimit + 1, overtime: config.slowLimit + 1 })[tier];
    const accuracy = Engine.ACCURACY[status];
    const time = Engine.expectedTimeMark(status, seconds, config);
    const selected = status === 'S' ? '-' : status === 'C' ? 'A' : 'B';
    addSandboxQuestion([status, seconds, accuracy, time, selected]);
    renderDetail();
    $('#tracker-sandbox-feedback').textContent = `${status === 'C' ? `Correct · ${tier} (${seconds}s)` : status === 'W' ? `Wrong (${seconds}s)` : 'Skipped'} added to sandbox only.`;
  }
  function bindDetailEvents(chapter) {
    $('#tracker-timing-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const timingConfig = Object.fromEntries(['fastLimit', 'mediumLimit', 'slowLimit'].map((key) => [key, Number(form.get(key))]));
      const validation = Engine.timingConfigErrors({ locked: true, ...timingConfig });
      if (validation.length) { $('#tracker-timing-feedback').textContent = validation.map((item) => item.message).join(' '); return; }
      try {
        $('#tracker-timing-feedback').textContent = 'Saving and locking timing limits…';
        await api(`/api/tracker/${encodeURIComponent(chapter.folder)}/timing`, { method: 'PUT', body: JSON.stringify(timingConfig) });
        state.sandboxByFolder.delete(chapter.folder); state.sandboxActive = false;
        await refreshTracker(chapter.folder);
      } catch (error) { $('#tracker-timing-feedback').textContent = error.message; }
    });
    $('#tracker-reset-records')?.addEventListener('click', async () => {
      const questionCount = countQuestions(state.record.ledger);
      const accepted = window.confirm(`Delete previous attempts and unlock timing for ${chapter.name} (${chapter.rootMid})? The ${questionCount} question IDs and pool will be preserved. This cannot be undone.`);
      if (!accepted) return;
      try {
        await api(`/api/tracker/${encodeURIComponent(chapter.folder)}/reset`, { method: 'POST', body: JSON.stringify({ confirm: true }) });
        state.sandboxByFolder.delete(chapter.folder); state.sandboxActive = false;
        await refreshTracker(chapter.folder);
      } catch (error) { renderError(error); }
    });
    $('#tracker-sandbox-open')?.addEventListener('click', () => { getSandbox(); state.sandboxActive = true; renderDetail(); });
    $('#tracker-sandbox-exit')?.addEventListener('click', () => { state.sandboxActive = false; renderDetail(); });
    $('#tracker-sandbox-reset')?.addEventListener('click', () => {
      state.sandboxByFolder.set(chapter.folder, cleanSandboxFrom(state.record.ledger));
      state.sandboxSequence.set(chapter.folder, 0);
      renderDetail();
      const feedback = $('#tracker-sandbox-feedback'); if (feedback) feedback.textContent = 'Sandbox reset to the current question pool with empty attempts. Permanent data was not changed.';
    });
    $('#tracker-detail').querySelectorAll('[data-sim]').forEach((button) => button.addEventListener('click', () => {
      if (button.dataset.sim === 'unasked') {
        const id = addSandboxQuestion(null);
        renderDetail();
        const feedback = $('#tracker-sandbox-feedback'); if (feedback) feedback.textContent = `${id} added as Not Asked in this sandbox only.`;
      } else {
        const status = button.dataset.sim === 'correct' ? 'C' : button.dataset.sim === 'wrong' ? 'W' : 'S';
        testAttempt(status, $('#tracker-test-tier')?.value || 'fast');
      }
    }));
    $('#tracker-json-open')?.addEventListener('click', openJsonInspector);
  }
  async function loadChapter(folder) {
    if (state.busy) return;
    const requestId = ++state.selectionRequest;
    state.selectedFolder = folder; state.record = null; state.sandboxActive = false; renderChapterList();
    $('#tracker-detail').innerHTML = '<div class="tracker-empty-state"><span class="placeholder-number">…</span><h2>Syncing question pool</h2><p>Checking local notes and permanent question IDs.</p></div>';
    try {
      const record = await api(`/api/tracker/${encodeURIComponent(folder)}`);
      if (requestId !== state.selectionRequest) return;
      state.record = record;
      if (state.sandboxByFolder.has(folder)) state.sandboxActive = false;
      renderChapterList(); renderDetail();
    } catch (error) { if (requestId === state.selectionRequest) renderError(error); }
  }
  async function refreshTracker(preferredFolder = state.selectedFolder) {
    if (state.busy) return;
    state.busy = true;
    const requestId = ++state.selectionRequest;
    $('#tracker-chapter-list').innerHTML = '<p class="tracker-empty">Scanning folders and syncing question IDs…</p>';
    try {
      const result = await api('/api/tracker');
      state.chapters = result.chapters || [];
      const available = state.chapters.filter((chapter) => chapter.status === 'ready');
      const preferred = available.find((chapter) => chapter.folder === preferredFolder);
      const next = preferred || available[0];
      state.selectedFolder = next?.folder || '';
      renderChapterList();
      if (next) {
        const record = await api(`/api/tracker/${encodeURIComponent(next.folder)}`);
        if (requestId !== state.selectionRequest) return;
        state.record = record;
        renderChapterList(); renderDetail();
      } else {
        if (requestId !== state.selectionRequest) return;
        state.record = null;
        $('#tracker-detail').innerHTML = `<div class="tracker-empty-state"><span class="placeholder-number">01</span><h2>No safe chapter tracker available</h2><p>Folders with missing, conflicting, or duplicated root MIDs are shown at left. Resolve those MIDs in the chapter files before a collision-free question ledger can be created.</p></div>`;
      }
    } catch (error) { if (requestId === state.selectionRequest) { $('#tracker-chapter-list').innerHTML = `<p class="tracker-empty tracker-load-error">${esc(error.message)}</p>`; renderError(error); } }
    finally { state.busy = false; }
  }
  function openJsonInspector() {
    const ledger = currentLedger();
    if (!ledger) return;
    $('#tracker-json-text').value = JSON.stringify(ledger, null, 2);
    $('#tracker-json-status').textContent = state.sandboxActive ? 'Sandbox JSON · memory only' : 'Read-only view of the saved local ledger.';
    const dialog = $('#tracker-json-dialog');
    if (!dialog.open) dialog.showModal();
  }
  $('#tracker-refresh').addEventListener('click', () => void refreshTracker());
  $('#tracker-json-close').addEventListener('click', () => $('#tracker-json-dialog').close());
  $('#tracker-json-copy').addEventListener('click', async () => {
    const text = $('#tracker-json-text').value;
    try { await navigator.clipboard.writeText(text); $('#tracker-json-status').textContent = 'Copied to clipboard.'; }
    catch (_) { $('#tracker-json-text').focus(); $('#tracker-json-text').select(); $('#tracker-json-status').textContent = 'Select the JSON above and copy it manually.'; }
  });
  window.refreshTracker = refreshTracker;
  if (window.location.hash === '#tracker') void refreshTracker();
})();
