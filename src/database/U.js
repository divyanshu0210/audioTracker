import { getFullItemByIdTx } from './C';
import {db, getDb} from './database';
import {fastdb} from './FTSDatabase';

export const updateItemFields = (id, updates) => {
  const fastdb = getDb();

  const keys = Object.keys(updates);

  if (!keys.length) {
    return Promise.resolve(null);
  }

  const setClause = keys.map(key => `${key} = ?`).join(', ');
  const values = keys.map(key => updates[key]);

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `
        UPDATE items
        SET ${setClause}
        WHERE id = ?;
        `,
        [...values, id],
        async (result) => {
           console.log('[updateItemFields] Rows affected:', result);
          const fullItem = await getFullItemByIdTx(tx, id);
          console.log("")
          resolve(fullItem);
        },
        (_, error) => reject(error),
      );
    });
  });
};

export const updateWatchTimestampIfExists = videoId => {
  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  const fastdb = getDb();
  fastdb.transaction(tx => {
    tx.executeSql(
      `UPDATE video_watch_history 
       SET lastWatchedAt = DATETIME('now') 
       WHERE videoId = ? AND date = ?`,
      [videoId, today],
      (_, result) => {
        if (result.rowsAffected > 0) {
          console.log(`Updated watchedAt for videoId: ${videoId}`);
        } else {
          console.log(
            `No existing entry for videoId: ${videoId} today — skipped update.`,
          );
        }
      },
      (_, err) => {
        console.error('Update error:', err);
        return true; // propagate error
      },
    );
  });
};

// ---------------------------notes
export const updateNoteContentbyId = (noteId, newContent) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    if (!noteId) {
      reject(new Error('Note ID is required'));
      return;
    }

    fastdb.transaction(tx => {
      tx.executeSql(
        `UPDATE notes SET content = ?,created_at=CURRENT_TIMESTAMP WHERE rowid = ?`,
        [JSON.stringify(newContent), noteId],
        () => {
          console.log('Note updated successfully');
          resolve();
        },
        (_, error) => {
          console.error('Failed to update note:', error);
          reject(error);
        },
      );
    });
  });
};

export const updateNoteTextContentbyId = (noteId, textContent) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    if (!noteId) {
      reject(new Error('Note ID is required'));
      return;
    }

    fastdb.transaction(tx => {
      tx.executeSql(
        `UPDATE notes SET text_content = ? WHERE rowid = ?`,
        [JSON.stringify(textContent), noteId],
        (_, result) => {
          console.log('Text content updated successfully');
          resolve(result);
        },
        (_, error) => {
          console.error('Failed to update text content:', error);
          reject(error);
        },
      );
    });
  });
};

export const updateNotebyId = (noteId, noteContent, textContent) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    if (!noteId) {
      reject(new Error('Note ID is required'));
      return;
    }

    fastdb.transaction(tx => {
      tx.executeSql(
        `UPDATE notes SET content=?,text_content = ?,created_at=CURRENT_TIMESTAMP WHERE rowid = ?`,
        [JSON.stringify(noteContent), JSON.stringify(textContent), noteId],
        (_, result) => {
          console.log('Text content updated successfully');
          resolve(result);
        },
        (_, error) => {
          console.error('Failed to update text content:', error);
          reject(error);
        },
      );
    });
  });
};

export const updateNoteTitlebyId = (noteId, noteTitle) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    if (!noteId) {
      reject(new Error('Note ID is required'));
      return;
    }

    fastdb.transaction(tx => {
      tx.executeSql(
        `UPDATE notes SET title=? WHERE rowid = ?`,
        [noteTitle, noteId],
        (_, result) => {
          console.log('NoteTitle updated successfully');
          resolve(result);
        },
        (_, error) => {
          console.error('Failed to update NoteTitle:', error);
          reject(error);
        },
      );
    });
  });
};

export const moveNoteToNotebook = async (noteId, newNotebookId) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        'UPDATE notes SET source_id = ?, source_type = ? WHERE rowid = ?',
        [String(newNotebookId), 'notebook', noteId],
        (_, result) => {
          if (result.rowsAffected > 0) {
            console.log('Note moved! ID:', noteId);
            resolve(true);
          } else {
            console.warn('No note was updated. Note ID might be incorrect:', noteId);
            resolve(false);
          }
        },
        (tx, error) => {
          console.error('Error moving note:', error);
          reject(error);
        }
      );
    });
  });
};

export const updateNotebook = (id, name, color, callback) => {
  const fastdb = getDb();
  fastdb.transaction(tx => {
    tx.executeSql(
      'UPDATE notebooks SET name = ?, color = ? WHERE id = ?;',
      [name, color, id],
      (_, result) => {
        console.log('Notebook updated! ID:', id);
        if (callback) callback(); // e.g. to call fetchNotebooks
      },
      error => console.error('Error updating notebook:', error),
    );
  });
};
