// verseTitle.js
//
// What the recording's own name gives away, before a second of it is heard.
//
// These files are very often filed by their subject - "BG 2.13", "SB 1.1.1
// morning class", a folder named after a canto - which is a free answer to
// "what is this lecture about" available at the moment the player opens.
//
// It is the lecture's subject, though, not what is being recited at any given
// moment, so what it produces is only a starting point. Anything actually heard
// replaces it, and it never enters the history: the history records moments in
// the recording, and this belongs to no moment.
//
// This used to also work out the recording's language, for picking between an
// English and a Hindi model. There is one model now - see VerseModelStore.java
// - so there is nothing to pick.

import {lastCitation} from './citations';
import {lookup} from './corpusText';
import {phoneticStream} from './phonetics';
import {NativeModules} from 'react-native';

const {VerseRecognition} = NativeModules;

// How much of a title has to be a song's name before it counts as naming it.
//
// These files are named like "IDT Bhajans - Gauranga Bolite Habe-02 - Radhanath
// Swami", so the name is in there surrounded by things that are not it, and a
// containment test is the honest shape of the question.
//
// Ten characters because short names are not evidence. "Bolo Hari Bolo" folded
// down is fourteen and specific; "Nitai" is five and appears in half the
// library, including in the names of people rather than songs.
const MIN_NAME = 10;

/** The folded length of a name, ignoring the word breaks. */
const weight = key => key.replace(/ /g, '').length;

const words = key => key.trim().split(/\s+/).filter(Boolean);

const editDistance = (left, right) => {
  const row = Array.from({length: right.length + 1}, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const above = row[j];
      row[j] = left[i - 1] === right[j - 1]
        ? diagonal
        : 1 + Math.min(diagonal, row[j], row[j - 1]);
      diagonal = above;
    }
  }
  return row[right.length];
};

const soundWord = word => phoneticStream(word);

// Compare one title word after phonetic normalisation. A one-character error
// is useful for ordinary spelling variants, but short words stay exact so a
// generic word such as "hari" cannot absorb an unrelated title.
const wordSimilarity = (left, right) => {
  if (left === right) return 1;
  if (left.length < 4 || right.length < 4) return 0;
  const distance = editDistance(left, right);
  return distance <= 1 ? 0.8 : 0;
};

/**
 * Match corpus words as an ordered subsequence of the recording title.
 * Additional title words are allowed between or around the song name; the
 * song's own words still have to appear in order.
 */
const titleMatch = (nameKey, titleKey) => {
  const name = words(nameKey).map(soundWord);
  const title = words(titleKey).map(soundWord);
  let from = 0;
  let score = 0;
  let internalExtras = 0;

  for (const wanted of name) {
    let best = -1;
    let bestSimilarity = 0;
    for (let i = from; i < title.length; i++) {
      const similarity = wordSimilarity(wanted, title[i]);
      if (similarity > bestSimilarity) {
        best = i;
        bestSimilarity = similarity;
      }
    }
    if (best === -1) return null;
    if (from > 0) internalExtras += best - from;
    score += bestSimilarity;
    from = best + 1;
  }

  // Extra words are harmless, but a match with fewer internal gaps is more
  // convincing than one assembled from distant common words.
  return score / name.length - internalExtras * 0.04;
};

/**
 * Letters and word breaks, no diacritics, no case - what survives being written
 * down, with the gaps between words still in it.
 *
 * The gaps are the point. Stripping them entirely is the obvious thing to do
 * and it is wrong: a title reading "Jaya Radha Madhava-01 - Radhanath Swami"
 * becomes `jayaradhamadhavaradhanathswami`, which contains
 * `jayaradhamadhavaradha` - so the corpus record "Jaya Radha Madhava Radha",
 * a different song entirely, matched more of the title than the song the file
 * is actually of, and the longest-match rule preferred it. The extra `radha`
 * came out of the word `Radhanath`.
 *
 * Single spaces, and one at each end, so a name can be tested for as a run of
 * whole words rather than as a substring that may begin or end mid-word.
 */
const fold = text =>
  ` ${(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    // Titles commonly use the English spelling while the corpus uses IAST.
    // Keep the word boundaries, but make this common spelling variant meet.
    .replace(/\bkrishna\b/g, 'krsna')
    .trim()} `;

// Built once, from the index rather than the text shards: this needs every
// song's name and nothing else, and the shards are nineteen megabytes.
let names = null;
const songNames = () => {
  if (names) return names;
  names = [];
  // The matcher index already contains the song ids and names. Ask native for
  // that small metadata projection instead of parsing the full songs shard.
  const songs = VerseRecognition?.songNames?.() || [];
  for (const record of songs) {
    const key = fold(record.title);
    if (!key.trim()) continue;
    if (weight(key) >= MIN_NAME) names.push({id: record.id, key});
  }
  return names;
};

/**
 * The verse a title names, as a full record ready to show, or null.
 *
 * Takes the title and the path, because a great many of these are filed under
 * a folder that names the verse when the filename does not.
 */
export const verseFromTitle = (...parts) => {
  const text = parts.filter(Boolean).join(' ');
  if (!text) return null;

  const cited = lastCitation(text);
  if (!cited) return null;

  // A misread number names a verse that does not exist. Failing to resolve is
  // how that gets discarded.
  const record = lookup(cited.id);
  return record ? {...record, id: cited.id} : null;
};

export default verseFromTitle;

/**
 * The song a recording's name says it is, as a record, or null.
 *
 * Not the same claim as `verseFromTitle`. A lecture titled "BG 2.13" is
 * *about* that verse and may never recite it; a recording called "Jaya Radha
 * Madhava" is that song, and the only question is when it starts. What comes
 * first is a pranama, or somebody introducing it, or two minutes of tuning - so
 * this is not something to put on screen. It is something to expect.
 *
 * The longest name wins. Titles carry more than one song's worth of words -
 * "Jaya Radha Madhava" is inside "Jaya Radha Madhava Radha Madhava" - and the
 * longer match is the more specific claim.
 */
export const songFromTitle = (...parts) => {
  const text = fold(parts.filter(Boolean).join(' '));
  if (weight(text) < MIN_NAME) return null;

  let best = null;
  let bestScore = 0;
  for (const name of songNames()) {
    const score = titleMatch(name.key, text);
    if (score === null) continue;
    if (
      !best ||
      score > bestScore ||
      (score === bestScore && weight(name.key) > weight(best.key))
    ) {
      best = name;
      bestScore = score;
    }
  }
  if (!best) return null;

  const record = lookup(best.id);
  return record ? {...record, id: best.id} : null;
};
