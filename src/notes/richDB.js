import { Alert } from "react-native";
import {parseNoteRef} from './noteRef';
import { getDb } from "../database/database";

export const createNewNote = (noteId, sourceId, sourceType ) => {
  console.log(noteId)
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        'INSERT INTO notes (rowid,source_id, source_type, title, content, text_content, created_at, updated_at) VALUES (?,?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);',
        [noteId,sourceId, sourceType, '', '', ''],
        (_, result) => resolve(result.insertId),
        (_, error) => {
          console.error('Error creating note:', error);
          reject(error);
          return false;
        }
      );
    });
  });
};


export const updateNote = (noteRowId, content, textContent) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        'UPDATE notes SET content = ?, text_content = ?, created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE rowid = ?;',
        [ content, textContent, noteRowId],
        (_, result) => {resolve(result); console.log(`Note updated! ID: ${noteRowId}`);},
        (_, error) => {
          console.error('Error saving note:', error);
          reject(error);
          return false;
        }
      );
    });
  });
};


// Add this to your richDB.js
export const updateNoteTitle = async (noteId, newTitle) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        'UPDATE notes SET title = ?, created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE rowid = ?',
        [newTitle, noteId],
        (_, result) => {resolve(result); console.log(`Note title updated! ID: ${noteId}, New Title: ${newTitle}`);},
        (_, error) => reject(error),
      );
    });
  });
};

export const saveImage = (imageId, noteRowId, imageData) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        'INSERT INTO images (id,note_rowid, image_data) VALUES (?,?,?);',
        [imageId,noteRowId, imageData],
        (_, result) => resolve(result.insertId),
        (_, error) => {
          console.error('Error saving image:', error);
          reject(error);
          return false;
        }
      );
    });
  });
};


/**
 * Takes a note reference — a plain rowid for this user's own, or one that
 * names a mentee (see noteRef). Same columns either way, so every caller is
 * unchanged and none of them has to know which kind it is holding.
 */
export const getNoteById = ref => {
  const fastdb = getDb();
  const {rowid: noteRowId, menteeId} = parseNoteRef(ref);
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        // source_id/source_type ride along for sharing: a bundle carries the
        // media a note was taken against, and this is the only read that has
        // the note row in hand.
        menteeId
          ? `SELECT source_id, source_type, title, content, text_content
               FROM mentee_notes
              WHERE mentee_id = ? AND note_rowid = ? AND deleted_at IS NULL;`
          : 'SELECT source_id, source_type, title, content, text_content FROM notes WHERE rowid = ? AND deleted_at IS NULL;',
        menteeId ? [menteeId, noteRowId] : [noteRowId],
        (_, { rows: { _array } }) => resolve(_array[0] || {}),
        (_, error) => {
          console.error('Error fetching note:', error);
          reject(error);
          return false;
        }
      );
    });
  });
};

/**
 * Whether a rowid is free, taken by a live note, or held by a deleted one.
 *
 * An imported note keeps the rowid it had on the sender's device — that is
 * what makes re-importing the same bundle idempotent, with no side table
 * mapping their id to ours. So the importer has to ask about a specific rowid
 * before using it, and a soft delete leaves the row in place with its content
 * blanked, which is neither "free" nor "already imported": the note is gone as
 * far as the user is concerned, but the rowid is still occupied and an INSERT
 * would fail on it.
 *
 * Returns 'absent' | 'live' | 'deleted'.
 */
export const getNoteRowState = noteRowId => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        'SELECT deleted_at FROM notes WHERE rowid = ? LIMIT 1;',
        [noteRowId],
        (_, {rows}) => {
          if (!rows.length) return resolve('absent');
          return resolve(rows.item(0).deleted_at ? 'deleted' : 'live');
        },
        (_, error) => {
          console.error('Error reading note row state:', error);
          reject(error);
          return false;
        },
      );
    });
  });
};

/**
 * Drops a note row outright, rather than blanking it the way deleteNoteById
 * does. Only for reclaiming the rowid of a note the user deleted so a
 * re-import can put it back — notes is FTS5 and a second INSERT at the same
 * rowid would fail.
 */
export const purgeNoteRow = noteRowId => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        'DELETE FROM notes WHERE rowid = ?;',
        [noteRowId],
        () => resolve(),
        (_, error) => {
          console.error('Error purging note row:', error);
          reject(error);
          return false;
        },
      );
    });
  });
};

export const getImageById = imageId => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        'SELECT image_data FROM images WHERE id = ? AND deleted_at IS NULL;',
        [imageId],
        (_, { rows: { _array } }) => resolve(_array?.[0]?.image_data || null),
        (_, error) => {
          console.error('Error fetching image:', error);
          reject(error);
          return false;
        }
      );
    });
  });
};

export const getImagesForNote = ref => {
  const fastdb = getDb();
  const {rowid: noteRowId, menteeId} = parseNoteRef(ref);
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        menteeId
          ? `SELECT image_id AS id, image_data
               FROM mentee_note_images
              WHERE mentee_id = ? AND note_rowid = ? AND deleted_at IS NULL;`
          : 'SELECT id, image_data FROM images WHERE note_rowid = ? AND deleted_at IS NULL;',
        menteeId ? [menteeId, noteRowId] : [noteRowId],
        (_, { rows: { _array } }) => resolve(_array),
        (_, error) => {
          console.error('Error fetching images:', error);
          reject(error);
          return false;
        }
      );
    });
  });
};


// Deleting a note leaves its images behind — images has no FK to notes and
// deleteUnusedImages only ever runs when a note is opened, which a deleted
// note never is. Without this their base64 blobs would sit in the DB (and in
// every future backup) forever.
export const SOFT_DELETE_NOTE_IMAGES_SQL =
  `UPDATE images SET image_data = NULL, deleted_at = CURRENT_TIMESTAMP
   WHERE note_rowid = ? AND deleted_at IS NULL;`;

export const deleteUnusedImages = (noteRowId, usedIds) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    usedIds = Array.isArray(usedIds) ? usedIds : [];

    fastdb.transaction(tx => {
      // Clears image_data (the actual blob) immediately on soft-delete —
      // only a small tombstone (id, note_rowid, deleted_at) is kept, so a
      // removed image's payload doesn't linger in the DB or every future
      // backup just to record that it was deleted.
      const placeholders = usedIds.map(() => '?').join(',');
      const query = usedIds.length
        ? `UPDATE images SET image_data = NULL, deleted_at = CURRENT_TIMESTAMP WHERE note_rowid = ? AND id NOT IN (${placeholders}) AND deleted_at IS NULL;`
        : `UPDATE images SET image_data = NULL, deleted_at = CURRENT_TIMESTAMP WHERE note_rowid = ? AND deleted_at IS NULL;`;

      const params = usedIds.length ? [noteRowId, ...usedIds] : [noteRowId];

      tx.executeSql(
        query,
        params,
        resolve,
        (_, error) => {
          console.error('Error deleting unused images:', error);
          reject(error);
          return false;
        }
      );
    });
  });
};


 export const deleteNoteById = (noteId) => {
  const fastdb = getDb();
  fastdb.transaction(tx => {
      tx.executeSql(
        `UPDATE notes SET content = '', text_content = '', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE rowid = ?;`,
        [noteId],
        (_, result) => {
          console.log(`Note ${noteId} deleted successfully.`);
        },
        (_, error) => {
          console.error(`Failed to delete note ${noteId}:`, error);
          Alert.alert('Error', 'Failed to delete note.');
        }
      );
      tx.executeSql(SOFT_DELETE_NOTE_IMAGES_SQL, [noteId]);
    });
  };
