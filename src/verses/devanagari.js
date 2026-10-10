// devanagari.js
//
// Devanagari to Latin letters, so that the Hindi recogniser's output and the
// corpus can be compared at all.
//
// This is not cosmetic and it is not optional. Vosk's Hindi model has a
// Devanagari lexicon: what it returns for a recognised verse is
// `देहिनोऽस्मिन्यथा देहे`, not a romanisation of it. Everything downstream -
// phoneticStream, the gram index, the citation parser - works in Latin letters
// and would have thrown every one of those characters away, turning each Hindi
// result into an empty string. The Hindi half of the feature would have run,
// listened, recognised speech correctly, and matched nothing at all, with
// nothing anywhere reporting a fault.
//
// The mapping deliberately does not aim at a scholarly transliteration. It aims
// at whatever phoneticStream is going to do next, which throws away aspiration,
// vowel length and sibilant place anyway - so `ख` is written `kha` rather than
// `k͟h` because the rule after this one collapses `kh` to `k`, and `श` `ष` and
// `स` are all `s` for the same reason. What matters is only that Devanagari and
// IAST land on the same string.

// Independent vowels - the forms that stand at the start of a syllable.
const VOWELS = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ii', 'उ': 'u', 'ऊ': 'uu',
  'ऋ': 'ri', 'ॠ': 'ri', 'ऌ': 'li', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o',
  'औ': 'au', 'ऑ': 'o', 'ऍ': 'e',
};

// Matras - the same vowels written as marks on a consonant. Each one replaces
// the inherent `a` that the consonant carried.
const MATRAS = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ii', 'ु': 'u', 'ू': 'uu', 'ृ': 'ri',
  'ॄ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o',
  'ॅ': 'e',
};

const CONSONANTS = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n',
  'च': 'c', 'छ': 'ch', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n', 'ऩ': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ऱ': 'r', 'ल': 'l', 'ळ': 'l', 'ऴ': 'l',
  'व': 'v', 'श': 's', 'ष': 's', 'स': 's', 'ह': 'h',
  // Nukta forms, which Hindi uses for borrowed sounds.
  'क़': 'k', 'ख़': 'kh', 'ग़': 'g', 'ज़': 'z', 'ड़': 'r', 'ढ़': 'rh', 'फ़': 'f',
};

const DIGITS = {
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
};

const VIRAMA = '्';
const NUKTA = '़';
const ANUSVARA = 'ं';
const CANDRABINDU = 'ँ';
const VISARGA = 'ः';
const AVAGRAHA = 'ऽ';

// Which nasal an anusvara stands for, given what comes next.
const LABIALS = new Set(['प', 'फ', 'ब', 'भ', 'म']);

const nasalBefore = (input, at) => {
  for (let i = at; i < input.length; i++) {
    const ch = input[i];
    if (CONSONANTS[ch]) return LABIALS.has(ch) ? 'm' : 'n';
    // Step over a nukta; stop at anything else that ends the syllable.
    if (ch !== NUKTA) break;
  }
  return 'm';
};

/** Whether a string contains any Devanagari at all - the cheap early exit. */
export const hasDevanagari = text => /[ऀ-ॿ]/.test(String(text || ''));

/**
 * Devanagari to Latin letters.
 *
 * Text with no Devanagari in it comes back unchanged, so this is safe to run
 * over everything rather than only over what is known to need it - which
 * matters because a Hindi result can be a single Devanagari word inside a line
 * of otherwise Latin output.
 *
 * The one piece of real logic is the inherent vowel: a bare consonant in
 * Devanagari carries an `a` that is not written, and a following matra or
 * virama takes it away again. So each consonant emits its `a` immediately and
 * the next character removes it if it has to, which is why the output is built
 * as an array of pieces rather than a string.
 */
export const devanagariToLatin = text => {
  const input = String(text || '');
  if (!hasDevanagari(input)) return input;

  const out = [];
  // Index in `out` of an inherent `a` that a matra or virama may still cancel.
  let pendingVowel = -1;

  for (let i = 0; i < input.length; i++) {
    let ch = input[i];

    // A nukta modifies the consonant before it, and the pair has its own entry.
    if (input[i + 1] === NUKTA && CONSONANTS[ch + NUKTA]) {
      ch = ch + NUKTA;
      i++;
    }

    const consonant = CONSONANTS[ch];
    if (consonant) {
      out.push(consonant);
      out.push('a');
      pendingVowel = out.length - 1;
      continue;
    }

    const matra = MATRAS[ch];
    if (matra !== undefined) {
      // Replaces the inherent vowel rather than following it.
      if (pendingVowel >= 0) out[pendingVowel] = matra;
      else out.push(matra);
      pendingVowel = -1;
      continue;
    }

    if (ch === VIRAMA) {
      // Explicitly no vowel: the consonant joins the next one.
      if (pendingVowel >= 0) out[pendingVowel] = '';
      pendingVowel = -1;
      continue;
    }

    const vowel = VOWELS[ch];
    if (vowel) {
      out.push(vowel);
      pendingVowel = -1;
      continue;
    }

    if (ch === ANUSVARA || ch === CANDRABINDU) {
      // Anusvara is not a sound of its own - it takes the place of whatever
      // consonant follows it. `स्कंध` is skandh, not skamdh, and writing it `m`
      // regardless broke every Hindi citation using a word like it.
      //
      // Labials keep `m`; everything else, and the end of a word, becomes `n`.
      // That is coarser than the real rule, which distinguishes five places of
      // articulation, but the four non-labial ones all collapse to `n` in both
      // things that read this.
      out.push(nasalBefore(input, i + 1));
      pendingVowel = -1;
      continue;
    }

    if (ch === VISARGA) {
      out.push('h');
      pendingVowel = -1;
      continue;
    }

    if (ch === AVAGRAHA) {
      // Marks an elided vowel and is silent.
      pendingVowel = -1;
      continue;
    }

    const digit = DIGITS[ch];
    if (digit) {
      out.push(digit);
      pendingVowel = -1;
      continue;
    }

    if (ch === NUKTA) continue;

    // Danda, punctuation, spaces, and anything Latin already: kept as-is, so a
    // mixed line survives.
    out.push(ch === '।' || ch === '॥' ? ' ' : ch);
    pendingVowel = -1;
  }

  return out.join('');
};
