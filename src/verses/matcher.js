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

import {Buffer} from 'buffer';

import {phoneticStream, grams, hashGram} from './phonetics';

// Kept small on purpose. Counting hits is cheap; measuring runs is not, so
// only the best few by raw count are looked at properly.
const RERANK_DEPTH = 12;

// How much of the stream has to line up before this is willing to name a
// verse. Twenty-six characters is roughly six or seven syllables - about a
// half-line - which is the point where a run stops being something two
// unrelated verses could share by accident.
//
// Raising it makes the panel slower to appear and more often right; lowering
// it makes it eager and wrong. It is the one number worth tuning on real
// recordings.
export const MIN_RUN_CHARS = 26;

// How many query positions a run may skip over and still be one run.
//
// Without this the match has to be perfectly contiguous, and that is not a
// condition real recognition ever meets. A recogniser under a PA system drops
// a word here and mangles one there, and each of those severs the run at that
// point - so a verse that was plainly recited comes back as two runs of
// fifteen characters, neither of which clears MIN_RUN_CHARS, and the panel
// shows nothing. Measured against degraded input, contiguous-only matching
// recognised about one recitation in eight.
//
// A dropped word does not cost as much as it looks like it should: with the
// stream already joined, only the four or five grams straddling the seam are
// junk, and the alignment picks straight back up afterwards. Six covers that
// and leaves no room to wander - the gap is skipped, never counted, so a run
// stitched across one is worth exactly the characters actually heard.
const MAX_GAP = 6;

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
const MIN_SOLID_RATIO = 0.22;

// Both the parse and the decode happen once, on first use, rather than at
// import.
//
// The index is six megabytes of JSON, most of it base64 - and `import` at the
// top of this file would spend that on the first launch that so much as
// reaches this module, including every launch that never plays anything. The
// require below runs inside load(), which runs on the first match attempt,
// which only happens once recognition is actually listening.
let decoded = null;

const unpackInts = b64 => {
  const bytes = Buffer.from(b64, 'base64');
  // Copied rather than viewed: Buffer hands back a slice of a shared pool at
  // an arbitrary byte offset, and Int32Array over an unaligned offset throws.
  const out = new Int32Array(bytes.byteLength / 4);
  for (let i = 0; i < out.length; i++) out[i] = bytes.readInt32LE(i * 4);
  return out;
};

const load = () => {
  if (decoded) return decoded;
  const index = require('./corpus/index.json');
  decoded = {
    docs: index.docs,
    common: unpackInts(index.common),
    hashes: unpackInts(index.hashes),
    starts: unpackInts(index.starts),
    postings: unpackInts(index.postings),
    gramSize: index.gramSize,
    builtAt: index.builtAt,
  };
  return decoded;
};

/**
 * Parse and decode the index now, rather than on the first match.
 *
 * The decode is not cheap - a nine megabyte JSON file, then a million postings
 * out of base64 - and it runs on the JS thread. Left to happen lazily it lands
 * on the first phrase the recogniser returns, which is in the middle of a
 * lecture somebody is watching, and freezes the UI for as long as it takes.
 *
 * So it is pulled forward to the moment listening starts, where there is a
 * system consent dialog covering the app and nothing to be frozen. Idempotent -
 * load() returns the same object afterwards - so calling it twice costs
 * nothing.
 */
export const warmUp = () => {
  load();
};

/** Where `hash` sits in a sorted Int32Array, or -1. */
const findGram = (hashes, hash) => {
  let lo = 0;
  let hi = hashes.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const at = hashes[mid];
    if (at === hash) return mid;
    if (at < hash) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
};

// Reused between queries. Matching runs several times a second for as long as
// a lecture is playing, and allocating a fifteen-thousand-slot counter each
// time is the kind of garbage that shows up as a stutter in the panel.
let counts = null;
let touched = [];

/**
 * @param queryHashes hashed grams of the recogniser's output
 * @param minRun      how long a run has to be to be returned. Defaults to the
 *                    threshold the panel uses; the debug view passes 0 to see
 *                    the near-misses, which is the difference between "heard
 *                    nothing" and "nearly had it".
 */
