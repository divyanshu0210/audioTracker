// noteRef.js
//
// A note's rowid says which row, but not which table. This user's own notes
// live in `notes`; a mentee's, read off their Drive, live in `mentee_notes` —
// and both number their rows from one, so id 47 exists in each and means
// something different.
//
// A reference carries both. Own notes stay a bare rowid, exactly as they have
// always been, so nothing that already handles one has to change. A mentee's
// becomes a string that says so.
//
// Deliberately a scalar, not an object: this value is used as a React key,
// compared with ===, and passed through a store and two screens before
// anything reads the database. Every one of those would have had to learn
// about a second field.

const PREFIX = 'm:';

/** Builds a reference. `menteeId` null (this user's own) returns the rowid. */
export const noteRef = (rowid, menteeId = null) =>
  menteeId == null ? rowid : `${PREFIX}${menteeId}:${rowid}`;

/**
 * Splits one back into `{rowid, menteeId}`.
 *
 * menteeId is null for anything that isn't a mentee reference, which includes
 * a plain rowid, a number, and null itself — so callers can hand this whatever
 * they hold without checking first.
 */
export const parseNoteRef = ref => {
  if (typeof ref !== 'string' || !ref.startsWith(PREFIX)) {
    return {rowid: ref, menteeId: null};
  }

  // From the right: a user id is opaque and could itself contain a colon,
  // while the rowid never can.
  const body = ref.slice(PREFIX.length);
  const split = body.lastIndexOf(':');
  if (split <= 0) return {rowid: ref, menteeId: null};

  return {
    menteeId: body.slice(0, split),
    rowid: Number(body.slice(split + 1)),
  };
};

/** Whether this reference belongs to someone else — i.e. is read-only here. */
export const isMenteeNoteRef = ref => parseNoteRef(ref).menteeId != null;
