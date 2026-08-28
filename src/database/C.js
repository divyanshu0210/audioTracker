// import SQLite from 'react-native-sqlite-storage';

import {getDb} from './database';
import {useNotesStore} from '../stores/useNotesStore';

export const upsertItem = ({
  source_id,
  type,
  title = null,
  parent_id = null,
  mimeType = null,
  file_path = null,
  out_show = null,
  in_show = null,
  fav = null,
  duration = null,
}) => {
  const fastdb = getDb();

  console.log(`\n🟡 [UPSERT START]`, {source_id, type, title});

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `
        INSERT INTO items (
          source_id,
          type,
          title,
          parent_id,
          mimeType,
          file_path,
          out_show,
          in_show,
          fav,
          duration
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(type, source_id)
        DO UPDATE SET
          title      = COALESCE(excluded.title, items.title),
          parent_id  = COALESCE(excluded.parent_id, items.parent_id),
          mimeType   = COALESCE(excluded.mimeType, items.mimeType),
          file_path  = COALESCE(excluded.file_path, items.file_path),
          out_show   = COALESCE(items.out_show,excluded.out_show),
          in_show    = COALESCE(items.in_show,excluded.in_show),
          fav        = COALESCE(excluded.fav, items.fav),
          duration   = COALESCE(excluded.duration, items.duration),
          created_at = CURRENT_TIMESTAMP;
        `,
        [
          source_id,
          type,
          title,
          parent_id,
          mimeType,
          file_path,
          out_show??0,
          in_show??0,
          fav,
          duration,
        ],
        () => {
          // 🔽 Immediately fetch the full row
          tx.executeSql(
            `
            SELECT * FROM items
            WHERE type = ? AND source_id = ?
            LIMIT 1;
            `,
            [type, source_id],
            async (_, {rows}) => {
              if (rows.length > 0) {
                const itemId = rows.item(0).id;
                const fullItem = await getFullItemByIdTx(tx, itemId);

                console.log(`🟢 [UPSERT SUCCESS - FULL ENTITY]`, fullItem);
                resolve(fullItem);
              } else {
                console.warn('⚠️ UPSERT completed but row not found.');
                resolve(null);
              }
            },
            (_, error) => {
              console.error('🔴 Failed to fetch row after upsert:', error);
              reject(error);
            },
          );
        },
        (_, error) => {
          console.error(`🔴 [UPSERT FAILED]`, error?.message || error);
          reject(error);
        },
      );
    });
  });
};

export const upsertYoutubeMeta = ({item_id, channel_title, thumbnail}) => {
  const fastdb = getDb();

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `
        INSERT INTO youtube_meta (item_id, channel_title, thumbnail)
        VALUES (?, ?, ?)
        ON CONFLICT(item_id)
        DO UPDATE SET
          channel_title = excluded.channel_title,
          thumbnail = excluded.thumbnail;
        `,
        [item_id, channel_title, thumbnail],
        async () => {
          const fullItem = await getFullItemByIdTx(tx, item_id);
          resolve(fullItem);
        },
        (_, error) => reject(error),
      );
    });
  });
};

export const getFullItemByIdTx = (tx, itemId) => {
  return new Promise((resolve, reject) => {
    tx.executeSql(
      `
      SELECT
        items.*,
        youtube_meta.channel_title,
        youtube_meta.thumbnail
      FROM items
      LEFT JOIN youtube_meta
        ON youtube_meta.item_id = items.id
      WHERE items.id = ?
      LIMIT 1;
      `,
      [itemId],
      (_, {rows}) => {
        resolve(rows.length ? rows.item(0) : null);
      },
      (_, error) => reject(error),
    );
  });
};

export const getItemBySourceId = (source_id, type = null) => {
  const fastdb = getDb();

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      let query = `
        SELECT
          items.*,
          youtube_meta.channel_title,
          youtube_meta.thumbnail
        FROM items
        LEFT JOIN youtube_meta
          ON youtube_meta.item_id = items.id
        WHERE
          items.source_id = ?
      `;

      const params = [source_id];

      if (type) {
        query += ` AND items.type = ?`;
        params.push(type);
      }

      query += ` LIMIT 1;`;

      tx.executeSql(
        query,
        params,
        (_, {rows}) => {
          if (rows.length > 0) {
            const item = rows.item(0);
            console.log('🟢 Full Item found:', item);
            resolve(item);
          } else {
            console.warn('⚠️ Item not found:', {source_id, type});
            resolve(null);
          }
        },
        (_, error) => {
          console.error('🔴 getItemBySourceId error:', error);
          reject(error);
        },
      );
    });
  });
};

// ----------------------------------------------------

export const addNotebook = (title, color, callback) => {
  const fastdb = getDb();
  fastdb.transaction(tx => {
    tx.executeSql(
      'INSERT INTO notebooks (title, color) VALUES (?, ?);',
      [title, color],
      (_, result) => {
        console.log('Notebook saved! ID:', result.insertId);
        if (callback) callback(); // Call fetchNotebooks after adding
      },
      error => console.error('Error saving notebook:', error),
    );
  });
};

const DEFAULT_NOTEBOOK_COLOR = '#3B82F6';

