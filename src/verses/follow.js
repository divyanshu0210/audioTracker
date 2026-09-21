// Where in the song we are now.
//
// Identifying and following are different problems, and the panel was only ever
// doing the first. Every window went back to the whole corpus and asked "which
// record is this" - twenty-six thousand candidates, most of the work thrown
// away, and the answer allowed to change. That is not just wasted effort. It is
// the only way a correct song on screen gets replaced by a wrong one: the
// matcher is still guessing, and eventually a guess clears the gates.
//
// Once a song is known the question changes to "how far in", which is smaller
// and safer. There is one record to align against, it cannot name anything
// else, and the answer is worth showing: for a bhajan that runs for minutes,
// the line being sung is most of what the panel is for.
//
// Deliberately for songs and not for verses. A verse is four lines and about
// seventy characters of stream - there is no "where" to report, and the whole
// record is already on screen.
//
// There are really two questions here, and the first version of this conflated
// them:
//
//   am I still in this song   decides whether to hand back to the matcher
//   which line                decides where the marker sits
//
// They want different evidence. The first should use everything heard in the
// last twenty-five seconds, because it is the more consequential answer and
// there is no reason to throw evidence away. The second must use only the last
// few seconds, because older text describes where the singing *was*.
//
// Conflating them made the follower let go of a song that was still playing
// about eight times in a two-minute recording - every time a few seconds came
// out badly enough that the tail could not be placed, though the window was
// still full of the song. Answered separately, that halves.

import {phoneticStream, grams, hashGram, GRAM_SIZE} from './phonetics';

// Below this a record is a verse, not something to follow through.
const MIN_LINES = 6;

// How much of the recent audio places the singer.
//
// The window holds twenty-five seconds, which for a slow bhajan is two or three
// lines. All of it finds where the passage is; the tail finds where the voice
// is now, which is the thing to mark.
const TAIL_CHARS = 70;

// How many grams of that tail must agree on one alignment before the marker
// moves.
//
// Measured over real recogniser output - 1558 windows placed inside the song
// actually being sung, 222 placed inside songs that were not:
//
//   votes   marks the right song   marks a wrong one
//      9           84.0%                 48.2%
//     11           71.6%                 19.8%
//     13           59.4%                 10.4%
//     17           40.3%                  2.7%
//
// Thirteen. The right-hand column halves between eleven and thirteen for about
// two points of coverage, and coverage is the cheaper thing to lose: a window
// that places nothing leaves the marker where it was, which is very likely
// still right.
//
// These are devotional songs, which is why the wrong column is so populated at
// all - they share hari, gaura, pada, carana between them, and a handful of
// five-grams of that is not evidence of anything.
const MIN_VOTES = 13;

// How far two grams' offsets may differ and still be one alignment.
//
// They will differ. The model drops syllables and inserts them, so by the end
// of a line the heard text can sit a dozen characters ahead of or behind the
// written one, and each of those grams votes for a slightly different offset.
// Without a band the votes scatter and the winner is whichever bucket got
// lucky.
const BAND = 12;

// What share of the window has to sit inside one stretch of the record before
// the song counts as still playing.
//
// Low, and deliberately so. This decides only how long the marker survives a
// run of windows the model made a mess of; it no longer decides whether the
// panel may change, because that is now settled by comparing this record
// against the challenger - see SWITCH_MARGIN in useVerseStore.js.
//
// It was 0.08, from when it did decide both, and it was strangling the thing
// this file exists to do. Measured through the real store over 48 recordings,
// by what share of windows after a song is found carry a marked line:
//
//   0.08   79.6% marked   6.0% of windows showing the wrong song
//   0.05   84.7% marked   2.7%
//   0.03   87.7% marked   2.7%
//   0.02   90.7% marked   2.7%
//
// Better in both columns the lower it goes, which is what it looks like when a
// constant has been carrying weight that belongs somewhere else.
//
// What stops it going lower still is speech, which those recordings contain
// none of - they are all singing. A lecture is the adversary here, and Hindi
// speech much more than English, because Hindi is full of tatsama words that
// are also in the corpus. Scored against songs:
//
//           keeps sung windows   admits English   admits Hindi
//   0.03           78.1%              0.0%           11.0%
//   0.05           74.0%              0.0%            4.0%
//   0.08           68.3%              0.0%            1.0%
//
// English prose never reaches 0.035 against any record tried. Hindi reaches
// 0.09. 0.05 sits above everything English does and above most of what Hindi
// does, and keeps nearly all of the gain: 84.7% of windows marked against
// 87.7% at 0.03.
//
// Not taken to nothing in any case. Below about 0.02 a record is never given
// up, the give-up rule becomes dead code, and a marker would sit on a stale
// line for as long as nothing came along to replace it.
const MIN_PRESENCE = 0.05;

