'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../public/tracker-engine');

const ledger = Engine.createLedger('PN', 'Pronoun');
ledger.timingConfig = { locked: true, fastLimit: 20, mediumLimit: 35, slowLimit: 50 };
ledger.concepts = {
  C1: {
    'PN-CN1-q1': [['W', 45, -0.5, 0, 'B'], ['C', 20, 1, 2, 'A']],
    'PN-CN1-q2': [['C', 21, 1, 1, 'C']],
    'PN-CN1-q3': [['C', 36, 1, 0.5, 'D']],
    'PN-CN1-q4': [['C', 51, 1, 0, 'A']],
    'PN-CN1-q5': [['W', 42, -0.5, 0, 'C']],
    'PN-CN1-q6': [['S', 8, -0.2, 0, '-']],
    'PN-CN1-q7': []
  }
};
const result = Engine.calculateMetrics(ledger);
assert.equal(result.ok, true);
assert.deepEqual(result.errors, []);
assert.deepEqual(result.invariants.map((item) => item.passed), [true, true, true]);
assert.deepEqual({
  TQ: result.metrics.TQ, NQC: result.metrics.NQC, NQW: result.metrics.NQW, NQS: result.metrics.NQS, NQNA: result.metrics.NQNA,
  NQF: result.metrics.NQF, NQM: result.metrics.NQM, NQSl: result.metrics.NQSl, NQOT: result.metrics.NQOT,
  MM: result.metrics.MM, ARMNT: result.metrics.ARMNT, NTM: result.metrics.NTM, LTM: result.metrics.LTM, AM: result.metrics.AM
}, { TQ: 7, NQC: 4, NQW: 1, NQS: 1, NQNA: 1, NQF: 1, NQM: 1, NQSl: 1, NQOT: 1, MM: 21, ARMNT: 3.3, NTM: 3.5, LTM: 6.8, AM: 14.2 });
assert.ok(Math.abs(result.metrics.completionPercent - (6.8 / 21 * 100)) < 1e-9);

const negative = Engine.createLedger('PN', 'Pronoun');
negative.timingConfig = { locked: true, fastLimit: 20, mediumLimit: 35, slowLimit: 50 };
negative.concepts = { C1: { 'PN-CN1-q1': [['W', 10, -0.5, 0, 'B']] } };
assert.equal(Engine.calculateMetrics(negative).metrics.completionPercent, -0.5 / 3 * 100);
assert.equal(Engine.calculateMetrics(negative).metrics.AM, 3.5);

const corrupt = JSON.parse(JSON.stringify(negative));
corrupt.concepts.C1['PN-CN1-q1'][0][1] = 1.5;
const corruptResult = Engine.calculateMetrics(corrupt);
assert.equal(corruptResult.ok, false);
assert.ok(corruptResult.errors.some((item) => item.code === 'INVALID_DURATION'));
assert.equal(corruptResult.metrics, null);
const badThresholds = { locked: true, fastLimit: 20, mediumLimit: 20, slowLimit: 50 };
assert.ok(Engine.timingConfigErrors(badThresholds).some((item) => item.code === 'INVALID_TIMING_ORDER'));

const ids = Engine.createLedger('PN', 'Pronoun');
Engine.reconcileQuestionPool(ids, [
  { conceptMid: 'C1', signature: 'sig-a', sourceFile: 'part-1.html', text: 'A' },
  { conceptMid: 'C1', signature: 'sig-b', sourceFile: 'part-1.html', text: 'B' }
], ['C1', 'C2']);
assert.deepEqual(Object.keys(ids.concepts.C1), ['PN-CN1-q1', 'PN-CN1-q2']);
assert.deepEqual(Object.keys(ids.concepts.C2), []);
ids.concepts.C1['PN-CN1-q1'].push(['C', 10, 1, 2, 'A']);
Engine.reconcileQuestionPool(ids, [
  { conceptMid: 'C1', signature: 'sig-b', sourceFile: 'part-1.html', text: 'B' },
  { conceptMid: 'C1', signature: 'sig-c', sourceFile: 'part-1.html', text: 'C' }
], ['C1']);
assert.deepEqual(Object.keys(ids.concepts.C1), ['PN-CN1-q2', 'PN-CN1-q3']);
assert.deepEqual(ids.identity.retiredAttemptsByConcept.C1['PN-CN1-q1'], [['C', 10, 1, 2, 'A']]);
assert.equal(ids.identity.nextIndexByConcept.C1, 4);
Engine.reconcileQuestionPool(ids, [
  { conceptMid: 'C1', signature: 'sig-a', sourceFile: 'part-1.html', text: 'A' },
  { conceptMid: 'C1', signature: 'sig-b', sourceFile: 'part-1.html', text: 'B' }
], ['C1']);
assert.ok(Object.hasOwn(ids.concepts.C1, 'PN-CN1-q1'));
assert.equal(ids.concepts.C1['PN-CN1-q1'][0][0], 'C');
assert.equal(Engine.conceptToken('C1'), 'CN1');
assert.equal(Engine.selectConceptMid(['PN.C2', 'PN.C1'], 'C1', 'PN'), 'C2');
assert.equal(Engine.selectConceptMid('PN.C3/PN.C1', 'C1', 'PN'), 'C3');
assert.equal(Engine.selectConceptMid([], 'C1', 'PN'), 'C1');
assert.equal(Engine.selectConceptMid(['OTHER.C9'], '', 'PN'), 'UN');

const beforeReset = ids.identity.nextIndexByConcept.C1;
ids.timingConfig = { locked: true, fastLimit: 20, mediumLimit: 35, slowLimit: 50 };
Engine.clearAttempts(ids);
assert.equal(ids.timingConfig.locked, false);
assert.equal(ids.identity.nextIndexByConcept.C1, beforeReset);
assert.ok(Object.values(ids.concepts.C1).every((attempts) => attempts.length === 0));

const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const studio = fs.readFileSync(path.join(__dirname, '../public/studio.js'), 'utf8');
const tracker = fs.readFileSync(path.join(__dirname, '../public/tracker.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
assert.match(indexHtml, /data-page="tracker"/);
assert.match(indexHtml, /id="tracker-page"/);
assert.match(studio, /window\.refreshTracker/);
assert.match(server, /tracker-ledger\.json/);
assert.match(server, /app\.get\('\/api\/tracker'/);
assert.match(server, /app\.get\('\/api\/tracker\/:folder'/);
assert.match(server, /app\.put\('\/api\/tracker\/:folder\/timing'/);
assert.match(server, /app\.post\('\/api\/tracker\/:folder\/reset'/);
assert.match(server, /req\.body\?\.confirm !== true/);
assert.doesNotMatch(tracker, /localStorage/);

console.log('Tracker tests passed: latest-attempt metrics, negative percentages, timing validation, invariants, permanent ID sequence, reset safety, and local Tracker wiring.');
