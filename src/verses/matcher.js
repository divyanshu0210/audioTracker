// matcher.js
//
// Which verse, if any, is being recited right now.
//
// The recogniser hands over a rolling window of the last few seconds as text.
// This turns that into a phonetic stream (see phonetics.js), cuts it into
// overlapping 5-grams, and asks the index which verses contain each one.
//
// The shape of the evidence is what makes this work. Because the grams overlap
// by four characters, a genuine recitation does not scatter hits across a
// verse - it produces a *run* of consecutive query positions all pointing at
// the same verse. Thirty characters of real recitation is twenty-six
// consecutive hits. Coincidence, by contrast, produces isolated hits in
// unrelated places, because Sanskrit shares a lot of short material.
//
// So the score is not how many grams hit. It is how long the longest
// uninterrupted run is, measured back in characters of stream. That single
// change is the difference between a panel that flickers between plausible
// verses and one that sits still on the right one.

import {NativeModules} from 'react-native';

import {
  devanagariStream,
  grams,
  hashGram,
  GRAM_SIZE,
} from './phonetics';
import {isPenalised, tuning} from './tuning';

const {VerseRecognition} = NativeModules;

// Kept small on purpose. Counting hits is cheap; measuring runs is not, so
// only the best few by raw count are looked at properly.
const RERANK_DEPTH = 12;

// How much of the stream has to line up before this is willing to name a
// verse. Twenty-two characters is five or six syllables - about half a line -
// which is where a run stops being something two unrelated verses could share
// by accident.
//
// It was twenty-six, reasoned rather than measured, and it was costing on both
// sides at once. Over 48 real recordings, and over 300 windows of random
// Devanagari soup that is no verse at all:
//
//   floor   found   named the wrong song   named something in soup
//     26    62.5%          4.2%                  0 of 300
//     24    66.7%          2.1%                  0
//     22    68.8%          2.1%                  0
//     20    70.8%          6.3%                  2
//     16    79.2%         10.4%                 13
//
// Twenty-two finds six more recordings than twenty-six *and* halves the wrong
// answers, which is not a trade at all - the old value was simply too high.
// Runs between twenty-two and twenty-six turn out to be mostly real, and
// refusing them did not buy precision, it just meant a song went unnamed and
// some later window named a worse one.
//
// Twenty is where it becomes a trade and stops being worth it: soup starts
// matching, and wrong answers triple.
//
// Checked against speech as well as song, because a floor this low is only
// safe if a lecture does not trip it. Over a ten-minute English lecture put
// through the Sanskrit model - 145 windows of English rendered phonetically in
// Devanagari, which is the worst adversary this has - nothing was named at any
// floor from 26 down to 16.
//
// The shipped value. Read through tuning() at the point of use so a server can
// correct it - see tuning.js. Exported because tests and the corpus builder
// want the number the app ships with, not whatever a device has been told.
export const MIN_RUN_CHARS = 22;

// What a position that is not in this record costs a run in progress.
//
// This is the number that decides whether the panel can be trusted, and the
// reason is not obvious. Matching a window of speech against a verse is local
// alignment, and the first version scored it with no penalty for a gap: a run
// could skip up to six positions for free and pick up on the seventh. That
// tolerance is necessary - a recogniser under a PA system drops a word here and
// mangles one there, and without it a verse that was plainly recited comes back
// as two half-runs that each clear nothing.
//
// But free gaps are sustainable gaps. At one hit in seven, a run crawls forever
// through material that has nothing to do with it, gaining a character each
// time, and forty characters collected across six hundred is indistinguishable
// from forty characters actually recited. That is where the false verses came
// from - measured on Devanagari soup, five percent of windows produced a
// confident match, and the rate rose with window length.
//
// Charging for the gap fixes it at the root, because it makes the crawl
// *lose*. At this penalty a run sustains roughly one miss for every third
// position, so a mangled recitation survives comfortably while soup at one in
// seven drifts negative and dies within a few characters. When the score goes
// negative the run is abandoned and the next hit starts a fresh one, which is
// what stops the alignment wandering out of the verse into the commentary
// either side of it.
//
// Lowering it makes the panel eager and wrong; raising it starts rejecting
// recitations with a dropped word in them. It is the one number worth tuning on
// real recordings, which is precisely why it is no longer written here.
// The number itself lives in tuning.js, so that a value tuned on synthetic
// soup can be corrected by one measured on real recordings without an APK.
// What is above is the reasoning behind the value it ships with.

// How much of a run has to be this record specifically.
//
// A run is allowed to carry neutral grams through it - syllables too common to
// identify anything, which really were heard and really are in the verse. But
// nothing stops a run being made almost entirely of them, and such a run is not
// evidence of this record so much as evidence of Sanskrit in general.
//
// That is the shape of the false positives seen on a device: ordinary speech
// producing a long thin run through the common syllables of some verse, with
// barely any of the verse's own material in it. This asks the question run
// length alone does not - was this record *recognised*, or merely not
// contradicted.
//
// Set low deliberately, because this is a second line of defence rather than
// the cure. The false positives that made this unusable on a device came from
// English and Spanish songs sitting in the corpus, and removing those fixed it
// at the source - with them gone, clean English prose produces no candidate
// that passes the length gate at all.
//
// It is kept because clean prose is not what the recogniser emits. Real output
// on English speech is mangled, and mangled English looks more like
// transliteration than proper English does, so the measured ceiling is an
// optimistic one.
//
// Half would seem the natural threshold and is badly wrong: a verse is only
// ever about half its own material, the rest being syllables shared with
// everything. At 0.5 every mangled verse and every half-line was rejected. At
// this value a recitation scores 46-52% and passes comfortably, while the cost
// to recall is under one percent.
// Also in tuning.js - see the note under MISS_PENALTY above.

