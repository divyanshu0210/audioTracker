// citations.js
//
// "Bhagavad-gita, chapter four, text seven."
//
// The other way a verse announces itself, and the easier one by a distance.
// A lecturer almost always names a verse before reciting it, and that sentence
// is ordinary English - the one thing an English recogniser is actually good
// at. Numbers in particular come back near-perfect, where the Sanskrit that
// follows comes back as mush.
//
// So this runs alongside the phonetic matcher rather than instead of it, and
// covers exactly the case the matcher is weakest at: the moment *before* the
// recitation starts, when there is no Sanskrit to match yet.
//
// None of this is indexed. Gram-indexing the spoken form of nine thousand
// citations would add well over a million postings, almost all of them the
// same few syllables of "srimad bhagavatam canto" repeated - an enormous index
// for something a twenty-line parser does exactly.

import {citationKey} from './citationKey';
import {devanagariToLatin} from './devanagari';
import {HINDI_FILLER, HINDI_HUNDRED, HINDI_NUMBERS} from './hindiNumbers';

// Everything below compares words as `citationKey` renders them, not as they
// are written. That is what lets one table serve the Hindi recogniser's
// Devanagari, a romanisation of the same word, and the English model's output
// alike - see citationKey.js for why it is gentler than phoneticStream.
//
// Recognisers write small numbers as words and large ones as digits, with no
// consistency about where the line falls, so both have to be read.
const UNIT_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
  // Heard often enough to be worth having.
  won: 1, to: 2, too: 2, for: 4, ate: 8,
};

const TEN_WORDS = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};

// Keyed like everything else. Without this, `thirteen` keys to `thirten` -
// citationKey collapses the doubled e - and stops matching its own entry.
const keyTable = table =>
  Object.fromEntries(Object.entries(table).map(([word, value]) => [citationKey(word), value]));

const UNITS = keyTable(UNIT_WORDS);
const TENS = keyTable(TEN_WORDS);

const HUNDRED = citationKey('hundred');
const AND = citationKey('and');

/**
 * Read a number off the front of `words`, starting at `at`.
 *
 * Returns {value, next} or null. Handles "thirty seven", "one hundred eight"
 * and a bare "47" alike, and stops at the first word that is not part of a
 * number so the caller can carry on reading the sentence.
 */
const readNumber = (words, at) => {
  let value = null;
  let i = at;

  while (i < words.length) {
    const token = words[i];
    const word = token.key;

    // A Hindi numeral is a single word with no internal structure - `sattais`
    // is twenty-seven and shares nothing with `tees`. So it is looked up whole,
    // before any of the English composition rules get a chance at it.
    const hindi = HINDI_NUMBERS[word];
    if (hindi !== undefined) {
      if (value !== null && value % 100 === 0) value += hindi;
      else if (value !== null) break;
      else value = hindi;
      i++;
      continue;
    }

    if (word === HINDI_HUNDRED && value !== null) {
      value *= 100;
      i++;
      continue;
    }

    if (token.digits) {
      // A digit string ends the number - "chapter 4 7" is two numbers, not
      // forty-seven.
      if (value !== null) break;
      value = Number(token.digits);
      i++;
      break;
    }

    if (word === HUNDRED && value !== null) {
      value *= 100;
      i++;
      continue;
    }

    if (word === AND && value !== null) {
      // "one hundred and eight" - but only mid-number, never to start one.
      i++;
      continue;
    }

    if (TENS[word] !== undefined) {
      if (value !== null && value % 100 !== 0) break;
      value = (value || 0) + TENS[word];
      i++;
      continue;
    }

    if (UNITS[word] !== undefined) {
      if (value === null) value = UNITS[word];
      else if (value % 10 === 0) value += UNITS[word];
      else break;
      i++;
      continue;
    }

    break;
  }

  // "and" alone is not a number, and a trailing one should not be eaten.
  if (value === null) return null;
  return {value, next: i};
};

// Devanagari, Latin letters and digits all count as word characters here; the
// keying afterwards is what makes the first two comparable.
const WORD = /[ऀ-ॿ]+|[a-zA-Z]+|[0-9०-९]+/g;

const normalise = text => {
  const raw = String(text || '').match(WORD) || [];
  // Both forms are kept: the key for matching vocabulary, and a plain form for
  // reading digits off, since keying strips them.
  return raw.map(word => {
    const latin = devanagariToLatin(word).toLowerCase();
    return {
      key: citationKey(word),
      digits: /^[0-9]+$/.test(latin) ? latin : null,
    };
  });
};

