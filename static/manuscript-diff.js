(function (root) {
  'use strict';
  // Compare complete sentences, so shared suffixes inside a changed sentence
  // never leave holes in its highlight.
  function sentences(text) {
    const result = [];
    const segmenter = new Intl.Segmenter('ko', {granularity: 'sentence'});
    let offset = 0;
    for (const line of text.split('\n')) {
      for (const item of segmenter.segment(line)) {
        const leading = item.segment.length - item.segment.trimStart().length;
        const value = item.segment.trim();
        if (value) result.push({
          key: value.replace(/\s+/g, ' '),
          start: offset + item.index + leading,
          end: offset + item.index + item.segment.trimEnd().length,
        });
      }
      offset += line.length + 1;
    }
    return result;
  }
  function changedSentences(before, after) {
    if (before === after) return [];
    const a = sentences(before), b = sentences(after);
    const unchanged = new Set();
    let prefix = 0;
    while (prefix < a.length && prefix < b.length && a[prefix].key === b[prefix].key) {
      unchanged.add(prefix++);
    }
    const height = a.length - prefix, width = b.length - prefix;
    // Keep the exact LCS choices, including the original tie-breaking rule,
    // but store each choice in two bits instead of retaining every score.
    const choices = new Uint8Array(Math.ceil(height * width / 4));
    let next = new Uint32Array(width + 1), row = new Uint32Array(width + 1);
    for (let i = height - 1; i >= 0; i--) {
      for (let j = width - 1; j >= 0; j--) {
        let choice = 0;
        if (a[prefix + i].key === b[prefix + j].key) row[j] = next[j + 1] + 1;
        else if (next[j] >= row[j + 1]) { row[j] = next[j]; choice = 1; }
        else { row[j] = row[j + 1]; choice = 2; }
        const cell = i * width + j;
        choices[Math.floor(cell / 4)] |= choice << ((cell % 4) * 2);
      }
      [next, row] = [row, next];
    }
    let i = 0, j = 0;
    while (i < height && j < width) {
      const cell = i * width + j;
      const choice = (choices[Math.floor(cell / 4)] >> ((cell % 4) * 2)) & 3;
      if (choice === 0) { unchanged.add(prefix + j); i++; j++; }
      else if (choice === 1) i++;
      else j++;
    }
    return b.filter((_, index) => !unchanged.has(index));
  }
  function highlight(original, revised) {
    const originalBlocks = [...original.querySelectorAll('p,h4')];
    const revisedBlocks = [...revised.querySelectorAll('p,h4')];
    const ranges = changedSentences(
      originalBlocks.map(block => block.textContent).join('\n'),
      revisedBlocks.map(block => block.textContent).join('\n'),
    );
    let offset = 0;
    for (const block of revisedBlocks) {
      const text = block.textContent;
      const fragment = document.createDocumentFragment();
      let cursor = 0;
      for (const range of ranges) {
        const start = Math.max(0, range.start - offset);
        const end = Math.min(text.length, range.end - offset);
        if (end <= start) continue;
        fragment.append(document.createTextNode(text.slice(cursor, start)));
        const mark = document.createElement('mark');
        mark.className = 'manuscript-sentence-change';
        mark.textContent = text.slice(start, end);
        fragment.append(mark);
        cursor = end;
      }
      fragment.append(document.createTextNode(text.slice(cursor)));
      block.replaceChildren(fragment);
      offset += text.length + 1;
    }
  }
  root.manuscriptDiff = {changedSentences, highlight};
  if (typeof module !== 'undefined') module.exports = root.manuscriptDiff;
})(typeof window !== 'undefined' ? window : globalThis);