// How wide that stretch may be, as a multiple of the window's own length.
//
// The window is up to twenty-five seconds and the singing moves on inside it,
// so the region it came from is longer than the text itself - but not much.
const SPAN = 1.5;

// Below this the window is too short for a span to mean anything.
const MIN_SPAN = 120;

// Below this there is not enough text to conclude anything, and quiet is not
// evidence that the song ended.
const MIN_GRAMS = 20;

// Per record: the stream, and where each line begins in it.
//
// Cached because a song is followed for minutes, once every few seconds, and
// neither the stream nor its gram positions change while it plays.
const cache = new Map();

/**
 * Index one record for following.
 *
 * Each line is streamed separately and the offsets accumulated, so a position
 * in the stream can be turned back into the line a person is looking at. The
 * lines are joined exactly as the matcher joins them, or the offsets would
 * describe a different string from the one being searched.
 */
const prepare = record => {
  const hit = cache.get(record.id);
  if (hit) return hit;

  const bounds = [];
  let stream = '';
  for (const line of record.lines || []) {
    const piece = phoneticStream(line);
    bounds.push({from: stream.length, to: stream.length + piece.length});
    stream += piece;
  }

  // gram hash -> every position it occurs at. Its keys double as the set of
  // grams the record contains, which is what presence is counted against.
  const positions = new Map();
  grams(stream, GRAM_SIZE).forEach((gram, at) => {
    const key = hashGram(gram);
    const list = positions.get(key);
    if (list) list.push(at);
    else positions.set(key, [at]);
  });

  const prepared = {stream, bounds, positions};
  // Room for the song being followed and the records the matcher keeps
  // proposing beside it. It was four, from when only one record was ever
  // scored - which with `explains` now running on a challenger every window
  // meant the cache cleared constantly and the followed record, the expensive
  // one, was rebuilt each time.
  if (cache.size > 32) cache.clear();
  cache.set(record.id, prepared);
  return prepared;
};

/** Whether a record is long enough to be worth following through. */
export const isFollowable = record =>
  !!record && (record.lines || []).length >= MIN_LINES;

/**
 * Which line the tail of the audio lands on, or null if it cannot be placed.
 *
 * Offset agreement: every gram of the tail that occurs in the record votes for
 * the alignment that would put it there, and the alignment with the most votes
 * wins. It is the usual way to locate a short read inside a long sequence, and
 * it survives exactly what goes wrong here - a few wrong characters move a few
 * votes and leave the winner standing.
 */
const place = (tail, {bounds, positions}) => {
  // Every gram of the tail that occurs in the record, as (where it sits in the
  // record, which alignment that implies).
  const seen = [];
  grams(tail, GRAM_SIZE).forEach((gram, i) => {
    const where = positions.get(hashGram(gram));
    if (!where) return;
    for (const p of where) seen.push({p, offset: p - i, i});
  });
  if (seen.length < MIN_VOTES) return null;

  // The densest run of offsets that spans no more than a band, found by
  // sorting and sliding rather than by comparing every pair.
  //
  // The pairwise version was the obvious way to write it and quadratic in a
  // place where the input is not small: a song built on a repeated refrain
  // matches each of the tail's grams at dozens of positions, so `seen` runs to
  // thousands of entries and the count to millions of comparisons - every few
  // seconds, on a phone, while audio is being decoded on another thread.
  seen.sort((a, b) => a.offset - b.offset);

  let from = 0;
  let to = -1;
  let bestVotes = 0;
  let lo = 0;
  for (let hi = 0; hi < seen.length; hi++) {
    while (seen[hi].offset - seen[lo].offset > 2 * BAND) lo++;
    if (hi - lo + 1 > bestVotes) {
      bestVotes = hi - lo + 1;
      from = lo;
      to = hi;
    }
  }
  if (bestVotes < MIN_VOTES) return null;

  // Where the voice is now.
  //
  // The most recent gram belonging to this alignment - the largest index into
  // the tail, not the largest position in the record. The two are usually the
  // same and the difference is the whole accuracy of the marker.
  //
  // This took the furthest position first, on the reasoning that it is the
  // place the singing demonstrably reached. But the winning cluster spans a
  // band, so it collects a few grams from the line *after* the one being sung,
  // and the furthest of those sits in that next line - which put the marker one
  // line early or late on nine lines in a hundred. The latest gram cannot do
  // that: it is the sound that was heard last, wherever in the record it fell.
  //
  // Plus the gram size less one, because a gram's position is its first
  // character and the place reached is its last.
  let at = -1;
  let newest = -1;
  for (let k = from; k <= to; k++) {
    if (seen[k].i > newest || (seen[k].i === newest && seen[k].p > at)) {
      newest = seen[k].i;
      at = seen[k].p;
    }
  }
  at += GRAM_SIZE - 1;

  let line = bounds.findIndex(b => at >= b.from && at < b.to);
  if (line === -1) {
    // Between two lines, or just past the end - take the last line beginning
    // before it, so the marker sits on the line just finished rather than
    // vanishing between them.
    for (let i = bounds.length - 1; i >= 0; i--) {
      if (bounds[i].from <= at) {
        line = i;
        break;
      }
    }
  }
  if (line === -1) return null;

  return {line, votes: bestVotes};
};

