// menteeNotesDB.js
//
// Reading the notes a mentee's Drive backup was synced into.
//
// Reading only. The writing is native — see android/.../menteenotes — because
// it has to happen on a phone nobody has opened, which no JS can promise.
// That side also creates the tables, on its first sync, so a user with no
// mentees never carries them: the query below can find nothing to read from,
// and treats that as the empty answer it is.
//
// Separate tables from this user's own, because they are someone else's
// writing: read-only here, and never part of this user's search. mentee_notes
// is a plain table, deliberately, while `notes` is the fts5 index behind their
// searches — a mentee's words landing in that would answer them.

import {getDb} from './database';
import {noteRef} from '../notes/noteRef';
import {getShareLink} from '../Linking/utils/shareLink';

/* ---------------------------------- */
/* Reading, for the UI                 */
/* ---------------------------------- */

export const fetchMenteeNotes = ({
  menteeId,
  sourceId = null,
  date = null,
  searchQuery = null,
  offset = 0,
  limit = 20,
} = {}) => {
  const fastdb = getDb();

  return new Promise((resolve, reject) => {
    // A deleted note arrives as a tombstone with its text blanked, not as a
    // missing row — that is how the mentee's own delete propagates.
    //
    // relatedItem is NULL rather than an object of nulls when nothing matches.
    // NoteItem renders the source line behind `item.relatedItem &&`, so a null
    // hides it; an empty object is truthy and would print "youtube_video:
    // null". The miss is normal — a notebook note has no item, and neither
    // does one whose item has not come down yet.
    let query = `
      SELECT n.note_rowid AS rowid,
             n.source_id,
             n.source_type,
             n.title AS noteTitle,
             n.content,
             n.text_content,
             n.created_at,
             n.updated_at,
             'note' AS type,
             n.mentee_id AS ownerId,
             CASE WHEN mi.source_id IS NOT NULL
               THEN json_object('source_id',     mi.source_id,
                                'type',          mi.type,
                                'title',         mi.title,
                                'mimeType',      mi.mimeType,
                                'duration',      mi.duration,
                                'file_path',     mi.file_path,
                                'channel_title', mm.channel_title,
                                'thumbnail',     mm.thumbnail,
                                'drive_file_id', mm.drive_file_id)
               ELSE NULL
             END AS relatedItem
        FROM mentee_notes n
        LEFT JOIN mentee_items mi
               ON mi.mentee_id = n.mentee_id
              AND mi.source_id = n.source_id
              AND mi.type      = n.source_type
        LEFT JOIN mentee_item_meta mm
               ON mm.mentee_id = mi.mentee_id
              AND mm.remote_id = mi.remote_id
       WHERE n.mentee_id = ? AND n.deleted_at IS NULL`;
    const params = [menteeId];

    if (sourceId) {
      query += ' AND n.source_id = ?';
      params.push(sourceId);
    }
    // Matched on created_at, the same column the user's own day report uses,
    // so a note edited later still belongs to the day it was written.
    if (date) {
      query += ' AND DATE(n.created_at) = ?';
      params.push(date);
    }
    if (searchQuery) {
      query += ' AND (n.title LIKE ? OR n.text_content LIKE ?)';
      params.push(`%${searchQuery}%`, `%${searchQuery}%`);
    }

    query += ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?;';
    params.push(limit, offset);

    fastdb.transaction(tx => {
      tx.executeSql(
        query,
        params,
        (_, {rows}) => {
          const out = [];
          for (let i = 0; i < rows.length; i++) {
            const note = rows.item(i);
            // Self-describing from birth: a bare rowid would be looked up in
            // this user's own notes table by anything downstream, and 47 is a
            // real note in both. Nothing between here and the read has to
            // carry a second value.
            note.rowid = noteRef(note.rowid, note.ownerId);
            delete note.ownerId;
            try {
              note.relatedItem = note.relatedItem
                ? JSON.parse(note.relatedItem)
                : null;
            } catch {
              note.relatedItem = null;
            }

            // Shaped here, once, rather than at the point of a tap: the row
            // that leaves this function is the row the player takes, so
            // nothing downstream needs a branch for whose note it is.
            //
            // file_path is the field the player reads for a streamable url,
            // and an iskcon file is the only type that can supply one from
            // what we hold — its source_id is the path on the site, so
            // getShareLink rebuilds it. Drive and device files resolve
            // through resolvePlaybackPath instead, off source_id and
            // drive_file_id, and a copy downloaded onto the mentee's phone is
            // not something this device could open anyway.
            if (note.relatedItem?.type === 'iskcon_file') {
              note.relatedItem.file_path = getShareLink(note.relatedItem);
            } else if (note.relatedItem) {
              note.relatedItem.file_path = null;
            }
            out.push(note);
          }
          resolve(out);
        },
        (_, error) => {
          // No tables yet. The native sync creates them on its first run, so
          // this is the honest state of a mentorship that was approved
          // minutes ago — and the permanent state of everyone who never
          // mentors anybody. Either way the answer is that there are no
          // notes, not that something went wrong.
          if (/no such table/i.test(error?.message ?? '')) {
            resolve([]);
            return;
          }
          reject(error);
        },
      );
    });
  });
};

