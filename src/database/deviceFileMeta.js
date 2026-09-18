// deviceFileMeta.js
//
// Reads and writes device_file_meta: what a device file *is*, kept apart from
// items.file_path, which only says where it currently is.
//
// The split is the whole point. A device file is referenced rather than copied,
// so its row holds a content:// uri into the user's own storage — and that uri
// breaks the moment the file is moved, renamed, or re-created by a file manager
// that copies and deletes instead of renaming. The notes, the watch history and
// the category membership all stay attached to a row that can no longer open
// anything. This table is what lets the file be found again.

import {getDb} from './database';

/** The identity recorded for one item, or null if none has been. */
export const getDeviceFileMeta = async itemId => {
  const fastdb = getDb();

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `SELECT media_store_id, display_name, size, duration_ms, modified_at,
                content_hash
           FROM device_file_meta WHERE item_id = ?;`,
        [itemId],
        (_, {rows}) => {
          if (!rows.length) return resolve(null);
          const row = rows.item(0);
          resolve({
            mediaStoreId: row.media_store_id ?? null,
            displayName: row.display_name ?? null,
            size: row.size ?? null,
            durationMs: row.duration_ms ?? null,
            modifiedAt: row.modified_at ?? null,
            contentHash: row.content_hash ?? null,
          });
        },
        (_, error) => {
          console.error('Error reading device file meta:', error);
          reject(error);
          return false;
        },
      );
    });
  });
};

/**
 * Records what is cheaply known about a file, leaving any hash already taken
 * alone.
 *
 * COALESCE on content_hash because this runs again whenever a file is
 * re-imported or repaired, and the hash is the expensive half — throwing away
 * a good one to write a null would mean reading the whole file again to get
 * back exactly what was there.
 */
export const saveDeviceFileIdentity = async (itemId, identity) => {
  const fastdb = getDb();
  const {
    mediaStoreId = null,
    displayName = null,
    size = null,
    durationMs = null,
    modifiedAt = null,
  } = identity || {};

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `INSERT INTO device_file_meta
           (item_id, media_store_id, display_name, size, duration_ms, modified_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(item_id) DO UPDATE SET
             media_store_id = excluded.media_store_id,
             display_name = excluded.display_name,
             size = excluded.size,
             -- Kept when the new read could not supply one. A document
             -- provider's cursor has no duration column, so re-recording an
             -- identity through one would otherwise throw away a good number
             -- that MediaStore had already given us.
             duration_ms = COALESCE(excluded.duration_ms, device_file_meta.duration_ms),
             modified_at = excluded.modified_at,
             content_hash = COALESCE(device_file_meta.content_hash, excluded.content_hash);`,
        [itemId, mediaStoreId, displayName, size, durationMs, modifiedAt],
        () => resolve(true),
        (_, error) => {
          console.error('Error saving device file identity:', error);
          reject(error);
          return false;
        },
      );
    });
  });
};

/** Stores a hash once it has been computed. */
export const saveDeviceFileHash = async (itemId, contentHash) => {
  const fastdb = getDb();

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `UPDATE device_file_meta
            SET content_hash = ?, hashed_at = CURRENT_TIMESTAMP
          WHERE item_id = ?;`,
        [contentHash, itemId],
        () => resolve(true),
        (_, error) => {
          console.error('Error saving device file hash:', error);
          reject(error);
          return false;
        },
      );
    });
  });
};

/**
 * Device files that could be this same file, by the measures that cost nothing.
 *
 * Deliberately not an answer, only a shortlist. Size and duration agreeing
 * means "worth reading these to find out", never "this is the same file" — two
 * lectures from the same recorder at the same length would match here and be
 * completely different recordings. The caller settles it with a fingerprint.
 *
 * Soft-deleted rows are included, which is how every other type already
 * behaves: re-adding a YouTube video or a Drive file that was removed brings
 * the original row back rather than minting a second one. A fingerprint match
 * is a stronger claim than either of those make — they match on an id, this
 * matches on the bytes — so there is no reason for a device file to be the one
 * exception, and being the exception is what orphaned the notes.
 */
