import { getFullItemByIdTx } from './C';
import {db, getDb} from './database';

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
