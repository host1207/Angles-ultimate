(function (root) {
  'use strict';
  function calculatePastedBatchCompletion(source) {
    const text = String(source || '');
    const total = (text.match(/<\/Qn\s*>/gi) || []).length;
    let unmapped = 0;
    const byRoot = {};
    let globalTotal = 0;
    let globalUnmapped = 0;
    for (const match of text.matchAll(/<Qn\b[^>]*>([\s\S]*?)<\/Qn\s*>/gi)) {
      const mids = [...match[1].matchAll(/<mid\s*=\s*([^>]+)>/gi)].flatMap((item) => item[1].split(/[\/,]/).map((value) => value.trim().toUpperCase().replace(/\s+/g, '')).filter(Boolean));
      const hasUn = mids.some((mid) => mid.split('.').includes('UN'));
      if (hasUn) unmapped++;
      const roots = [...new Set(mids.map((mid) => mid.split('.')[0]).filter((chapterRoot) => chapterRoot && chapterRoot !== 'UN'))];
      roots.forEach((chapterRoot) => {
        if (!byRoot[chapterRoot]) byRoot[chapterRoot] = { total: 0, unmapped: 0 };
        byRoot[chapterRoot].total++;
        if (mids.some((mid) => mid.startsWith(`${chapterRoot}.`) && mid.split('.')[1] === 'UN')) byRoot[chapterRoot].unmapped++;
      });
      if (mids.some((mid) => mid.startsWith('UN.'))) { globalTotal++; if (hasUn) globalUnmapped++; }
    }
    unmapped = Math.min(total, unmapped);
    return { total, unmapped, completed: total - unmapped, completion: total ? (total - unmapped) / total * 100 : null, byRoot, globalTotal, globalUnmapped };
  }
  const api = { calculatePastedBatchCompletion };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AnglesQuestionBatch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
