'use strict';
const assert = require('node:assert/strict');
const engine = require('../question-engine');
const MKML = require('../public/mkml.js');

assert.equal(engine.normalizeMid(' pn.c3 '), 'PN.C3');
assert.deepEqual(engine.parseMids('pn.c2 / PN.c6'), ['PN.C2', 'PN.C6']);
assert.equal(engine.rootOf('pn.c3'), 'PN');
assert.equal(engine.conceptOf('PN.C3'), 'C3');
const batch = `<qn-ingest><Qn><mid = PN.C2 / PN.C6><type =  sentence   improvement ><text = A prompt.><Options><A = Yes><B = No></Options><answer = B></Qn><Qn><mid = PN.UN><type = Fill In the Blanks><gap = Pronoun Order (1-2-3 Rule)><text = Another prompt.><Options><A = Yes><B = No></Options><answer = A></Qn></qn-ingest>`;
const parsed = engine.parseQuestionBlocks(batch);
assert.equal(parsed.length, 2);
assert.deepEqual(parsed[0].mids, ['PN.C2', 'PN.C6']);
assert.equal(parsed[0].text, 'A prompt.');
assert.equal(parsed[0].type, 'SENTENCE IMPROVEMENT');
const legacyTypeTag = engine.parseQuestionBlocks('<Qn><mid = PN.C2 / PN.C4><qn type = error spotting><text = Q?><Options><A = Yes><B = No></Options><answer = A></Qn>')[0];
assert.equal(legacyTypeTag.type, 'ERROR SPOTTING');
assert.deepEqual(legacyTypeTag.mids, ['PN.C2', 'PN.C4']);
assert.deepEqual(engine.validateQuestion(legacyTypeTag), []);
assert.deepEqual(engine.uniqueQuestionsByText([{ text: 'Same <b>prompt</b>' }, { text: ' same prompt ' }]).length, 1);
assert.deepEqual(engine.validateQuestion(parsed[0]), []);
assert.equal(parsed[1].mids[0], 'PN.UN');
assert.equal(parsed[1].gap, 'Pronoun Order (1-2-3 Rule)');
assert.equal(parsed[1].text, 'Another prompt.');
assert.equal(parsed[1].type, 'FILL IN THE BLANKS');
const legacyQuestion = engine.parseQuestionBlocks('<Qn><mid = PN.C1><text = Old card><Options><A = One><B = Two></Options><answer = A></Qn>')[0];
assert.equal(legacyQuestion.type, '');
assert.ok(engine.validateQuestion(legacyQuestion).includes('Missing <type = ...>'));
assert.equal(legacyQuestion.type || 'UNTYPED', 'UNTYPED');
assert.deepEqual(engine.gapsByFrequency([{ gap: 'Ordering' }, { gap: 'Ordering' }, { gap: '' }]), [{ label: 'Ordering', count: 2 }, { label: 'General Unmapped', count: 1 }]);
assert.deepEqual(engine.calculateChapterReadiness(0, 0), { label: 'N/A (0 Questions)', percent: null, total: 0 });
assert.deepEqual(engine.calculateChapterReadiness(0, 50), { label: '0%', percent: 0, total: 50 });
const batchForCompletion = '<Qn><mid = PN.C1><text = a></Qn><Qn><mid = PN.C2 / PN.UN / UN.UN><text = b></Qn><Qn><mid = UN.UN><text = c></Qn><Qn><mid = PN.C3><text = d></Qn><Qn><mid = PN.C4><text = e></Qn>';
assert.deepEqual(engine.calculatePastedBatchCompletion(batchForCompletion), { total: 5, unmapped: 2, completed: 3, completion: 60, byRoot: { PN: { total: 4, unmapped: 1 } }, globalTotal: 2, globalUnmapped: 2 });
const tenQuestionBatch = [
  'PN.C2', 'PN.C4 / PN.C5', 'PN.C7', 'PN.un', 'BS.C1', 'BS.UN',
  'BS.C1 / BS.UN', 'PR.C1', 'UN.UN', 'un.un'
].map((mid) => `<Qn><mid = ${mid}><text = Sample></Qn>`).join('');
assert.deepEqual(engine.calculatePastedBatchCompletion(tenQuestionBatch), {
  total: 10, unmapped: 5, completed: 5, completion: 50,
  byRoot: { PN: { total: 4, unmapped: 1 }, BS: { total: 3, unmapped: 2 }, PR: { total: 1, unmapped: 0 } },
  globalTotal: 2, globalUnmapped: 2
});
const notes = '<mid = c1><h2>Case Matrix</h2><qn all><Qn><mid = PN.C1><text = Case?><Options><A = One><B = Two></Options><answer = A></Qn></qn all></mid><mid = c2><h2>Order</h2></mid>';
assert.deepEqual(engine.scanConcepts(notes).map((item) => [item.localMid, item.title]), [['C1', 'Case Matrix'], ['C2', 'Order']]);
const compiled = MKML.compile('<mid = c1><h2>Case Matrix</h2><qn all><Qn><mid = PN.C1/PN.C2><gap = Missing Order><text = Prompt><Options><A = One><B = Two></Options><answer = A></Qn></qn all></mid>');
assert.match(compiled, /class="mkml-mid-concept" data-mid="C1"/);
assert.match(compiled, /class="mkml-question-mid">PN\.C1\/PN\.C2/);
assert.match(compiled, /class="mkml-question-gap">GAP · Missing Order/);
assert.match(MKML.compile('<qn all><Qn><type = sentence improvement><text = Prompt><Options><A = One><B = Two></Options><answer = A></Qn></qn all>'), /class="mkml-question-type">SENTENCE IMPROVEMENT/);
assert.doesNotMatch(compiled, /<mid\s*=|<gap\s*=/i);
console.log('Question Index tests passed: normalization, parsing, validation, wrapper scan, badge rendering, readiness, and unmapped gaps.');
