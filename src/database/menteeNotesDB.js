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
