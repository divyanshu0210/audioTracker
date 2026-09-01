// sharedDriveCopies.js
//
// Reads and writes the shared_drive_copies table: which items have a copy
// living in the user's Drive, and what that copy's file id is.
//
// Only device files use this today — everything else already has an id at its
// own source that a link can be built from (see getShareLink). A device file
// has nothing of the sort until one is uploaded for it.

import {getDb} from './database';

// Every mapping at once, for hydrating the store at startup: the menu needs to
// know synchronously whether an item has a link, and there are only ever as
// many rows here as files the user has actually shared.
// The drive copy for one item, for the paths that only have an id — bulk
// delete works from selection entries, which carry no joined columns.
export const getDriveCopyId = async itemId => {
  const fastdb = getDb();

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        'SELECT drive_file_id FROM shared_drive_copies WHERE item_id = ?;',
        [itemId],
        (_, {rows}) => resolve(rows.length ? rows.item(0).drive_file_id : null),
        (_, error) => {
          console.error('Error reading shared drive copy:', error);
          reject(error);
          return false;
        },
      );
    });
  });
};

export const saveDriveCopy = async (itemId, driveFileId) => {
  const fastdb = getDb();

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `INSERT INTO shared_drive_copies (item_id, drive_file_id)
           VALUES (?, ?)
           ON CONFLICT(item_id) DO UPDATE SET drive_file_id = excluded.drive_file_id;`,
        [itemId, driveFileId],
        () => resolve(driveFileId),
        (_, error) => {
          console.error('Error saving shared drive copy:', error);
          reject(error);
          return false;
        },
      );
    });
  });
};

export const deleteDriveCopy = async itemId => {
  const fastdb = getDb();

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        'DELETE FROM shared_drive_copies WHERE item_id = ?;',
        [itemId],
        () => resolve(),
        (_, error) => {
          console.error('Error deleting shared drive copy:', error);
          reject(error);
          return false;
        },
      );
    });
  });
};
