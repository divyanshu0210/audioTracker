// Vaishnava songs, from kksongs.org.
//
// The half of this feature that verse citation cannot help with. Nobody
// announces a bhajan before singing it - the kirtan simply starts - so a song
// is only ever found by what it sounds like, which makes the lyrics the whole
// of the evidence.
//
// The site indexes songs A-Z at /songs/official/song_<letter>.html, each row
// linking a page at /songs/<letter>/<slug>.html laid out as:
//
//   Song Name: ...   Author: ...   Book Name: ...   Language: ...
//   LYRICS:
//   (1) <line> <line> ...
//   (2) ...
//   WORD FOR WORD TRANSLATION: ...
//   TRANSLATION
//   1) ...
//
// Pages are windows-1252 and spell diacritics as numeric entities (&#257; for
// ā), so they are fetched as 1252 and the entities decoded by hand - see
// fetch.js for why the encoding is passed explicitly.

const {fetchText, mapLimit} = require('../fetch');

// kksongs carries songs written *in* English and in Spanish - translations set
// to music, and original compositions by western devotees. They are real songs
// and people really sing them, but they are ruinous in this corpus, because
// their lyrics are ordinary sentences and so is everything a lecturer says.
//
// The effect on a device was immediate and total: the panel named a verse every
// few seconds through plain English speech, matching things like "I'm Living in
// the Material World" and "Que Grande Es Tu Gracia Krsna". Worse, each false
// match then blocked the real verse behind it, so the feature was not merely
// noisy - it was prevented from working at all.
//
// Function words separate them, but only carefully chosen ones. The first
// attempt included `es`, `en`, `tu`, `oh` and `al`, and promptly ranked a
// Sanskrit song above every Spanish one - all five are ordinary Sanskrit
// syllables. What is left below is words of three letters or more that cannot
// be mistaken for transliteration.
//
// Measured over the whole corpus, that puts every foreign song between 8% and
// 29% and every transliterated one at or below 5%, with nothing in between.
const FOREIGN_WORDS = new RegExp(
  // Built rather than written as a literal. The word boundaries are the whole
  // point of it, and a backslash-b inside a regex literal is one bad escape
  // away from being an actual backspace character - which matches nothing,
  // silently, and looks exactly like the filter never running at all.
  String.raw`\b(` +
    [
      // English
      'the', 'and', 'you', 'that', 'for', 'with', 'are', 'was', 'have',
      'from', 'this', 'his', 'her', 'will', 'your', 'our', 'has', 'been',
      'were', 'they', 'their', 'there', 'what', 'when', 'who', 'how', 'but',
      'not', 'can', 'would', 'should',
      // Spanish
      'que', 'los', 'las', 'del', 'por', 'con', 'como', 'pero', 'muy',
      'cuando', 'donde', 'senor', 'hijo', 'cielo', 'gracia', 'grande',
      'mundo', 'vida', 'amor', 'pies', 'eterna', 'quien', 'sabe', 'divino',
      'suprema', 'hermanos', 'querida', 'reverencias', 'saludo', 'gozo',
      'orillas', 'bosque', 'llamas', 'veces', 'tambien', 'siempre',
      'nuestro', 'nuestra', 'aurora', 'nacimiento',
    ].join('|') +
  String.raw`)\b`,
  'gi',
);

// Between the 5% a transliterated song reaches by coincidence and the 8% the
// least foreign of the foreign ones reaches.
const MAX_FOREIGN_RATIO = 0.07;

// Languages whose lyrics are words rather than transliterated syllables.
//
// kksongs labels most songs, and the label is a far better signal than any
// word heuristic: it catches the eleven Spanish songs outright, where a list
// of English function words never could. The heuristic above is still needed
// for the three hundred songs carrying no label at all, which is where the
// English ones were hiding.
const FOREIGN_LANGUAGES = new Set([
  'english', 'spanish', 'portuguese', 'french', 'german', 'italian',
  'russian', 'dutch', 'polish', 'czech', 'hungarian', 'swedish',
]);

const isForeignLanguage = language =>
  !!language && FOREIGN_LANGUAGES.has(language.replace(/[^a-z]/gi, '').toLowerCase());

/** Whether a song's lyrics are words of a spoken language, not transliteration. */
const isForeignLyric = lines => {
  const text = lines.join(' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  if (!words) return false;
  const hits = (text.match(FOREIGN_WORDS) || []).length;
  return hits / words > MAX_FOREIGN_RATIO;
};

const BASE = 'http://kksongs.org';
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

const SONG_LINK = /href="(https?:\/\/(?:www\.)?kksongs\.org\/songs\/[a-z]\/[^"]+\.html)"/gi;

