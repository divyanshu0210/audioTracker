// focusMode.js
//
// Whether an item has been watched through once, derived rather than recorded.
//
// This is the condition that releases focus mode's lock on an assignment, so it
// has to survive a reinstall — otherwise a mentee who restores their backup
// finds every assignment they finished locked down again. Nothing here is
// stored: coverage is computed from video_watch_history.watchedIntervals, which
// restoreManager already backs up and restores, so completion comes back with
// the watch history it was always implied by.
//
// That also means there is no second source of truth to drift. A completion
// flag could disagree with the intervals under it; a function of them cannot.

import {fetchLatestWatchDataAllFields} from '../database/R';

// How much of a lecture counts as having watched it.
//
// Not 100%: closing chants, credits and a few seconds of silence at the end are
// routinely never reached, and a three-second gap left by one seek would
// otherwise lock an assignment shut forever. 90% is the whole thing as a person
// would describe it.
export const COMPLETION_COVERAGE = 0.9;

const parseIntervals = raw => {
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// The tracker merges before saving, so these arrive disjoint. Merged again
// anyway: this reads rows written by every version the app has ever had, and
// double-counting an overlap would report coverage above 1 and unlock an
// assignment that was never finished.
const mergeIntervals = intervals => {
  const valid = intervals.filter(
    pair =>
      Array.isArray(pair) &&
      pair.length === 2 &&
      Number.isFinite(pair[0]) &&
      Number.isFinite(pair[1]) &&
      pair[1] > pair[0],
  );
  if (!valid.length) return [];

  const sorted = [...valid].sort((a, b) => a[0] - b[0]);
  const merged = [sorted[0].slice()];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const [start, end] = sorted[i];
    if (start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
};

/**
 * How much of `duration` these intervals cover, as 0..1.
 *
 * Clamped at 1 rather than trusted: a duration that came out short — a stream
 * whose length was still settling when it was stored — would otherwise produce
 * a figure over 100%.
 */
export const coverageOf = (intervals, duration) => {
  if (!duration || duration <= 0) return 0;
  const watched = mergeIntervals(parseIntervals(intervals)).reduce(
    (sum, [start, end]) => sum + (end - start),
    0,
  );
  return Math.min(1, watched / duration);
};

/**
 * How much of this item has been watched, all-time, as 0..1.
 *
 * Returns null when it cannot be judged — no watch history at all, or a
 * duration we do not know yet. Null is not zero: callers hold the lock closed
 * on an unknown and ask again once the player reports a real duration, rather
 * than reading "I can't tell" as "not watched".
 */
export const getCoverage = async (sourceId, duration) => {
  if (!sourceId || !duration || duration <= 0) return null;

  try {
    const data = await fetchLatestWatchDataAllFields(sourceId);
    if (!data) return 0;
    return coverageOf(data.watchedIntervals, duration);
  } catch (error) {
    console.warn('Could not read watch coverage:', error?.message ?? error);
    return null;
  }
};

/**
 * Has this been watched through at least once?
 *
 * Null when undecidable, for the reason getCoverage returns one.
 */
export const isCompletedOnce = async (sourceId, duration) => {
  const coverage = await getCoverage(sourceId, duration);
  return coverage === null ? null : coverage >= COMPLETION_COVERAGE;
};
