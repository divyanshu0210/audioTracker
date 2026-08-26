// Shared HTML→plain-text helpers for note previews and search text.

const NAMED_ENTITIES = {
  nbsp: ' ',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  amp: '&',
};

// Turns &nbsp; / &amp; / &#39; / &#x27; into real characters so they never leak
// into the notes list preview or the FTS index. &amp; is resolved last (it is
// just another named entity here), so "&amp;nbsp;" stays literal "&nbsp;".
export function decodeHtmlEntities(text) {
  if (!text) return '';
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    const named = NAMED_ENTITIES[entity.toLowerCase()];
    return named === undefined ? match : named;
  });
}
