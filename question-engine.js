'use strict';

const { calculatePastedBatchCompletion } = require('./public/question-batch');

const normalizeMid = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, '').replace(/,+/g, '/').replace(/\/+$/g, '');
const parseMids = (value) => [...new Set(normalizeMid(value).split('/').map((item) => item.trim()).filter(Boolean))];
const rootOf = (mid) => normalizeMid(mid).split('.')[0] || '';
const conceptOf = (mid) => normalizeMid(mid).split('.').slice(1).join('.') || '';

function readField(block, name, stop = /<(?:qn\s+type|Options|answer|ans|explanation|mid|gap|text|type)\s*(?:=|>)/i) {
  const match = new RegExp(`<${name}\\s*=\\s*`, 'i').exec(block);
  if (!match) return '';
  const start = match.index + match[0].length;
  const tail = block.slice(start);
  const end = stop.exec(tail);
  return tail.slice(0, end ? end.index : tail.length).trim().replace(/>\s*$/, '').trim();
}
function parseQuestionBlocks(source) {
  const blocks = [...String(source || '').matchAll(/<Qn\b[^>]*>([\s\S]*?)<\/Qn\s*>/gi)];
  return blocks.map((match, index) => {
    const body = match[1];
    const rawMids = readField(body, 'mid');
    const rawType = readField(body, 'type') || (/<qn\s+type\s*=\s*([^>]+)>/i.exec(body)?.[1] || '');
    const type = normalizeQuestionType(rawType);
    const gap = readField(body, 'gap');
    const text = readField(body, 'text', /<(?:Options|answer|ans|explanation|mid|gap)\s*(?:=|>)/i);
    const options = /<Options\s*>([\s\S]*?)<\/Options\s*>/i.exec(body);
    const answer = /<(?:answer|ans)\s*=\s*([A-D])\s*>/i.exec(body)?.[1]?.toUpperCase() || '';
    return { index: index + 1, block: match[0], start: match.index, end: match.index + match[0].length, mids: parseMids(rawMids), rawMids, type, rawType, gap, text, hasOptions: Boolean(options && /<[A-D](?:\s*=|\s+)/i.test(options[1])), answer };
  });
}
function normalizeQuestionType(value) { return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase(); }
function normalizeQuestionText(value) { return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase(); }
function uniqueQuestionsByText(questions) {
  const seen = new Set();
  return questions.filter((question) => {
    const key = normalizeQuestionText(question.text);
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function scanConcepts(content) {
  const result = [];
  const pattern = /<mid\s*=\s*([\w.-]+)\s*>([\s\S]*?)<\/mid\s*>/gi;
  let match;
  while ((match = pattern.exec(String(content || '')))) {
    if (!/^(?:C\d+|UN)$/i.test(match[1].trim())) continue;
    const heading = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]\s*>/i.exec(match[2]);
    const title = heading ? heading[1].replace(/<[^>]+>/g, '').trim() : match[1];
    result.push({ localMid: normalizeMid(match[1]), title, start: match.index, end: pattern.lastIndex, body: match[2] });
  }
  return result;
}
function validateQuestion(q) {
  const issues = [];
  if (!q.mids.length) issues.push('Missing <mid = ...>');
  if (!q.type) issues.push('Missing <type = ...>');
  if (!q.text) issues.push('Missing <text = ...>');
  if (!q.hasOptions) issues.push('Missing <Options> or options');
  if (!q.answer) issues.push('Missing <answer = ...>');
  return issues;
}
function calculateChapterReadiness(mappedUnique, unmapped) {
  const total = mappedUnique + unmapped;
  return total === 0 ? { label: 'N/A (0 Questions)', percent: null, total } : { label: `${Math.round(mappedUnique / total * 100)}%`, percent: mappedUnique / total * 100, total };
}
function gapsByFrequency(questions) {
  const counts = new Map();
  questions.forEach((question) => { const label = String(question.gap || '').trim() || 'General Unmapped'; counts.set(label, (counts.get(label) || 0) + 1); });
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
module.exports = { normalizeMid, parseMids, rootOf, conceptOf, readField, parseQuestionBlocks, normalizeQuestionType, normalizeQuestionText, uniqueQuestionsByText, scanConcepts, validateQuestion, calculateChapterReadiness, calculatePastedBatchCompletion, gapsByFrequency };
