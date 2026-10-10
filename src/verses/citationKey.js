// citationKey.js
//
// The form a single word is compared in, when reading a spoken citation.
//
// Deliberately much gentler than phoneticStream, and the reason is a collision.
// phoneticStream drops aspiration - it turns `saat` (seven) and `saath` (sixty)
// into the same three letters, which would make every citation containing
// either one a coin toss. Sanskrit can afford that flattening because a verse
// is matched on thirty characters of context; a number word is four characters
// with no context at all, and has to survive.
//
// So this keeps aspiration and keeps `h`, and fixes only the three things that
// genuinely differ between how the recogniser writes a word and how a person
// romanises it:
//
//   script     Devanagari from the Hindi model, romanised the same way the
//              matcher does it
//   ch/c       Devanagari `च` transliterates to `c`, while every romanisation
//              of Hindi writes it `ch`
//   final a    Devanagari writes an inherent vowel that Hindi does not
//              pronounce - `चार` is `caara` on paper and `char` out loud

import {devanagariToLatin} from './devanagari';

/**
 * One word, in comparison form.
 *
 * Returns '' for anything with no letters in it, which callers treat as
 * "not a word" rather than as a key.
 */
export const citationKey = word => {
  if (!word) return '';

  let s = devanagariToLatin(String(word))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

  if (!s) return '';

  // Longest first: `chh` has to go before `ch` can eat half of it.
  s = s.replace(/chh/g, 'c').replace(/ch/g, 'c');

  // Doubled letters are a romanisation choice, not a sound: `ikkis` and `ikis`
  // are one word, and so are `caara` and `cara`.
  s = s.replace(/(.)\1+/g, '$1');

  // The unpronounced inherent vowel. Only at the end - a medial one is real,
  // and dropping it would merge words that are genuinely different.
  s = s.replace(/a$/, '');

  return s;
};
