import {db, getDb} from './database';
import {SOFT_DELETE_NOTE_IMAGES_SQL} from '../notes/richDB';

// Both of these used to fire the transaction without returning a Promise —
// existing `await softDeleteItem(...)`/`await deleteNoteById(...)` calls
// elsewhere were awaiting `undefined` and resolving instantly, running
// subsequent code before the DB write actually completed. Now-correct async
// behavior only delays callers by the write itself; never breaks them.
export const softDeleteItem = (type, sourceId) => {
  const db = getDb();

  return new Promise((resolve, reject) => {
    db.transaction(
      tx => {
        tx.executeSql(
          `
        WITH RECURSIVE descendants AS (
          -- Always include the root item
          SELECT id
          FROM items
          WHERE type = ?
          AND source_id = ?

          UNION ALL

          -- Include children only if out_show = 0
          SELECT i.id
          FROM items i
          INNER JOIN descendants d
            ON i.parent_id = d.id
          WHERE i.out_show = 0
        )
        UPDATE items
        SET
          in_show = 0,
          out_show = 0,
          deleted_at = CURRENT_TIMESTAMP
        WHERE id IN (SELECT id FROM descendants);
        `,
          [type, sourceId],
          (_, result) => {
            console.log(
              `✅ Soft deleted ${type} (${sourceId}). Rows affected: ${result.rowsAffected}`,
            );
          },
          (_, error) => {
            console.error('❌ Soft delete error:', error);
            return true;
          },
        );
      },
      error => {
        console.error('❌ Transaction error:', error);
        reject(error);
      },
      () => {
        console.log(
          `✅ Soft delete transaction completed for ${type} (${sourceId})`,
        );
        resolve();
      },
    );
  });
};

// ---------------notes
export const deleteNoteById = noteId => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `UPDATE notes SET content = '', text_content = '', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE rowid = ?;`,
        [noteId],
        (_, result) => {
          console.log(`Note ${noteId} deleted successfully.`);
          resolve(result);
        },
        (_, error) => {
          console.error(`Failed to delete note ${noteId}:`, error);
          reject(error);
        },
      );
      tx.executeSql(SOFT_DELETE_NOTE_IMAGES_SQL, [noteId]);
    });
  });
};

// -------------------------------------------

export const deleteNotebook = (notebookId, options = {deleteNotes: true}) => {
  const fastdb = getDb();
  const {deleteNotes} = options;

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      const deleteNotebookQuery = () => {
        tx.executeSql(
          `UPDATE notebooks SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?;`,
          [notebookId],
          (_, notebookResult) => {
            console.log(`Notebook ${notebookId} deleted.`);
            resolve(notebookResult);
          },
          (_, error) => {
            console.error(`Error deleting notebook ${notebookId}:`, error);
            reject(error);
          },
        );
      };

      if (deleteNotes) {
        tx.executeSql(
          `UPDATE images SET image_data = NULL, deleted_at = CURRENT_TIMESTAMP
           WHERE deleted_at IS NULL
             AND note_rowid IN (
               SELECT rowid FROM notes WHERE source_id = ? AND source_type = 'notebook'
             );`,
          [String(notebookId)],
        );
        tx.executeSql(
          `UPDATE notes SET content = '', text_content = '', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE source_id = ? AND source_type = 'notebook';`,
          [String(notebookId)],
          (_, notesResult) => {
            console.log(`Deleted notes of notebook ${notebookId}`);
            deleteNotebookQuery();
          },
          (_, error) => {
            console.error(
              `Error deleting notes of notebook ${notebookId}:`,
              error,
            );
            reject(error);
          },
        );
      } else {
        deleteNotebookQuery();
      }
    });
  });
};

export const deleteTodayWatchEntries = async () => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    const today = new Date().toISOString().split('T')[0]; // Format: 'YYYY-MM-DD'

    fastdb.transaction(tx => {
      tx.executeSql(
        `DELETE FROM video_watch_history WHERE date = ?`,
        [today],
        (_, result) => {
          resolve(result); // You can return rowsAffected if needed: result.rowsAffected
        },
        error => reject("Error deleting today's watch entries:", error),
      );
    });
  });
};

// --------------------------------
