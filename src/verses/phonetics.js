// phonetics.js
//
// Turning both sides of the match into the same alphabet.
//
// The two things being compared here were produced by wildly different
// processes. On one side is a transliterated verse, written by someone who
// knew the Sanskrit: `dehino 'smin yathā dehe kaumāraṁ yauvanaṁ jarā`. On the
// other is whatever an English speech recogniser made of a devotee reciting
// it, which is closer to `day he no smin yata day hey komaram yovanam jara`.
//
// No amount of word-level cleverness bridges that, for two reasons:
//
//  1. Aspiration, retroflexion, vowel length and sibilant place - the four
//     things IAST is most careful about - are exactly the four an English
//     recogniser has no symbols for. It hears `ṭh` and `t` alike, `ś`, `ṣ` and
//     `s` alike, `ā` and `a` alike.
//
//  2. Word boundaries do not survive. Sandhi already glues Sanskrit words
//     together, and the recogniser re-splits the stream on English instincts:
//     `dehino 'smin` comes back as three tokens, none of which is a word in
//     either language.
//
// So this module throws away everything the recogniser cannot hear, and then
// throws away the spaces too. What is left is a consonant-and-vowel stream -
// no boundaries, no length, no aspiration - and matching happens on character
// n-grams over that stream. A window of five characters is long enough to be
// rare and short enough to survive a couple of mis-heard syllables around it,
// which is the whole trick: we never need a whole verse to line up, only some
// window inside it.
//
// Shared, deliberately, by the corpus builder in tools/ and the on-device
// matcher. If the two ever disagreed about what a stream looks like the index
// would be built in one alphabet and queried in another, and nothing would
// ever match - so there is one copy of these rules and both sides import it.

import {devanagariToLatin} from './devanagari';

// Devanagari before anything else.
//
// The Hindi recogniser returns Devanagari, and every rule below this one works
// on Latin letters - so without this step a Hindi result would be stripped to
// an empty string and match nothing, silently, forever. See devanagari.js.
//
// Costs a regex test on text that has none, which is every English result.
const toLatin = str => devanagariToLatin(str);

// Diacritics first: NFD splits `ā` into `a` + combining macron, and the
// combining marks are precisely the information an English recogniser did not
// capture. Dropping the whole U+0300-U+036F block collapses IAST to ASCII in
// one step - ā→a, ṛ→r, ś→s, ṇ→n, ḥ→h, ṁ→m - without a table.
const stripDiacritics = str =>
  str.normalize('NFD').replace(/[̀-ͯ]/g, '');

// Sequences that have to go before the single-character rules, because each is
// a digraph whose halves would otherwise be rewritten separately.
//
// Aspirates collapse onto their unaspirated partner. This is the single
// highest-value rule here: `bhakti` and `bakti` are the same word to every
// recogniser in existence, and half the vocabulary of these texts is aspirated.
//
// `c` is the exception that needs stating: in IAST it already means the sound
// English spells `ch`, so IAST `ca` and a recogniser's `cha` must meet. The
// aspirate rule does that on its own - `ch`→`c` - which is why there is no
// separate entry for it.
const DIGRAPHS = [
  [/kh/g, 'k'],
  [/gh/g, 'g'],
  [/ch/g, 'c'],
  [/jh/g, 'j'],
  [/th/g, 't'],
  [/dh/g, 'd'],
  [/ph/g, 'p'],
  [/bh/g, 'b'],
  // Diphthongs, onto the simple vowel a recogniser is likely to report.
  [/ai/g, 'e'],
  [/au/g, 'o'],
];

const SINGLES = [
  // Vocalic r (IAST ṛ, a bare `r` after the diacritic strip) is heard as `ri`
  // - `kṛṣṇa` comes back from a recogniser as `krishna` far more often than
  // `krshna`. Rewriting `ri`→`r` lands both spellings on `krsna`. It also
  // shortens honest `ri` syllables (`hari`→`har`), which is harmless: the rule
  // runs over the verse and over the recogniser output alike, so the two still
  // meet.
  [/ri/g, 'r'],
  // w and v are one phoneme across these languages, and a recogniser picks
  // whichever the surrounding English suggested.
  [/w/g, 'v'],
  // Nothing is needed for ṅ, ñ and ṇ - the diacritic strip already left all
  // three as plain `n`, which is what an English recogniser hears. `m` keeps
  // its own identity because it is audibly different; anusvara, which the same
  // strip turned into `m`, is genuinely ambiguous and stays there because
  // these texts put it before a labial most of the time, where that is what it
  // sounds like.
];

