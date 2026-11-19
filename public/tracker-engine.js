(function (root, factory) {
  const engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  if (root) root.AnglesTrackerEngine = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ACCURACY = Object.freeze({ C: 1, W: -0.5, S: -0.2 });
  const CLOSE = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-9;

  function createLedger(chapterMid, topic) {
    return {
      schemaVersion: 1,
      chapterMid: String(chapterMid || '').trim().toUpperCase(),
      topic: String(topic || ''),
      lastUpdated: null,
      timingConfig: { locked: false, fastLimit: null, mediumLimit: null, slowLimit: null },
      concepts: {},
      questionMeta: {},
      identity: { nextIndexByConcept: {}, signatureToId: {}, retiredAttemptsByConcept: {} }
    };
  }

  function timingConfigErrors(config) {
    const errors = [];
    if (!config || config.locked !== true) return [{ code: 'TIMING_NOT_LOCKED', path: 'timingConfig', message: 'Timing limits must be saved and locked before attempts can be evaluated.' }];
    for (const key of ['fastLimit', 'mediumLimit', 'slowLimit']) {
      if (!Number.isInteger(config[key]) || config[key] <= 0) errors.push({ code: 'INVALID_TIMING_LIMIT', path: `timingConfig.${key}`, message: `${key} must be a positive integer.` });
    }
    if (!errors.length && !(config.fastLimit < config.mediumLimit && config.mediumLimit < config.slowLimit)) {
      errors.push({ code: 'INVALID_TIMING_ORDER', path: 'timingConfig', message: 'Timing limits must satisfy 0 < fastLimit < mediumLimit < slowLimit.' });
    }
    return errors;
  }

  function expectedTimeMark(status, seconds, config) {
    if (status !== 'C') return 0;
    if (seconds <= config.fastLimit) return 2;
    if (seconds <= config.mediumLimit) return 1;
    if (seconds <= config.slowLimit) return 0.5;
    return 0;
  }

  function validateLedger(ledger) {
    const errors = [];
    if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) return [{ code: 'INVALID_LEDGER', path: '', message: 'Ledger must be a JSON object.' }];
    if (typeof ledger.chapterMid !== 'string' || !ledger.chapterMid.trim()) errors.push({ code: 'MISSING_CHAPTER_MID', path: 'chapterMid', message: 'Ledger is missing its chapter MID.' });
    if (!ledger.concepts || typeof ledger.concepts !== 'object' || Array.isArray(ledger.concepts)) {
      errors.push({ code: 'INVALID_CONCEPTS', path: 'concepts', message: 'Ledger concepts must be an object.' });
      return errors;
    }
    let hasAttempts = false;
    for (const [conceptMid, questions] of Object.entries(ledger.concepts)) {
      if (!questions || typeof questions !== 'object' || Array.isArray(questions)) {
        errors.push({ code: 'INVALID_CONCEPT_POOL', path: `concepts.${conceptMid}`, message: 'Concept question pool must be an object keyed by question ID.' });
        continue;
      }
      for (const [questionId, attempts] of Object.entries(questions)) {
        const base = `concepts.${conceptMid}.${questionId}`;
        if (!Array.isArray(attempts)) {
          errors.push({ code: 'INVALID_ATTEMPT_LIST', path: base, message: 'Question attempts must be an array.' });
          continue;
        }
        if (attempts.length) hasAttempts = true;
        for (let index = 0; index < attempts.length; index += 1) {
          const tuple = attempts[index];
          const path = `${base}[${index}]`;
          if (!Array.isArray(tuple) || tuple.length !== 5) {
            errors.push({ code: 'INVALID_ATTEMPT_TUPLE', path, message: 'Attempt must contain [status, integerSeconds, accuracyMark, timeMark, selectedOption].' });
            continue;
          }
          const [status, seconds, accuracyMark, timeMark, selectedOption] = tuple;
          if (!Object.prototype.hasOwnProperty.call(ACCURACY, status)) errors.push({ code: 'INVALID_STATUS', path: `${path}[0]`, message: 'Status must be C, W, or S.' });
          if (!Number.isInteger(seconds) || seconds <= 0) errors.push({ code: 'INVALID_DURATION', path: `${path}[1]`, message: 'Attempt duration must be a positive integer number of seconds.' });
          if (!Number.isFinite(accuracyMark) || !Number.isFinite(timeMark)) errors.push({ code: 'INVALID_MARK', path, message: 'Accuracy and time marks must be finite numbers.' });
          if (status === 'S' ? selectedOption !== '-' : !/^[A-D]$/.test(String(selectedOption || ''))) errors.push({ code: 'INVALID_SELECTED_OPTION', path: `${path}[4]`, message: 'Correct/wrong attempts require option A–D; skipped attempts require -.' });
          if (Object.prototype.hasOwnProperty.call(ACCURACY, status) && Number.isFinite(accuracyMark) && !CLOSE(accuracyMark, ACCURACY[status])) errors.push({ code: 'INCORRECT_ACCURACY_MARK', path: `${path}[2]`, message: `Status ${status} must use accuracy mark ${ACCURACY[status]}.` });
        }
      }
    }
    const config = ledger.timingConfig;
    if (hasAttempts || config?.locked === true) errors.push(...timingConfigErrors(config));
    if (hasAttempts && config?.locked === true) {
      for (const [conceptMid, questions] of Object.entries(ledger.concepts)) {
        if (!questions || typeof questions !== 'object') continue;
        for (const [questionId, attempts] of Object.entries(questions)) {
          if (!Array.isArray(attempts)) continue;
          attempts.forEach((tuple, index) => {
            if (!Array.isArray(tuple) || tuple.length !== 5 || !Object.prototype.hasOwnProperty.call(ACCURACY, tuple[0]) || !Number.isInteger(tuple[1]) || tuple[1] <= 0 || !Number.isFinite(tuple[3])) return;
            const expected = expectedTimeMark(tuple[0], tuple[1], config);
            if (!CLOSE(tuple[3], expected)) errors.push({ code: 'INCORRECT_TIME_MARK', path: `concepts.${conceptMid}.${questionId}[${index}][3]`, message: `This attempt's time mark must be ${expected} for its status and duration.` });
          });
        }
      }
    }
    return errors;
  }

  function calculateMetrics(ledger) {
    const errors = validateLedger(ledger);
    if (errors.length) return { ok: false, errors, metrics: null };
    const counts = { TQ: 0, NQC: 0, NQW: 0, NQS: 0, NQNA: 0, NQF: 0, NQM: 0, NQSl: 0, NQOT: 0 };
    let armnt = 0;
    let ntm = 0;
    const config = ledger.timingConfig || {};
    for (const questions of Object.values(ledger.concepts)) {
      for (const attempts of Object.values(questions)) {
        counts.TQ += 1;
        if (!attempts.length) { counts.NQNA += 1; continue; }
        const [status, seconds] = attempts[attempts.length - 1];
        armnt += ACCURACY[status];
        if (status === 'C') {
          counts.NQC += 1;
          if (seconds <= config.fastLimit) counts.NQF += 1;
          else if (seconds <= config.mediumLimit) counts.NQM += 1;
          else if (seconds <= config.slowLimit) counts.NQSl += 1;
          else counts.NQOT += 1;
          ntm += expectedTimeMark(status, seconds, config);
        } else if (status === 'W') counts.NQW += 1;
        else counts.NQS += 1;
      }
    }
    const invariants = [
      { code: 'STATUS_COUNTS', passed: counts.NQC + counts.NQW + counts.NQS + counts.NQNA === counts.TQ, expression: 'NQC + NQW + NQS + NQNA = TQ' },
      { code: 'CORRECT_TIME_TIERS', passed: counts.NQF + counts.NQM + counts.NQSl + counts.NQOT === counts.NQC, expression: 'NQF + NQM + NQSl + NQOT = NQC' },
      { code: 'TOTAL_COUNTS', passed: counts.NQF + counts.NQM + counts.NQSl + counts.NQOT + counts.NQW + counts.NQS + counts.NQNA === counts.TQ, expression: 'NQF + NQM + NQSl + NQOT + NQW + NQS + NQNA = TQ' }
    ];
    const invariantErrors = invariants.filter((item) => !item.passed).map((item) => ({ code: `INVARIANT_${item.code}`, path: 'metrics', message: `Invariant failed: ${item.expression}.` }));
    if (invariantErrors.length) return { ok: false, errors: invariantErrors, metrics: null };
    const maximumMarks = counts.TQ * 3;
    const lifetimeMarks = armnt + ntm;
    return {
      ok: true,
      errors: [],
      invariants,
      metrics: {
        ...counts,
        MM: maximumMarks,
        ARMNT: armnt,
        NTM: ntm,
        LTM: lifetimeMarks,
        AM: maximumMarks - lifetimeMarks,
        completionPercent: maximumMarks ? lifetimeMarks / maximumMarks * 100 : null
      }
    };
  }

  function conceptToken(conceptMid) {
    const value = String(conceptMid || '').toUpperCase();
    const match = /^C(\d+)$/.exec(value);
    if (match) return `CN${match[1]}`;
    if (value === 'UN') return 'UN';
    return `CN${value.replace(/[^A-Z0-9]+/g, '') || '0'}`;
  }

  function selectConceptMid(questionMids, enclosingConceptMid, chapterMid) {
    const root = String(chapterMid || '').trim().toUpperCase();
    const mids = Array.isArray(questionMids) ? questionMids : String(questionMids || '').split('/');
    for (const value of mids) {
      const parts = String(value || '').trim().toUpperCase().replace(/\s+/g, '').split('.');
      const midRoot = parts.shift() || '';
      const concept = parts.join('.');
      if (midRoot === root && /^(?:C\d+|UN)$/.test(concept)) return concept;
    }
    const enclosing = String(enclosingConceptMid || '').trim().toUpperCase();
    return /^(?:C\d+|UN)$/.test(enclosing) ? enclosing : 'UN';
  }

  function assignPermanentId(ledger, conceptMid, signature) {
    ledger.identity ||= { nextIndexByConcept: {}, signatureToId: {}, retiredAttemptsByConcept: {} };
    ledger.identity.nextIndexByConcept ||= {};
    ledger.identity.signatureToId ||= {};
    const concept = String(conceptMid || 'UN').toUpperCase();
    const registry = ledger.identity.signatureToId[concept] ||= {};
    const key = String(signature || '');
    if (registry[key]) return registry[key];
    let next = Number.isInteger(ledger.identity.nextIndexByConcept[concept]) && ledger.identity.nextIndexByConcept[concept] > 0 ? ledger.identity.nextIndexByConcept[concept] : 1;
    const prefix = `${ledger.chapterMid}-${conceptToken(concept)}-q`;
    const used = new Set([
      ...Object.values(ledger.identity.signatureToId).flatMap((items) => Object.values(items)),
      ...Object.values(ledger.concepts || {}).flatMap((questions) => Object.keys(questions || {}))
    ]);
    const priorIndexes = [...used].map((id) => id.startsWith(prefix) ? Number(id.slice(prefix.length)) : 0).filter(Number.isInteger);
    if (priorIndexes.length) next = Math.max(next, Math.max(...priorIndexes) + 1);
    while (used.has(`${prefix}${next}`)) next += 1;
    const id = `${prefix}${next}`;
    registry[key] = id;
    ledger.identity.nextIndexByConcept[concept] = next + 1;
    return id;
  }

  function reconcileQuestionPool(ledger, pool, conceptMids = []) {
    ledger.identity ||= { nextIndexByConcept: {}, signatureToId: {}, retiredAttemptsByConcept: {} };
    ledger.identity.nextIndexByConcept ||= {};
    ledger.identity.signatureToId ||= {};
    ledger.identity.retiredAttemptsByConcept ||= {};
    ledger.questionMeta ||= {};
    const oldConcepts = ledger.concepts && typeof ledger.concepts === 'object' ? ledger.concepts : {};
    const nextConcepts = {};
    const nextMeta = { ...ledger.questionMeta };
    const activeIds = new Set();
    for (const entry of pool) {
      const concept = String(entry.conceptMid || 'UN').toUpperCase();
      nextConcepts[concept] ||= {};
      const signature = String(entry.signature || '');
      const id = assignPermanentId(ledger, concept, signature);
      const oldAttempts = oldConcepts[concept]?.[id];
      const retired = ledger.identity.retiredAttemptsByConcept[concept] || {};
      nextConcepts[concept][id] = Array.isArray(oldAttempts) ? oldAttempts : Array.isArray(retired[id]) ? retired[id] : [];
      delete retired[id];
      activeIds.add(id);
      nextMeta[id] = { ...(nextMeta[id] || {}), conceptMid: concept, sourceFile: entry.sourceFile || '', type: entry.type || 'UNTYPED', text: entry.text || '', mids: Array.isArray(entry.mids) ? entry.mids : [], signature, active: true };
    }
    for (const [concept, questions] of Object.entries(oldConcepts)) {
      ledger.identity.retiredAttemptsByConcept[concept] ||= {};
      for (const [id, attempts] of Object.entries(questions || {})) {
        if (!activeIds.has(id)) {
          ledger.identity.retiredAttemptsByConcept[concept][id] = Array.isArray(attempts) ? attempts : [];
          if (nextMeta[id]) nextMeta[id] = { ...nextMeta[id], active: false };
        }
      }
    }
    const currentConcepts = new Set([...pool.map((entry) => String(entry.conceptMid || 'UN').toUpperCase()), ...conceptMids.map((concept) => String(concept || '').toUpperCase()).filter(Boolean)]);
    currentConcepts.forEach((concept) => { nextConcepts[concept] ||= {}; });
    ledger.concepts = nextConcepts;
    ledger.questionMeta = nextMeta;
    return ledger;
  }

  function clearAttempts(ledger) {
    for (const questions of Object.values(ledger.concepts || {})) for (const id of Object.keys(questions || {})) questions[id] = [];
    ledger.identity ||= {};
    ledger.identity.retiredAttemptsByConcept = {};
    ledger.lastUpdated = null;
    ledger.timingConfig = { locked: false, fastLimit: null, mediumLimit: null, slowLimit: null };
    return ledger;
  }

  return { ACCURACY, createLedger, timingConfigErrors, expectedTimeMark, validateLedger, calculateMetrics, conceptToken, selectConceptMid, assignPermanentId, reconcileQuestionPool, clearAttempts };
});