const decodeEntities = str =>
  str
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

// Block tags become newlines so verse structure survives; everything else is
// dropped. Done before entity decoding, so an encoded < in the text cannot
// turn into a tag halfway through.
const toLines = html =>
  decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n')
    .map(l => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean);

const FIELD = (lines, label) => {
  // Labels wrap across the source's table cells, so the join has already
  // happened by the time we see them: "Song Name: Jaya Radha Madhava".
  const joined = lines.join('\n');
  const m = joined.match(new RegExp(`${label}\s*:?\s*([^\n]*)`, 'i'));
  const value = m ? m[1].trim() : '';
  return value && !/^none$/i.test(value) ? value : null;
};

function parseSong(html, url) {
  const lines = toLines(html);

  const lyricsAt = lines.findIndex(l => /^LYRICS\s*:?\s*$/i.test(l) || /^LYRICS\s*:/i.test(l));
  if (lyricsAt === -1) return null;

  // Lyrics end where the apparatus begins, whichever of these comes first.
  const endAt = lines.findIndex(
    (l, i) =>
      i > lyricsAt &&
      /^(WORD\s*FOR\s*WORD|TRANSLATION|Remarks|SYNONYMS|PURPORT)/i.test(l),
  );

  const body = lines.slice(lyricsAt + 1, endAt === -1 ? lines.length : endAt);

  // "(1)", "(2)" are stanza markers, not lyrics. Dropped from the text but
  // used to keep stanzas apart.
  const stanzas = [];
  let current = [];
  for (const line of body) {
    if (/^\(?\d+\)?\.?$/.test(line)) {
      if (current.length) stanzas.push(current);
      current = [];
      continue;
    }
    const cleaned = line.replace(/^\(\d+\)\s*/, '').trim();
    if (cleaned) current.push(cleaned);
  }
  if (current.length) stanzas.push(current);

  const lyricLines = stanzas.flat();
  // A page with a heading and nothing under it is a stub; there are a few.
  if (lyricLines.length < 2) return null;

  // Sung in a language whose lyrics are words rather than transliterated
  // syllables - see the notes above. Nothing downstream can tell such lyrics
  // from a lecturer talking, so each one matches ordinary speech and then
  // blocks the real verse behind it.
  //
  // Two signals because neither covers the other: the label catches the Spanish
  // songs, which no English word list would, and the word heuristic catches the
  // English ones, which carry no label at all.
  if (isForeignLanguage(FIELD(lines, 'Language')) || isForeignLyric(lyricLines)) {
    return null;
  }

  const name = FIELD(lines, 'Song\s*Name') || lines[0];
  if (!name) return null;

  let translation = '';
  if (endAt !== -1) {
    const tAt = lines.findIndex((l, i) => i >= endAt && /^TRANSLATION/i.test(l));
    if (tAt !== -1) {
      const tEnd = lines.findIndex((l, i) => i > tAt && /^(Remarks|PURPORT|Home)/i.test(l));
      translation = lines
        .slice(tAt + 1, tEnd === -1 ? Math.min(tAt + 40, lines.length) : tEnd)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  const slug = url.split('/').pop().replace(/\.html$/, '');

  return {
    id: `song-${slug}`,
    kind: 'song',
    book: 'songs',
    ref: name,
    title: name,
    lines: lyricLines,
    devanagari: null,
    translation,
    author: FIELD(lines, 'Author'),
    bookName: FIELD(lines, 'Book\s*Name'),
    language: FIELD(lines, 'Language'),
    sourceUrl: url,
  };
}

module.exports = async function loadSongs({concurrency = 6, onProgress} = {}) {
  const urls = new Set();

  for (const letter of LETTERS) {
    let indexHtml;
    try {
      indexHtml = await fetchText(`${BASE}/songs/official/song_${letter}.html`, 'windows-1252');
    } catch (err) {
      console.warn(`  song index ${letter}: ${err.message}`);
      continue;
    }
    let m;
    SONG_LINK.lastIndex = 0;
    while ((m = SONG_LINK.exec(indexHtml))) urls.add(m[1].replace('www.', ''));
  }

  const list = [...urls];
  let done = 0;

  const {results, failures} = await mapLimit(list, concurrency, async url => {
    const html = await fetchText(url, 'windows-1252');
    const song = parseSong(html, url);
    if (onProgress) onProgress(++done, list.length, song ? song.ref : `(skipped) ${url}`);
    return song;
  });

  if (failures.length) {
    console.warn(`  ${failures.length} song page(s) failed`);
    failures.slice(0, 5).forEach(f => console.warn(`    ${f.item}: ${f.error}`));
  }

  return results.filter(Boolean);
};
