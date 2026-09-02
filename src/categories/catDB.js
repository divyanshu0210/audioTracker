import {ITEM_TYPES_THAT_USE_ITEMS_TABLE} from '../contexts/constants';
import {getDb} from '../database/database';

// Categories the app maintains for itself rather than ones the user made.
//
// A tag lives in the category's *name* — there is no column for it — so both
// halves of hiding one are string matches: getAllCategories excludes them from
// the only query that lists categories, and CreateCategoryModal refuses to
// create a name containing one. Add a tag here and both follow; they used to
// be two hardcoded copies kept in step by a comment.
//
// The mentee tag's value cannot change: it is baked into category names as
// `[MENTEE_CAT_Filter] {name} ({email}) [MENTEE_CAT_Filter]`, and addCategory
// is get-or-create by exact name, so a different literal would create a second
// category per mentee and orphan the items in the first.
export const MENTEE_CAT_FILTER_TAG = '[MENTEE_CAT_Filter]';
export const SHARED_CAT_FILTER_TAG = '[SHARED_CAT_Filter]';

export const HIDDEN_CATEGORY_TAGS = [
  MENTEE_CAT_FILTER_TAG,
  SHARED_CAT_FILTER_TAG,
];

// Every note imported from someone else's .atnote bundle goes in here, and
// membership is what the shared badge reads.
//
// A category rather than a column or a table of its own: notes are already
// category members (category_items carries item_type = 'note'), categories and
// category_items are already backed up and restored, and the row is explicit —
// unlike deriving it from the media's visibility flags, which a soft delete and
// an unvisited folder child both set to the same 0/0.
export const SHARED_NOTES_CATEGORY = `${SHARED_CAT_FILTER_TAG} Shared Notes`;
const SHARED_NOTES_CATEGORY_COLOR = '#8B5CF6';

// addCategory is already get-or-create, and revives a soft-deleted row of the
// same name rather than inserting a second one — so this needs nothing else.
export const getOrCreateSharedNotesCategoryId = () =>
  addCategory(SHARED_NOTES_CATEGORY, SHARED_NOTES_CATEGORY_COLOR);

export const addCategory = (name, color) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(
      tx => {
        // First, check if the category already exists (prefer a live row;
        // fall back to the most recently soft-deleted one, which gets revived)
        tx.executeSql(
          'SELECT id, deleted_at FROM categories WHERE name = ? ORDER BY deleted_at IS NULL DESC, deleted_at DESC LIMIT 1;',
          [name],
          (_, selectResult) => {
            if (selectResult.rows.length > 0) {
              const existing = selectResult.rows.item(0);
              if (existing.deleted_at) {
                // Revive the soft-deleted category
                tx.executeSql(
                  'UPDATE categories SET deleted_at = NULL, color = ? WHERE id = ?;',
                  [color, existing.id],
                  () => resolve(existing.id),
                  (_, updateError) => reject(updateError),
                );
              } else {
                // Category already exists, return its ID
                resolve(existing.id);
              }
            } else {
              // Insert new category
              tx.executeSql(
                'INSERT INTO categories (name, color) VALUES (?, ?);',
                [name, color],
                (_, insertResult) => resolve(insertResult.insertId),
                (_, insertError) => reject(insertError),
              );
            }
          },
          (_, selectError) => reject(selectError),
        );
      },
      error => reject(error),
    );
  });
};
export const updateCategory = (categoryId, {name, color}) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(
      tx => {
        tx.executeSql(
          'UPDATE categories SET name = ?, color = ? WHERE id = ?;',
          [name, color, categoryId],
          (_, result) => resolve(result),
          (_, error) => reject(error),
        );
      },
      error => reject(error),
    );
  });
};

export const getAllCategories = (query = null) => {
  const fastdb = getDb();

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      // These exclusions keep the app's own categories — mentor/mentee, and
      // the one holding imported notes — out of every list the user sees.
      // CreateCategoryModal rejects user-typed names matching the same tags,
      // both driven by HIDDEN_CATEGORY_TAGS above.
      //
      // This is the only query that lists categories, so hiding one here hides
      // it everywhere: the Categories tab, the assign pickers and the header
      // dropdown all read from it.
      //
      // The tags are internal constants, never user input, so interpolating
      // them is safe. Note '_' is a single-character wildcard in LIKE, which
      // makes these patterns very slightly looser than exact — the behaviour
      // they have always had, and harmless for tags nobody types.
      const hiddenTagClauses = HIDDEN_CATEGORY_TAGS.map(
        tag => `AND name NOT LIKE '%${tag}%'`,
      ).join('\n          ');

      let sql = `
        SELECT *, 'category' AS type
        FROM categories
        WHERE deleted_at IS NULL
          ${hiddenTagClauses}
          AND name NOT LIKE '%@%'         -- ❗ exclude emails
      `;

      const params = [];

      if (query && query.trim().length > 0) {
        sql += ` AND LOWER(name) LIKE ?`;
        params.push(`%${query.toLowerCase()}%`);
      }

      sql += ` ORDER BY created_at DESC`;

      tx.executeSql(
        sql,
        params,
        (_, result) => {
          const categories = [];
          for (let i = 0; i < result.rows.length; i++) {
            categories.push(result.rows.item(i));
          }
          resolve(categories);
        },
        (_, error) => reject(error),
      );
    });
  });
};