// Resolves the whole row, not just the id: callers that move notes here also
// have to repaint those notes in the store, and the name/colour has to come
// from somewhere that's correct even when the notebook was created a moment
// ago by this very call (so it isn't in useNotesStore.notebooks yet).
export const getOrCreateDefaultNotebook = async () => {
  const fastdb = getDb();

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      // Step 1: find the Default Notebook, deleted or not. It can itself be
      // deleted (NBMenuItems offers that, taking its notes with it), and a
      // soft-deleted row used to be returned as-is: every later "delete
      // notebook, keep notes" then parked its notes in a notebook the
      // Notebooks tab doesn't show, leaving them stranded.
      tx.executeSql(
        `SELECT id, title, color, created_at, deleted_at FROM notebooks
           WHERE title = ? LIMIT 1;`,
        ['Default Notebook'],
        (_, result) => {
          if (result.rows.length > 0) {
            const notebook = result.rows.item(0);
            if (!notebook.deleted_at) {
              resolve(notebook);
              return;
            }
            // Step 1b: restore it rather than inserting a second one. Safe
            // because deleting it stamped deleted_at on its notes too, and
            // that's what hides them (fetchNotes filters n.deleted_at) — so
            // they stay gone. Anything parked here while it was deleted
            // becomes reachable again, which is exactly what's wanted.
            tx.executeSql(
              `UPDATE notebooks SET deleted_at = NULL WHERE id = ?;`,
              [notebook.id],
              () => {
                console.log(`Restored deleted Default Notebook (ID: ${notebook.id})`);
                const restored = {...notebook, deleted_at: null};
                // Reviving is a change this function makes on its own, so it
                // owns putting the notebook back on screen. Callers used to
                // each do it and each one that forgot left the notebook
                // missing from the Notebooks tab while holding notes.
                useNotesStore.getState().upsertNotebook(restored);
                resolve(restored);
              },
              (_, error) => {
                console.error('Error restoring default notebook:', error);
                reject(error);
                return false;
              },
            );
          } else {
            // Step 2: Create it and return the new row
            tx.executeSql(
              `INSERT INTO notebooks (title, color) VALUES (?, ?);`,
              ['Default Notebook', DEFAULT_NOTEBOOK_COLOR],
              (_, insertResult) => {
                // Read the row back rather than assembling it here: SQLite
                // writes created_at as "YYYY-MM-DD HH:MM:SS" and a JS
                // toISOString() differs from that, which sorts the notebook to
                // the wrong place in the list until the next refetch moves it.
                tx.executeSql(
                  `SELECT id, title, color, created_at, deleted_at FROM notebooks
                     WHERE id = ?;`,
                  [insertResult.insertId],
                  (__, inserted) => {
                    const created = inserted.rows.item(0);
                    useNotesStore.getState().upsertNotebook(created);
                    resolve(created);
                  },
                  (__, error) => {
                    console.error('Error reading back default notebook:', error);
                    reject(error);
                    return false;
                  },
                );
              },
              (_, error) => {
                console.error('Error inserting default notebook:', error);
                reject(error);
                return false;
              },
            );
          }
        },
        (_, error) => {
          console.error('Error checking default notebook:', error);
          reject(error);
          return false;
        },
      );
    });
  });
};

export const getOrCreateDefaultNotebookId = async () =>
  (await getOrCreateDefaultNotebook()).id;

// Resolves the notebook the notes landed in, so the caller can repoint them in
// the store as well — without it All Notes goes on showing the deleted
// notebook's name and colour under each note until the next refetch.
export const moveNotesToDefaultNotebook = async notebookId => {
  const fastdb = getDb();
  const defaultNotebook = await getOrCreateDefaultNotebook();

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `UPDATE notes SET source_id = ?, source_type = 'notebook', updated_at = CURRENT_TIMESTAMP WHERE source_id = ? AND source_type = 'notebook';`,
        [String(defaultNotebook.id), String(notebookId)],
        () => {
          console.log(
            `Moved notes to default notebook (ID: ${defaultNotebook.id})`,
          );
          resolve(defaultNotebook);
        },
        (_, error) => {
          console.error('Failed to move notes to default notebook:', error);
          reject(error);
        },
      );
    });
  });
};

export const saveWatchProgress = async (
  videoId,
  mergedIntervals,
  todayIntervals,
  todayWatchTime,
  todayNewWatchTime,
  lastWatchTime,
  unfltrdWatchTime,
) => {
  const fastdb = getDb();
  // Use UTC date for consistency across time zones
  const todayDate = new Date().toISOString().split('T')[0];

  fastdb.transaction(tx => {
    tx.executeSql(
      `INSERT INTO video_watch_history (videoId, watchedIntervals,todayIntervals, date, watchTimePerDay,newWatchTimePerDay,lastWatchTime,unfltrdWatchTimePerDay)
         VALUES (?, ?, ?, ?,?,?,?,?)
         ON CONFLICT(videoId, date) DO UPDATE SET
          watchedIntervals = excluded.watchedIntervals,
          todayIntervals = excluded.todayIntervals,
          watchTimePerDay = excluded.watchTimePerDay,
          newWatchTimePerDay = excluded.newWatchTimePerDay,
          lastWatchTime = excluded.lastWatchTime,
          unfltrdWatchTimePerDay = excluded.unfltrdWatchTimePerDay`,
      [
        videoId,
        JSON.stringify(mergedIntervals || []),
        JSON.stringify(todayIntervals || []),
        todayDate,
        todayWatchTime,
        todayNewWatchTime,
        lastWatchTime,
        unfltrdWatchTime,
      ],
      () => {
        console.log(`Watch progress saved for ${videoId} on ${todayDate}`);
      },
      (_, error) => {
        console.error(`Database error: ${error.message}`);
        return true; // Returning `true` to indicate an error occurred
      },
    );
  });
};
