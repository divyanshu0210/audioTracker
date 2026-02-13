import {db, getDb} from './database';

export const softDeleteItem = (type, sourceId) => {
  const db = getDb();

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
    error => console.error('❌ Transaction error:', error),
    () =>
      console.log(
        `✅ Soft delete transaction completed for ${type} (${sourceId})`,
      ),
  );
};

// ---------------notes
export const deleteNoteById = noteId => {
  const fastdb = getDb();
  fastdb.transaction(tx => {
    tx.executeSql(
      `DELETE FROM notes WHERE rowid = ?;`, // Use rowid instead of id
      [noteId],
      (_, result) => {
        console.log(`Note ${noteId} deleted successfully.`);
      },
      (_, error) => {
        console.error(`Failed to delete note ${noteId}:`, error);
        Alert.alert('Error', 'Failed to delete note.');
      },
    );
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
          `DELETE FROM notebooks WHERE id = ?;`,
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
          `DELETE FROM notes WHERE source_id = ? AND source_type = 'notebook';`,
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