/**
 * @param queryHashes hashed grams of the recogniser's output
 * @param minRun      how long a run has to be to be returned. Defaults to the
 *                    threshold the panel uses; the debug view passes 0 to see
 *                    the near-misses, which is the difference between "heard
 *                    nothing" and "nearly had it".
 */

// The packed index and postings lookup live in native code. Keeping this call
// synchronous is intentional: native work is already preloaded and the small
// query result avoids turning the existing store ingestion path async.
export const matchHashes = (queryHashes, minRun) => {
  if (!VerseRecognition?.matchHashes) return [];
  const values = Array.isArray(queryHashes) ? queryHashes : Array.from(queryHashes || []);
  const {minSolidRatio, missPenalty, minRunChars} = tuning();
  return VerseRecognition.matchHashes(
    values,
    minRun === undefined ? minRunChars : minRun,
    minSolidRatio,
    missPenalty,
  );
};

/**
 * The best match, and why it was or was not accepted.
 *
 * Only the debug view wants the reason, but it wants it badly: the near-miss
 * list it draws comes from nearMisses(), which applies the length and solidity
 * gates and nothing else. A candidate can therefore sit at the top of that list
 * looking unanswerable - 65 characters, 41% solid - while this function refuses
 * it for a near-tie that the list does not show, because the tie is in the
 * *scores* and the list prints run lengths. From outside, a correct match and a
 * refused one are the same blank panel.
 *
 * Returns no hit rather than a low-confidence guess on purpose: a wrong verse
 * sitting under the player is worse than no verse at all, because the person
 * cannot tell which one it is without already knowing the answer.
 */
export const identifyDetailed = text => {
  const {minRunChars, ambiguityMargin, penaltyFactor} = tuning();

  const directStream = devanagariStream(text);

  if (directStream.length < minRunChars) {
    return {
      hit: null,
      why: `heard ${directStream.length}ch, need ${minRunChars}`,
    };
  }

  // A close tie is still treated as no match rather than guessing.
  let deadlocked = false;

  let why = 'no candidates';

  /** The gates, applied to one pass's candidates. */
  const decide = candidates => {
    // Verses that many people have reported as wrong have to work harder. They
    // are real records and any of them can genuinely be recited, so this raises
    // the bar rather than removing them - see tuning.js.
    const results = candidates.filter(
      c => !isPenalised(c.id) || c.runChars >= minRunChars * penaltyFactor,
    );
    if (!results.length) {
      why = candidates.length ? 'all candidates penalised' : 'nothing over the gates';
      return null;
    }

    const [best, runnerUp] = results;

    // Two verses matching almost equally well usually means the run landed on
    // something they share - a repeated epithet, or one of the many verses that
    // open the same way. Naming either one would be a coin toss.
    if (
      runnerUp &&
      runnerUp.score >= best.score * ambiguityMargin &&
      runnerUp.id !== best.id
    ) {
      deadlocked = true;
      why =
        `tie: ${best.ref} ${best.score.toFixed(0)} vs ` +
        `${runnerUp.ref} ${runnerUp.score.toFixed(0)}`;
      return null;
    }
    return best;
  };

  const directHashes = s => grams(s, GRAM_SIZE).map(hashGram);
  if (directStream.length >= minRunChars) {
    const directHit = decide(
      matchHashes(directHashes(directStream), minRunChars, false, true),
    );
    if (directHit) return {hit: directHit, why: 'matched (Devanagari)'};
    if (deadlocked) return {hit: null, why};
  }

  return {hit: null, why};
};

/** The best match for a piece of recogniser output, or null. */
export const identify = text => identifyDetailed(text).hit;

/**
 * The best few candidates regardless of whether any is good enough.
 *
 * Only the debug view calls this. It is the question that matters when nothing
 * is appearing: is the recogniser producing something that nearly matches a
 * verse, or something that resembles nothing in the corpus at all? Those look
 * identical from a blank panel and have completely different causes.
 */
export const nearMisses = (text, howMany = 3) => {
  const stream = devanagariStream(text);
  if (!stream) return [];
  return matchHashes(grams(stream, GRAM_SIZE).map(hashGram), 0, false, true)
    .slice(0, howMany)
    .map(c => ({
      ref: c.ref,
      runChars: c.runChars,
      // What the ambiguity gate actually compares. Run length is what the eye
      // reads, and the two can disagree completely - a short record the run
      // covers most of scores like a long one it barely touches.
      score: c.score,
      solidRatio: c.solidRatio,
    }));
};
