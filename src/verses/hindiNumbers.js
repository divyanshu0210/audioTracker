// hindiNumbers.js
//
// Hindi numerals, for reading a citation spoken in Hindi.
//
// Written out one by one because Hindi numbers are not compositional the way
// English ones are. English builds "twenty seven" from two words this parser
// can read separately; Hindi has `sattais`, a single word sharing very little
// with either `sattaais`-anything or `tees`. There is no rule to apply, so
// there is a table.
//
// It runs to a hundred, which covers every canto, every chapter in all four
// books, and the great majority of verses. Past that, `sau` multiplies - "ek
// sau ikkis" for 121 - the same way `hundred` does on the English side.
//
// The keys are what `citationKey` produces, not what anybody writes: the
// recogniser returns Devanagari and a person typing would use one of several
// romanisations, and both get folded onto the same key before any of this is
// consulted. What is listed below are the readable forms, and the keying
// happens once at load.

import {citationKey} from './citationKey';

// Readable forms, several per number where romanisation genuinely varies. The
// Devanagari the Hindi recogniser actually emits is not listed: it transliterates
// onto these same keys, which is the entire point of doing it this way.
const WORDS = {
  0: ['shunya', 'shoonya'],
  1: ['ek'],
  2: ['do'],
  3: ['teen', 'tin'],
  4: ['char', 'chaar'],
  5: ['panch', 'paanch'],
  6: ['chhah', 'chhe', 'che', 'chah'],
  7: ['saat'],
  8: ['aath'],
  9: ['nau'],
  10: ['das', 'dus'],
  11: ['gyarah', 'gyara'],
  12: ['barah', 'bara'],
  13: ['terah', 'tera'],
  14: ['chaudah', 'chauda'],
  15: ['pandrah', 'pandra'],
  16: ['solah', 'sola'],
  17: ['satrah', 'satra'],
  18: ['atharah', 'athara'],
  19: ['unnis', 'unnees'],
  20: ['bees', 'bis'],
  21: ['ikkis', 'ikkees'],
  22: ['bais', 'baees'],
  23: ['teis'],
  24: ['chaubis', 'chaubees'],
  25: ['pachchis', 'pachees'],
  26: ['chhabbis', 'chhabbees'],
  27: ['sattais'],
  28: ['atthais'],
  29: ['untis', 'unatis'],
  30: ['tees', 'tis'],
  31: ['ikattis'],
  32: ['battis'],
  33: ['taintis'],
  34: ['chauntis'],
  35: ['paintis'],
  36: ['chhattis'],
  37: ['saintis'],
  38: ['adtis', 'adhtis'],
  39: ['untalis'],
  40: ['chalis', 'chaalis'],
  41: ['iktalis'],
  42: ['bayalis'],
  43: ['taintalis'],
  44: ['chavvalis'],
  45: ['paintalis'],
  46: ['chhiyalis'],
  47: ['saintalis'],
  48: ['adtalis'],
  49: ['unchas'],
  50: ['pachas', 'pachaas'],
  51: ['ikyavan'],
  52: ['bavan'],
  53: ['tirpan'],
  54: ['chauvan'],
  55: ['pachpan'],
  56: ['chhappan'],
  57: ['sattavan'],
  58: ['atthavan'],
  59: ['unsath'],
  60: ['saath'],
  61: ['iksath'],
  62: ['basath'],
  63: ['tirsath'],
  64: ['chausath'],
  65: ['painsath'],
  66: ['chhiyasath'],
  67: ['sarsath'],
  68: ['adsath'],
  69: ['unhattar'],
  70: ['sattar'],
  71: ['ikhattar'],
  72: ['bahattar'],
  73: ['tihattar'],
  74: ['chauhattar'],
  75: ['pachhattar'],
  76: ['chihattar'],
  77: ['sathattar'],
  78: ['athhattar'],
  79: ['unasi'],
  80: ['assi'],
  81: ['ikyasi'],
  82: ['bayasi'],
  83: ['tirasi'],
  84: ['chaurasi'],
  85: ['pachasi'],
  86: ['chhiyasi'],
  87: ['sattasi'],
  88: ['atthasi'],
  89: ['navasi'],
  90: ['nabbe'],
  91: ['ikyanave'],
  92: ['banave'],
  93: ['tiranave'],
  94: ['chauranave'],
  95: ['pachanave'],
  96: ['chhiyanave'],
  97: ['sattanave'],
  98: ['atthanave'],
  99: ['ninyanave'],
  100: ['sau'],
};

/** key -> value, built once. */
export const HINDI_NUMBERS = (() => {
  const table = {};
  for (const [value, forms] of Object.entries(WORDS)) {
    for (const form of forms) {
      const key = citationKey(form);
      // First writer wins, so a collision cannot silently redefine a smaller
      // number. The test in __tests__ asserts there are none.
      if (key && table[key] === undefined) table[key] = Number(value);
    }
  }
  return table;
})();

/** Every distinct readable form, for the collision test. */
export const HINDI_NUMBER_FORMS = WORDS;

/** The multiplier word, as a key. */
export const HINDI_HUNDRED = citationKey('sau');

// Structural words in a spoken Hindi citation: "Bhagavad-gita adhyaya char
// shlok saat". Same role as chapter/text/verse on the English side.
export const HINDI_FILLER = [
  'adhyaya', 'adhyay', 'shlok', 'shloka', 'sloka', 'skandh', 'skandha',
  'canto', 'sarga', 'padya', 'mein', 'ka', 'ke', 'ki', 'se',
].map(citationKey);