/**
 * The media row a mentee's note was taken against, or null.
 *
 * The same shape getItemBySourceId returns for this user's own items, so the
 * one caller that needs both — describeNoteMedia, building the media half of
 * a shared note — differs only in which of the two it asks.
 *
 * channel_title/thumbnail/drive_file_id come off mentee_item_meta rather than
 * the item, exactly as youtube_meta and shared_drive_copies do on the user's
 * own side; flattened onto the row here because that is how the fields are
 * read downstream.
 */
export const getMenteeItemBySourceId = ({menteeId, sourceId, type}) => {
  const fastdb = getDb();

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `SELECT mi.source_id,
                mi.type,
                mi.title,
                mi.mimeType,
                mi.duration,
                mi.file_path,
                mm.channel_title,
                mm.thumbnail,
                mm.drive_file_id
           FROM mentee_items mi
           LEFT JOIN mentee_item_meta mm
                  ON mm.mentee_id = mi.mentee_id
                 AND mm.remote_id = mi.remote_id
          WHERE mi.mentee_id = ? AND mi.source_id = ? AND mi.type = ?;`,
        [menteeId, sourceId, type],
        (_, {rows: {_array}}) => resolve(_array[0] || null),
        (_, error) => {
          // No tables yet — the same honest empty answer fetchMenteeNotes
          // gives. A note with no item behind it is an ordinary outcome here,
          // so the caller already has a branch for null.
          if (/no such table/i.test(error?.message ?? '')) {
            resolve(null);
            return;
          }
          reject(error);
          return false;
        },
      );
    });
  });
};

/**
 * How many notes this mentee has written against each item, keyed by source_id.
 *
 * One grouped query rather than a count per row: a list is twenty rows deep and
 * every one of them would otherwise open its own read for a number that comes
 * out of a single GROUP BY.
 *
 * Keyed on source_id alone, which is safe because an assignment gives both
 * sides the same one - see ingestDeviceAssignment, where the mentor's id is
 * deliberately what the mentee's row is built with. Notebook notes are left out:
 * their source_id is a notebook rowid, which belongs to a different numbering
 * altogether and has no row on a mentor's screen to sit under.
 *
 * Tombstones are excluded the same way fetchMenteeNotes excludes them - a
 * deleted note arrives as a blanked row, not a missing one, so counting rows
 * without this would keep counting notes the mentee has thrown away.
 */
export const countMenteeNotesBySource = menteeId => {
  const fastdb = getDb();

  return new Promise((resolve, reject) => {
    if (!menteeId) {
      resolve({});
      return;
    }

    fastdb.transaction(tx => {
      tx.executeSql(
        `SELECT source_id, COUNT(*) AS noteCount
           FROM mentee_notes
          WHERE mentee_id = ?
            AND deleted_at IS NULL
            AND source_id IS NOT NULL
            AND source_type <> 'notebook'
          GROUP BY source_id;`,
        [menteeId],
        (_, {rows}) => {
          const counts = {};
          for (let i = 0; i < rows.length; i++) {
            const row = rows.item(i);
            counts[String(row.source_id)] = row.noteCount;
          }
          resolve(counts);
        },
        (_, error) => {
          // No tables yet - the same honest empty answer the reads above give.
          if (/no such table/i.test(error?.message ?? '')) {
            resolve({});
            return;
          }
          reject(error);
          return false;
        },
      );
    });
  });
};
