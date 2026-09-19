/**
 * @format
 *
 * Coverage is what releases focus mode's lock on an assignment, so the ways it
 * can be wrong are the ways the lock can be wrong: too high and an assignment
 * unlocks unwatched, too low and one that was watched stays shut.
 */

jest.mock('../src/database/R', () => ({
  fetchLatestWatchDataAllFields: jest.fn(),
}));

import {fetchLatestWatchDataAllFields} from '../src/database/R';
import {
  COMPLETION_COVERAGE,
  coverageOf,
  getCoverage,
  isCompletedOnce,
} from '../src/music/focusMode';

describe('coverageOf', () => {
  it('measures disjoint stretches against the duration', () => {
    expect(coverageOf([[0, 30], [70, 100]], 100)).toBeCloseTo(0.6);
  });

  it('reads the JSON the database actually stores', () => {
    expect(coverageOf('[[0,50]]', 100)).toBeCloseTo(0.5);
  });

  it('counts an overlap once', () => {
    // The tracker merges before saving, so this should not arrive - but a row
    // written by an older version might, and double-counting it would report
    // 90% for 50% watched and unlock the assignment.
    expect(coverageOf([[0, 50], [25, 75]], 100)).toBeCloseTo(0.75);
  });

  it('joins stretches that touch', () => {
    expect(coverageOf([[0, 50], [50, 100]], 100)).toBeCloseTo(1);
  });

  it('never exceeds 1 when the stored duration came out short', () => {
    expect(coverageOf([[0, 120]], 100)).toBe(1);
  });

  it('ignores malformed and zero-length pairs', () => {
    expect(coverageOf([[10, 10], [5], null, ['a', 'b'], [20, 40]], 100)).toBeCloseTo(
      0.2,
    );
  });

  it('survives unparseable json rather than throwing', () => {
    expect(coverageOf('not json', 100)).toBe(0);
  });

  it('is zero when there is no duration to measure against', () => {
    expect(coverageOf([[0, 50]], 0)).toBe(0);
  });
});

describe('getCoverage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is null with no duration, which is not the same as zero', async () => {
    // The distinction the lock rests on: "cannot tell yet" must not read as
    // "nothing watched", or the first second of every assignment would resolve
    // against a guess.
    await expect(getCoverage('abc', 0)).resolves.toBeNull();
    expect(fetchLatestWatchDataAllFields).not.toHaveBeenCalled();
  });

  it('is zero when the item has never been played', async () => {
    fetchLatestWatchDataAllFields.mockResolvedValue(null);
    await expect(getCoverage('abc', 100)).resolves.toBe(0);
  });

  it('is null when the read fails, so a lock is never released by an error', async () => {
    fetchLatestWatchDataAllFields.mockRejectedValue(new Error('db gone'));
    await expect(getCoverage('abc', 100)).resolves.toBeNull();
  });
});

describe('isCompletedOnce', () => {
  beforeEach(() => jest.clearAllMocks());

  const withIntervals = intervals =>
    fetchLatestWatchDataAllFields.mockResolvedValue({
      watchedIntervals: JSON.stringify(intervals),
    });

  it('is true at the threshold', async () => {
    withIntervals([[0, COMPLETION_COVERAGE * 100]]);
    await expect(isCompletedOnce('abc', 100)).resolves.toBe(true);
  });

  it('is false just under it', async () => {
    withIntervals([[0, COMPLETION_COVERAGE * 100 - 1]]);
    await expect(isCompletedOnce('abc', 100)).resolves.toBe(false);
  });

  it('forgives a tail that was never reached', async () => {
    // The case the threshold exists for: closing chants and credits.
    withIntervals([[0, 95]]);
    await expect(isCompletedOnce('abc', 100)).resolves.toBe(true);
  });

  it('is not fooled by one long stretch replayed', async () => {
    withIntervals([[0, 40], [0, 40], [0, 40]]);
    await expect(isCompletedOnce('abc', 100)).resolves.toBe(false);
  });

  it('is null rather than false when it cannot be judged', async () => {
    await expect(isCompletedOnce('abc', 0)).resolves.toBeNull();
  });
});