/**
 * How much of `heard` one stretch of a record accounts for.
 *
 * Localised on purpose. Counting grams found anywhere made the measure easier
 * the longer the record was, because a long record simply contains more sound,
 * and these songs share namo, krsna, gaura and pada between them. Real
 * continuation puts a window's matches in one contiguous stretch; coincidence
 * scatters them, and the densest stretch of a scatter is thin however much of
 * it there is.
 *
 * Counted in distinct grams of the window rather than in hits, so a refrain
 * repeating inside the record cannot inflate its own score.
 */
const localShare = (heard, positions) => {
  const hits = [];
  heard.forEach((gram, i) => {
    const where = positions.get(hashGram(gram));
    if (where) for (const p of where) hits.push({p, i});
  });
  if (!hits.length) return 0;
  hits.sort((a, b) => a.p - b.p);

  const span = Math.max(MIN_SPAN, heard.length * SPAN);
  const seen = new Map(); // gram index -> how many of its hits are in the span
  let best = 0;
  let lo = 0;
  for (let hi = 0; hi < hits.length; hi++) {
    seen.set(hits[hi].i, (seen.get(hits[hi].i) || 0) + 1);
    while (hits[hi].p - hits[lo].p > span) {
      const n = seen.get(hits[lo].i) - 1;
      if (n) seen.set(hits[lo].i, n);
      else seen.delete(hits[lo].i);
      lo++;
    }
    if (seen.size > best) best = seen.size;
  }
  return best / heard.length;
};

/**
 * How well `record` accounts for `text`, from 0 to 1.
 *
 * The point of this being separate, and of it working on any record rather
 * than only a long one, is that it lets the song on screen and the matcher's
 * best other idea be scored the same way. Deciding whether to change what is
 * displayed by comparing two scores is a different thing from deciding it by
 * whether either clears a fixed bar, and it is the honest version of the
 * question: does this other record explain what is being sung better than the
 * one already up?
 *
 * Without that comparison the two halves are tangled. Following has to be made
 * timid so that handover can happen at all, and every gain in one is a loss in
 * the other - which is how the marker got worse while the pranama mantras were
 * being stopped from holding the panel shut.
 */
export const explains = (record, text) => {
  if (!record || !record.lines?.length || !text) return 0;
  const heard = grams(phoneticStream(text), GRAM_SIZE);
  if (heard.length < MIN_GRAMS) return 0;
  return localShare(heard, prepare(record).positions);
};

/**
 * Follow `text` through `record`.
 *
 * Returns null when the singing has left this record - which is how the caller
 * knows to stop following rather than to go on marking a line nobody is on.
 *
 * Otherwise `{line, votes, presence}`, where `line` is null if the song is
 * still playing but the last few seconds could not be placed within it. The
 * two are reported separately on purpose: a caller that cannot place the voice
 * should leave the marker where it was rather than remove it. The singer has
 * not gone anywhere, and a marker that blinks out whenever a few seconds come
 * out badly is worse than one that lags.
 */
export const follow = (record, text) => {
  if (!isFollowable(record) || !text) return null;

  const prepared = prepare(record);
  if (!prepared.stream) return null;

  const whole = phoneticStream(text);
  const heard = grams(whole, GRAM_SIZE);

  const tail = whole.slice(-TAIL_CHARS);
  const placed = tail.length >= GRAM_SIZE * 2 ? place(tail, prepared) : null;

  // Too little to judge by. Not evidence that the song ended - the model simply
  // has not said much - so the benefit of the doubt, with no opinion on where.
  if (heard.length < MIN_GRAMS) {
    return placed
      ? {...placed, presence: null}
      : {line: null, votes: 0, presence: null};
  }

  const presence = localShare(heard, prepared.positions);

  // Placing the tail is itself proof of presence, and the stronger of the two.
  if (placed) return {...placed, presence};
  if (presence >= MIN_PRESENCE) return {line: null, votes: 0, presence};
  return null;
};

/** Only for tests: the cache outlives a record that has been rebuilt. */
export const forgetFollowed = () => cache.clear();