export const findIdentityCandidates = async ({size, durationMs}) => {
  const fastdb = getDb();
  if (!size) return [];

  // A second either way, because the number depends on who parsed the file —
  // the media scanner and the player disagree slightly on a VBR mp3.
  const hasDuration = durationMs > 0;
  const sql = `SELECT m.item_id AS itemId,
                      m.content_hash AS contentHash,
                      i.source_id AS sourceId,
                      i.file_path AS filePath
                 FROM device_file_meta m
                 JOIN items i ON i.id = m.item_id
                WHERE m.size = ?
                  ${hasDuration
                    ? 'AND (m.duration_ms IS NULL OR m.duration_ms BETWEEN ? AND ?)'
                    : ''}
                LIMIT 8;`;
  const args = hasDuration
    ? [size, durationMs - 1000, durationMs + 1000]
    : [size];

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        sql,
        args,
        (_, {rows}) => {
          const out = [];
          for (let i = 0; i < rows.length; i++) out.push(rows.item(i));
          resolve(out);
        },
        (_, error) => {
          console.error('Error finding identity candidates:', error);
          reject(error);
          return false;
        },
      );
    });
  });
};

/**
 * Referenced device files whose identity is not settled yet, oldest first,
 * capped.
 *
 * A LEFT JOIN rather than a JOIN, so this covers both halves of the work: a
 * file imported before any of this existed has no row here at all and needs one
 * (hasMeta false), and a file that has one still needs its hash taken. Doing it
 * with one query means the background pass has a single thing to drain and
 * genuinely finishes.
 *
 * Only content:// rows. A file the app copied into its own directory is at a
 * path it controls, which does not wander, so it has nothing to be found by and
 * no need of it.
 *
 * Only files still listed, too. Hashing something already gone would read
 * nothing and record nothing — the entire point is to take the identity while
 * it can still be taken.
 */
export const getUnhashedDeviceFiles = async (limit = 3) => {
  const fastdb = getDb();

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `SELECT i.id AS itemId,
                i.file_path AS filePath,
                i.title AS title,
                (m.item_id IS NOT NULL) AS hasMeta
           FROM items i
           LEFT JOIN device_file_meta m ON m.item_id = i.id
          WHERE i.type = 'device_file'
            AND i.deleted_at IS NULL
            AND i.file_path LIKE 'content://%'
            AND (m.item_id IS NULL OR m.content_hash IS NULL)
          ORDER BY i.created_at ASC
          LIMIT ?;`,
        [limit],
        (_, {rows}) => {
          const out = [];
          for (let i = 0; i < rows.length; i++) out.push(rows.item(i));
          resolve(out);
        },
        (_, error) => {
          console.error('Error reading unhashed device files:', error);
          reject(error);
          return false;
        },
      );
    });
  });
};

/**
 * Every device file that is referenced rather than copied, whatever list it
 * belongs to.
 *
 * getChildrenByParent only sees the root of one tab, and the sweep that runs
 * off it therefore only ever repairs what the user happens to be looking at.
 * After a restore that is the wrong shape entirely: every row on the device
 * arrived at once, holding addresses from another install, and the ones
 * filed in a category or hidden behind a shared note are no less broken for
 * not being on screen.
 *
 * content:// only, for the same reason as getUnhashedDeviceFiles: a file the
 * app copied into its own directory sits at a path it controls, which does
 * not wander.
 */
export const getReferencedDeviceFiles = async () => {
  const fastdb = getDb();

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `SELECT id, source_id, type, title, file_path, duration, mimeType
           FROM items
          WHERE type = 'device_file'
            AND deleted_at IS NULL
            AND file_path LIKE 'content://%';`,
        [],
        (_, {rows}) => {
          const out = [];
          for (let i = 0; i < rows.length; i++) out.push(rows.item(i));
          resolve(out);
        },
        (_, error) => {
          console.error('Error reading referenced device files:', error);
          reject(error);
          return false;
        },
      );
    });
  });
};
