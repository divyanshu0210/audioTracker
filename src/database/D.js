import {db, getDb} from './database';
import {buildQuery} from './dbUtils';
import {fastdb} from './FTSDatabase';


export const deleteDriveFileItemFromDB = (drive_id, fromScreen) => {
  const fastdb = getDb();
  fastdb.transaction(tx => {
    if (fromScreen === 'in') {
      // Delete from "in" screen - set in_show to 0 but keep out_show as is
      tx.executeSql(
        'UPDATE files SET in_show = 0 WHERE drive_id = ?;',
        [drive_id],
        () => console.log(`File ${drive_id} removed from 'in' screen.`),
        (_, error) =>
          console.error("Error removing file from 'in' screen:", error),
      );
    } else if (fromScreen === 'out') {
      // Delete from "out" screen - set out_show to 0 but keep in_show as is
      tx.executeSql(
        'UPDATE files SET out_show = 0 WHERE drive_id = ?;',
        [drive_id],
        () => console.log(`File ${drive_id} removed from 'out' screen.`),
        (_, error) =>
          console.error("Error removing file from 'out' screen:", error),
      );
    } else {
      // Default case (if no screen specified) - remove from both
      tx.executeSql(
        'UPDATE files SET in_show = 0, out_show = 0 WHERE drive_id = ?;',
        [drive_id],
        () => console.log(`File ${drive_id} removed from both screens.`),
        (_, error) => console.error('Error removing file:', error),
      );
    }
  });
};

export const deleteFolderAndContents = folderId => {
  const fastdb = getDb();
  fastdb.transaction(
    tx => {
      // Mark files with out_show = 0 as deleted
      tx.executeSql(
        'UPDATE files SET in_show = 0 WHERE parent_id = ?;',
        [folderId],
        (_, result) => {
          console.log(
            `✅ Marked ${result.rowsAffected} files in folder ${folderId} as deleted`,
          );
        },
        (_, error) => {
          console.error('❌ Error marking files as deleted:', error);
          return true; // Rollback
        },
      );

      // Recursively handle subfolders that are not visible (out_show = 0)
      tx.executeSql(
        'SELECT drive_id FROM folders WHERE parent_id = ? AND out_show = 0;',
        [folderId],
        (_, result) => {
          const subfolders = result.rows._array;
          subfolders.forEach(subfolder => {
            deleteFolderAndContents(subfolder.drive_id); // Recursive call
          });
        },
        (_, error) => {
          console.error('❌ Error fetching subfolders:', error);
          return true; // Rollback
        },
      );

      // Finally mark the folder itself as deleted
      tx.executeSql(
        'UPDATE folders SET in_show = 0, out_show = 0 WHERE drive_id = ?;',
        [folderId],
        (_, result) => {
          console.log(
            `✅ Marked folder ${folderId} as deleted (${result.rowsAffected} rows affected)`,
          );
        },
        (_, error) => {
          console.error('❌ Error deleting folder:', error);
          return true; // Rollback
        },
      );
    },
    error => {
      console.error('❌ Transaction error:', error);
    },
    () => {
      console.log(`✅ Transaction completed for folder ${folderId}`);
    },
  );
};

export const deleteYTItemFromDB = (ytube_id, type) => {
  const fastdb = getDb();
  fastdb.transaction(tx => {
    if (type === 'video') {
      tx.executeSql(
        // "DELETE FROM videos WHERE ytube_id = ?;",
        'UPDATE videos SET out_show = 0 WHERE ytube_id = ?;',
        [ytube_id],
        () =>
          console.log(
            `Video ${ytube_id} deleted`,
          ),
        (_, error) =>
          console.error('Error deleting video:', error),
      );
    } else if (type === 'playlist') {
      // If deleting a playlist, delete it and its videos except ones marked for the main screen
      tx.executeSql(
        'SELECT id FROM playlists WHERE ytube_id = ?;',
        [ytube_id],
        (_, {rows}) => {
          if (rows.length > 0) {
            const playlistId = rows.item(0).id;

            tx.executeSql(
              'UPDATE videos SET in_show=0 WHERE parent_id = ?;',
              [playlistId],
              () => {
                console.log(
                  `Videos from playlist ${ytube_id} deleted (except mainscreen videos).`,
                );

                // Now delete the playlist itself
                tx.executeSql(
                  // "DELETE FROM playlists WHERE ytube_id = ?;",
                  'UPDATE playlists SET out_show = 0 WHERE ytube_id = ?;',
                  [ytube_id],
                  () => console.log(`Playlist ${ytube_id} deleted.`),
                  (_, error) =>
                    console.error('Error deleting playlist:', error),
                );
              },
              (_, error) =>
                console.error('Error deleting videos from playlist:', error),
            );
          } else {
            console.log('Playlist not found.');
          }
        },
        (_, error) => console.error('Error fetching playlist ID:', error),
      );
    }
  });
};

export const deleteDeviceFileById = uuid => {
  const fastdb = getDb();
  fastdb.transaction(
    tx => {
      tx.executeSql(
        'DELETE FROM device_files WHERE uuid = ?',
        [uuid],
        (_, result) => {
          console.log(
            `✅ Deleted device file with uuid: ${uuid} (Rows affected: ${result.rowsAffected})`,
          );
        },
        (_, error) => {
          console.error('❌ Error deleting device file:', error);
          return true; // Signals rollback
        },
      );
    },
    error => {
      console.error('❌ Transaction error while deleting device file:', error);
    },
    () => {
      console.log(
        `✅ Transaction completed for deleteDeviceFileByUuid(${uuid})`,
      );
    },
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

export const deleteNotebook = (notebookId, options = { deleteNotes: true }) => {
  const fastdb = getDb();
  const { deleteNotes } = options;

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
            console.error(`Error deleting notes of notebook ${notebookId}:`, error);
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