export const addItemToCategory = (categoryId, itemId, itemType) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(
      tx => {
        // Only conflicts with a *live* link (partial unique index scoped to
        // deleted_at IS NULL) — a previously soft-deleted link just gets a
        // fresh row instead of needing to be revived.
        tx.executeSql(
          `INSERT INTO category_items (category_id, item_id, item_type) VALUES (?, ?, ?)
           ON CONFLICT(category_id, item_id, item_type) WHERE deleted_at IS NULL
           DO NOTHING;`,
          [categoryId, String(itemId), itemType],
          (_, result) => resolve(result),
          (_, error) => reject(error),
        );
      },
      error => reject(error),
    );
  });
};

export const removeItemFromCategory = (categoryId, itemId, itemType) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(
      tx => {
        // item_id is TEXT and addItemToCategory always inserts String(itemId)
        // — this needs the same coercion, or a numeric itemId binds as an
        // integer and never matches the stored string (confirmed: rowsAffected
        // was 0 even for an exact-looking match, since this driver doesn't
        // apply SQLite's usual numeric-to-text affinity conversion on bind).
        tx.executeSql(
          'UPDATE category_items SET deleted_at = CURRENT_TIMESTAMP WHERE category_id = ? AND item_id = ? AND item_type = ? AND deleted_at IS NULL;',
          [categoryId, String(itemId), itemType],
          (_, result) => resolve(result),
          (_, error) => reject(error),
        );
      },
      error => reject(error),
    );
  });
};

export const getCategoryData = (categoryId, types) => {
  const db = getDb();

  if (!types) {
    return Promise.reject(new Error('Types are required'));
  }

  const typesArray = Array.isArray(types) ? types : [types];

  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      const queries = [];
      const params = [];

      typesArray.forEach(type => {
        let selectFields = `t.*`;
        let baseTable = '';
        let extraJoins = '';
        let joinCondition = '';

        // ─────────────────────────────
        // ITEMS (youtube / drive / device)
        // ─────────────────────────────
        if (ITEM_TYPES_THAT_USE_ITEMS_TABLE.includes(type)) {
          baseTable = `items t`;
          joinCondition = `ci.item_id = t.source_id`; // or t.id if needed

          selectFields = `
            t.*,
            youtube_meta.channel_title,
            youtube_meta.thumbnail
          `;

          extraJoins = `
            LEFT JOIN youtube_meta
              ON youtube_meta.item_id = t.id
          `;
        }

        // ─────────────────────────────
        // NOTES
        // ─────────────────────────────
        else if (type === 'note') {
          baseTable = `notes t`;
          joinCondition = `ci.item_id = t.rowid`;
        }

        // ─────────────────────────────
        // NOTEBOOKS
        // ─────────────────────────────
        else if (type === 'notebook') {
          baseTable = `notebooks t`;
          joinCondition = `ci.item_id = t.id`;
        }

        else {
          return;
        }

        queries.push(`
          SELECT
            ${selectFields},
            ci.item_type,
            ci.created_at AS category_added_at
          FROM category_items ci
          JOIN ${baseTable}
            ON ${joinCondition}
          ${extraJoins}
          WHERE ci.category_id = ?
            AND ci.item_type = ?
            AND ci.deleted_at IS NULL
            AND t.deleted_at IS NULL
        `);

        params.push(categoryId, type);
      });

      if (!queries.length) {
        resolve([]);
        return;
      }

      const finalQuery = `
        ${queries.join(' UNION ALL ')}
        ORDER BY category_added_at DESC
      `;

      tx.executeSql(
        finalQuery,
        params,
        (_, result) => {
          const data = [];
          for (let i = 0; i < result.rows.length; i++) {
            data.push(result.rows.item(i));
          }
          resolve(data);
        },
        (_, error) => reject(error),
      );
    }, reject);
  });
};
//for fetching notes same fn : Fetch notes of database/R.js file
// fetchNotesInCategory is removed and fetchNotes is used with categoryId as parameter to fetch notes of category

export const checkItemInCategory = (categoryId, itemId, itemType) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(
      tx => {
        tx.executeSql(
          `SELECT 1 FROM category_items
             WHERE category_id = ? AND item_id = ? AND item_type = ? AND deleted_at IS NULL;`,
          [categoryId, String(itemId), itemType],
          (_, result) => resolve(result.rows.length > 0),
          (_, error) => reject(error),
        );
      },
      error => reject(error),
    );
  });
};

export const deleteCategories = categoryIds => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(
      tx => {
        // First soft-delete the category items
        tx.executeSql(
          'UPDATE category_items SET deleted_at = CURRENT_TIMESTAMP WHERE category_id IN (' +
            categoryIds.map(() => '?').join(',') +
            ') AND deleted_at IS NULL;',
          categoryIds,
          () => {
            // Then soft-delete the categories themselves
            tx.executeSql(
              'UPDATE categories SET deleted_at = CURRENT_TIMESTAMP WHERE id IN (' +
                categoryIds.map(() => '?').join(',') +
                ');',
              categoryIds,
              (_, result) => resolve(result),
              (_, error) => reject(error),
            );
          },
          (_, error) => reject(error),
        );
      },
      error => reject(error),
    );
  });
};