export const matchHashes = (queryHashes, minRun = MIN_RUN_CHARS) => {
  const {docs, common, hashes, starts, postings, gramSize} = load();

  if (!counts || counts.length !== docs.length) counts = new Int32Array(docs.length);

  // Clearing only what the previous query touched, rather than the whole
  // array - a query lights up a few hundred documents out of fifteen thousand.
  for (const ordinal of touched) counts[ordinal] = 0;
  touched = [];

  // Kept per query gram so the rerank below can walk positions without
  // searching the index a second time.
  //   [from, to] - a real posting range
  //   'neutral'   - a gram too common to be indexed; see `common` above. It
  //                 neither confirms nor contradicts, and the rerank steps
  //                 over it without breaking a run.
  //   null        - in no verse at all, which is a genuine mismatch.
  const rangeAt = new Array(queryHashes.length);

  for (let q = 0; q < queryHashes.length; q++) {
    const slot = findGram(hashes, queryHashes[q]);
    if (slot === -1) {
      rangeAt[q] = findGram(common, queryHashes[q]) === -1 ? null : 'neutral';
      continue;
    }
    const from = starts[slot];
    const to = starts[slot + 1];
    rangeAt[q] = [from, to];
    for (let p = from; p < to; p++) {
      const ordinal = postings[p];
      if (counts[ordinal] === 0) touched.push(ordinal);
      counts[ordinal]++;
    }
  }

  if (!touched.length) return [];

  // Top few by raw hit count, which is a cheap upper bound on the run length.
  const shortlist = touched
    .slice()
    .sort((a, b) => counts[b] - counts[a])
    .slice(0, RERANK_DEPTH);

  const wanted = new Set(shortlist);

  // For each shortlisted verse, the longest stretch of query positions landing
  // in it - allowing for short interruptions. See MAX_GAP.
  // `solid` counts the positions in a run that were real hits on this record,
  // as opposed to neutral grams that merely passed through it. See the note on
  // MIN_SOLID_RATIO.
  const runs = new Map(
    shortlist.map(ordinal => [
      ordinal,
      {best: 0, current: 0, gap: 0, endsAt: -1, solid: 0, bestSolid: 0},
    ]),
  );

  const extend = (run, q, isSolid) => {
    run.current++;
    if (isSolid) run.solid++;
    run.gap = 0;
    if (run.current > run.best) {
      run.best = run.current;
      run.bestSolid = run.solid;
      run.endsAt = q;
    }
  };

  for (let q = 0; q < queryHashes.length; q++) {
    const range = rangeAt[q];

    // A gram that was too common to index carries no opinion about any verse.
    // It extends whatever run it sits inside - those characters really were
    // heard, and really are in the verse - but it cannot start one, because a
    // run built only out of syllables every verse shares is not evidence of
    // this verse.
    if (range === 'neutral') {
      for (const ordinal of shortlist) {
        const run = runs.get(ordinal);
        if (run.current > 0) extend(run, q, false);
      }
      continue;
    }

    const hitHere = new Set();
    if (range) {
      for (let p = range[0]; p < range[1]; p++) {
        const ordinal = postings[p];
        if (wanted.has(ordinal)) hitHere.add(ordinal);
      }
    }
    for (const ordinal of shortlist) {
      const run = runs.get(ordinal);
      if (hitHere.has(ordinal)) {
        // Re-joining across a gap costs the gap: those positions were not
        // heard in this verse and must not be counted as though they were.
        if (run.gap > MAX_GAP) {
          run.current = 1;
          run.solid = 1;
        } else {
          run.current++;
          run.solid++;
        }
        run.gap = 0;
        if (run.current > run.best) {
          run.best = run.current;
          run.bestSolid = run.solid;
          run.endsAt = q;
        }
      } else if (run.current > 0) {
        run.gap++;
      }
    }
  }

  return shortlist
    .map(ordinal => {
      const run = runs.get(ordinal);
      const doc = docs[ordinal];
      // A run of N consecutive 5-grams covers N + 4 characters of stream.
      const runChars = run.best ? run.best + gramSize - 1 : 0;
      const coverage = doc.len ? Math.min(1, runChars / doc.len) : 0;
      // What share of the run was this record being recognised, rather than
      // syllables so common they belong to everything.
      const solidRatio = run.best ? run.bestSolid / run.best : 0;
      return {
        ...doc,
        ordinal,
        hits: counts[ordinal],
        runChars,
        // How much of the record this run accounts for. Not a gate - a
        // lecturer quoting one line of a four-line verse is still a hit - but
        // it is what separates the right answer from a longer record that
        // merely contains it.
        coverage,
        // Run length is the evidence; coverage is how well the record fits it.
        //
        // Both are needed, because the corpus contains records that nest:
        // compilations quoting whole chapters, songs built out of verses.
        // Against a recitation of one verse, the verse and the compilation
        // that quotes it produce *identical* runs - and ranking on run length
        // alone leaves them tied, which reads as ambiguity and shows nothing.
        // Coverage breaks it the right way every time: the verse accounts for
        // nearly all of itself, the compilation for one percent of itself.
        //
        // Half weight, not full, so that coverage can separate a tie without
        // ever letting a short record with a weak run beat a long one with a
        // strong one.
        score: runChars * (0.5 + 0.5 * coverage),
        solidRatio,
        // Where in the query the run ended, so a caller can tell how recent
        // the evidence is.
        endsAt: run.endsAt,
      };
    })
    .filter(c => c.runChars >= minRun && c.solidRatio >= MIN_SOLID_RATIO)
    .sort((a, b) => b.score - a.score);
};

/**
 * The best match for a piece of recogniser output, or null.
 *
 * Returns null rather than a low-confidence guess on purpose: a wrong verse
 * sitting under the player is worse than no verse at all, because the person
 * cannot tell which one it is without already knowing the answer.
 */
export const identify = text => {
  const stream = phoneticStream(text);
  if (stream.length < MIN_RUN_CHARS) return null;

  const results = matchHashes(grams(stream, load().gramSize).map(hashGram));
  if (!results.length) return null;

  const [best, runnerUp] = results;

  // Two verses matching almost equally well usually means the run landed on
  // something they share - a repeated epithet, or one of the many verses that
  // open the same way. Naming either one would be a coin toss.
  if (runnerUp && runnerUp.score >= best.score * 0.92 && runnerUp.id !== best.id) {
    return null;
  }

  return best;
};

/**
 * The best few candidates regardless of whether any is good enough.
 *
 * Only the debug view calls this. It is the question that matters when nothing
 * is appearing: is the recogniser producing something that nearly matches a
 * verse, or something that resembles nothing in the corpus at all? Those look
 * identical from a blank panel and have completely different causes.
 */
export const nearMisses = (text, howMany = 3) => {
  const stream = phoneticStream(text);
  if (!stream) return [];
  return matchHashes(grams(stream, load().gramSize).map(hashGram), 0)
    .slice(0, howMany)
    .map(c => ({
      ref: c.ref,
      runChars: c.runChars,
      score: c.score,
      solidRatio: c.solidRatio,
    }));
};

export const corpusStats = () => {
  const {docs, hashes, postings, builtAt} = load();
  return {
    records: docs.length,
    grams: hashes.length,
    postings: postings.length,
    builtAt,
  };
};