// How the books get named out loud. Order matters: the longer name has to be
// tried first, or "srimad bhagavatam" matches the Gita's pattern on "bhagavad".
const BOOKS = rekey([
  {
    book: 'sb',
    depth: 3, // canto, chapter, text
    names: [
      ['srimad', 'bhagavatam'],
      ['srimad', 'bhagavatham'],
      ['shrimad', 'bhagavatam'],
      ['shrimad', 'bhagwatam'],
      ['bhagavat', 'purana'],
      ['bhagavatam'],
      ['bhagavatham'],
      ['bhagwatam'],
      // How a filename writes it, which is where most citations with an
      // abbreviation come from. Harmless in speech: nobody says "ess bee".
      ['sb'],
      ['srimad', 'bhagavatam'],
    ],
  },
  {
    book: 'cc',
    // A lila, then a chapter and a text. The lila is a word rather than a
    // number, so it is read separately - see `lilas`.
    depth: 2,
    lilas: {
      adi: 'adi',
      aadi: 'adi',
      adilila: 'adi',
      madhya: 'madhya',
      madya: 'madhya',
      madhyalila: 'madhya',
      antya: 'antya',
      antyalila: 'antya',
    },
    names: [
      ['sri', 'caitanya', 'caritamrta'],
      ['caitanya', 'caritamrta'],
      ['chaitanya', 'charitamrita'],
      ['chaitanya', 'charitamrta'],
      ['caitanya', 'charitamrita'],
      ['cc'],
    ],
  },
  {
    book: 'bg',
    depth: 2, // chapter, text
    names: [
      ['bhagavad', 'gita'],
      ['bhagavat', 'gita'],
      ['bhagwad', 'gita'],
      ['bhagavad', 'geeta'],
      ['bhagavad', 'geet'],
      ['gita'],
      ['geeta'],
      ['bg'],
    ],
  },
]);

// Words that sit between the numbers and mean nothing to the citation, in
// either language.
const FILLER = new Set([
  ...[
    'chapter', 'text', 'verse', 'canto', 'sloka', 'shloka', 'number', 'no',
    'the', 'of', 'in', 'from', 'purport', 'translation', 'lila',
  ].map(citationKey),
  ...HINDI_FILLER,
]);

/** Run every vocabulary string through citationKey, once, at load. */
function rekey(books) {
  return books.map(book => ({
    ...book,
    names: book.names.map(name => name.map(citationKey)),
    lilas: book.lilas
      ? Object.fromEntries(
          Object.entries(book.lilas).map(([word, lila]) => [citationKey(word), lila]),
        )
      : undefined,
  }));
}

/**
 * Whether a book's name starts at this position.
 *
 * Matches a multi-word name against consecutive tokens, and also against a
 * single token spelling the whole thing - because Devanagari writes these as
 * compounds. `भगवद्गीता` is one word where "bhagavad gita" is two, and both
 * have to find the Gita.
 */
const matchesAt = (words, at, name) => {
  if (name.every((part, k) => words[at + k]?.key === part)) return name.length;
  if (name.length > 1 && words[at]?.key === name.join('')) return 1;
  return 0;
};

/**
 * Every verse citation spoken in a piece of text, most recent last.
 *
 * Returns ids in the same namespace the corpus uses - `bg-4.7`, `sb-1.2.6` -
 * so a hit can be handed straight to corpusText.lookup. An id is returned
 * whether or not that verse exists; the caller finds out by looking it up,
 * which is also how a misheard number gets discarded.
 */
export const findCitations = text => {
  const words = normalise(text);
  const found = [];

  for (let i = 0; i < words.length; i++) {
    for (const {book, depth, names, lilas} of BOOKS) {
      let consumed = 0;
      for (const candidate of names) {
        consumed = matchesAt(words, i, candidate);
        if (consumed) break;
      }
      if (!consumed) continue;

      let at = i + consumed;

      // The Caitanya-caritamrta is divided by lila rather than by canto, and
      // the divisions are named, not numbered. Without one there is no way to
      // tell Madhya 2.62 from Adi 2.62, so a citation missing it is discarded
      // rather than guessed at.
      let lila = null;
      if (lilas) {
        while (at < words.length && FILLER.has(words[at])) at++;
        lila = lilas[words[at]?.key];
        if (!lila) break;
        at++;
      }

      // Collect `depth` numbers, stepping over the filler words between them.
      const numbers = [];

      while (numbers.length < depth && at < words.length) {
        if (FILLER.has(words[at].key)) {
          at++;
          continue;
        }
        const read = readNumber(words, at);
        if (!read) break;
        numbers.push(read.value);
        at = read.next;
      }

      if (numbers.length === depth && numbers.every(n => n > 0)) {
        const tail = numbers.join('.');
        found.push({
          id: lila ? `cc-${lila}-${tail}` : `${book}-${tail}`,
          book,
          ref: lila
            ? `CC ${lila.charAt(0).toUpperCase()}${lila.slice(1)} ${tail}`
            : `${book === 'bg' ? 'BG' : 'SB'} ${tail}`,
          at: i,
        });
        i = at - 1;
      }
      break;
    }
  }

  return found;
};

/** The last citation spoken, or null - which is the one being read out now. */
export const lastCitation = text => {
  const all = findCitations(text);
  return all.length ? all[all.length - 1] : null;
};