// Everything that is not a letter is a boundary, and boundaries are exactly
// what this is trying to forget.
const NON_LETTER = /[^a-z]+/g;

/**
 * The same stream with the Sanskrit/Bengali disagreements flattened.
 *
 * More than half the songs here are Bengali, and so is the whole
 * Caitanya-caritamrta. They are written in Sanskrit transliteration and sung in
 * Bengali, which are different sounds: `vande` is sung `bonde`, `jaya` is
 * `joy`. Left alone, that took Bengali matching to 24% for songs and 7% for CC.
 *
 * The first attempt generated a Bengali *pronunciation* of each record and
 * indexed that too. It had to guess which vowels shift - real Bengali does it
 * in some positions and not others - and every wrong guess broke a run, which
 * is why it reached only 62% on the short verses of the Caitanya-caritamrta.
 *
 * This does not guess. Both members of each disputed pair collapse onto one
 * symbol, so `vande` and `bonde` meet whatever the singer did, and the question
 * of which syllables shifted stops being asked. It is the same move the rest of
 * phonetics.js makes about aspiration and vowel length - throw away a
 * distinction that the two sides do not agree on - applied one language later.
 *
 * Used for a second index entry on Bengali records and for a second attempt at
 * matching, not as the primary form: it is a coarser alphabet, and Sanskrit
 * records keep the finer one.
 */
export const neutralise = stream =>
  stream
    .replace(/o/g, 'a')
    .replace(/v/g, 'b')
    .replace(/y/g, 'j')
    .replace(/(.)+/g, '$1');

/**
 * The comparison form of a piece of text: lowercase letters, no spaces.
 *
 * Runs over a verse at build time and over recogniser output at match time,
 * and the two are only ever compared to each other - the value means nothing
 * on its own and is not meant to be read by a person.
 */
export const phoneticStream = text => {
  if (!text) return '';

  let s = stripDiacritics(toLatin(String(text))).toLowerCase();

  // Before the letter rules, so that a hyphen in `giri-vara-dhārī` and a space
  // between two words are treated identically - neither is a sound.
  s = s.replace(NON_LETTER, '');

  for (const [pattern, to] of DIGRAPHS) s = s.replace(pattern, to);
  for (const [pattern, to] of SINGLES) s = s.replace(pattern, to);

  // Visarga and stray h, after the digraphs have consumed every h that was
  // carrying aspiration. Leading h is a real sound (`hare`, `hari`) but with
  // the spaces already gone there is no way to tell a leading h from a medial
  // one, and medial h is the far more common case in these texts.
  s = s.replace(/h/g, '');

  // Gemination is not reliably produced or heard: `sattva` and `satva` are the
  // same recitation. Collapsing runs also mops up doubles the rules above
  // created - `bh`+`b` sequences across a former word boundary, for one.
  s = s.replace(/(.)\1+/g, '$1');

  return s;
};

// Five characters of a boundary-free stream. Short enough that a window can
// sit between two mis-heard syllables, long enough that most of them are rare:
// a 5-gram over a 20-letter alphabet has room for millions of values, and the
// corpus uses a few hundred thousand of them.
export const GRAM_SIZE = 5;

/**
 * Every n-gram of a stream, in order, with duplicates kept.
 *
 * Duplicates matter on the query side - a repeated phrase is evidence, and the
 * maha-mantra is nothing but repeated phrases - so de-duplication, where it
 * happens at all, is the caller's decision.
 */
export const grams = (stream, size = GRAM_SIZE) => {
  const out = [];
  if (!stream || stream.length < size) return out;
  for (let i = 0; i + size <= stream.length; i++) {
    out.push(stream.slice(i, i + size));
  }
  return out;
};

/**
 * FNV-1a, 32-bit, as a *signed* integer.
 *
 * The index stores gram hashes rather than grams. At a million-odd postings
 * the difference between a 4-byte integer and a five-character JavaScript
 * string is the difference between an index that fits on a phone and one that
 * does not, and a collision costs nothing worse than one extra candidate to
 * score - which the scoring pass then throws out.
 */
export const hashGram = gram => {
  let h = 0x811c9dc5;
  for (let i = 0; i < gram.length; i++) {
    h ^= gram.charCodeAt(i);
    // The FNV prime, as shifts: a plain multiply overflows the 53-bit mantissa
    // and stops being the same function across platforms.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h | 0;
};

/** Convenience: text straight to hashed grams, the way both sides want it. */
export const hashedGrams = (text, size = GRAM_SIZE) =>
  grams(phoneticStream(text), size).map(hashGram);
