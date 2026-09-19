/**
 * @format
 *
 * Focus mode now derives "this was assigned" from the mentor category an item
 * sits in, so this one predicate decides it. Getting it wrong goes badly in
 * both directions: too narrow and assignments never lock, too broad and a
 * mentor's own library locks itself.
 */

jest.mock('../src/database/database', () => ({getDb: jest.fn()}));
jest.mock('../src/iskcon/iskconActions', () => ({
  ensureIskconRowsExist: jest.fn(),
}));

import {
  isMentorCategoryName,
  MENTEE_CAT_FILTER_TAG,
  SHARED_NOTES_CATEGORY,
} from '../src/categories/catDB';

describe('isMentorCategoryName', () => {
  it('matches the shape both creation sites build', () => {
    // fetchAssignmentsForMentee uses the server's key; MentorMenteeDrawer
    // builds `${full_name} (${email})`. They have to agree or the mentee gets
    // two categories for one mentor.
    expect(isMentorCategoryName('Radha Gopinath (mentor@example.com)')).toBe(
      true,
    );
  });

  it('matches a single-word name', () => {
    expect(isMentorCategoryName('Prabhu (a@b.co)')).toBe(true);
  });

  it('rejects the mentor-side mentee category', () => {
    // The case that would lock a mentor's own library: these are filled with
    // the mentor's own rows, not with anything sent to them.
    const menteeCategory = `${MENTEE_CAT_FILTER_TAG} Some Mentee (mentee@example.com) ${MENTEE_CAT_FILTER_TAG}`;
    expect(isMentorCategoryName(menteeCategory)).toBe(false);
  });

  it('rejects it even with the trailing tag stripped', () => {
    // Belt and braces: the trailing tag already makes the address test miss,
    // but the exclusion must not be the thing quietly doing all the work.
    expect(
      isMentorCategoryName(`${MENTEE_CAT_FILTER_TAG} Mentee (m@example.com)`),
    ).toBe(false);
  });

  it('rejects the shared notes category', () => {
    expect(isMentorCategoryName(SHARED_NOTES_CATEGORY)).toBe(false);
  });

  it('rejects ordinary user categories', () => {
    expect(isMentorCategoryName('Bhagavatam Classes')).toBe(false);
    expect(isMentorCategoryName('Morning (2024)')).toBe(false);
    expect(isMentorCategoryName('')).toBe(false);
  });

  it('needs the address at the end, not merely somewhere', () => {
    expect(isMentorCategoryName('(a@b.com) leftovers')).toBe(false);
    expect(isMentorCategoryName('notes about a@b.com')).toBe(false);
  });

  it('tolerates trailing whitespace on a stored name', () => {
    expect(isMentorCategoryName('Name (a@b.com)  ')).toBe(true);
  });

  it('is false for a non-string rather than throwing', () => {
    expect(isMentorCategoryName(null)).toBe(false);
    expect(isMentorCategoryName(undefined)).toBe(false);
    expect(isMentorCategoryName(42)).toBe(false);
  });
});
