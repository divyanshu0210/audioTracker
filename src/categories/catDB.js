import {ITEM_TYPES_THAT_USE_ITEMS_TABLE} from '../contexts/constants';
import {getDb} from '../database/database';

export const addCategory = (name, color) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(
      tx => {
        // First, check if the category already exists
        tx.executeSql(
          'SELECT id FROM categories WHERE name = ?;',
          [name],
          (_, selectResult) => {
            if (selectResult.rows.length > 0) {
              // Category already exists, return its ID
              const existingId = selectResult.rows.item(0).id;
              resolve(existingId);
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
export const getAllCategories = (query = null) => {
  const fastdb = getDb();

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      let sql = `
        SELECT *, 'category' AS type
        FROM categories
        WHERE name NOT LIKE '%[MENTEE_CAT_Filter]%'
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
        tx.executeSql(
          'INSERT OR IGNORE INTO category_items (category_id, item_id, item_type) VALUES (?, ?, ?);',
          [categoryId, itemId, itemType],
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
        tx.executeSql(
          'DELETE FROM category_items WHERE category_id = ? AND item_id = ? AND item_type = ?;',
          [categoryId, itemId, itemType],
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
             WHERE category_id = ? AND item_id = ? AND item_type = ?;`,
          [categoryId, itemId, itemType],
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
        // First delete the category items
        tx.executeSql(
          'DELETE FROM category_items WHERE category_id IN (' +
            categoryIds.map(() => '?').join(',') +
            ');',
          categoryIds,
          () => {
            // Then delete the categories themselves
            tx.executeSql(
              'DELETE FROM categories WHERE id IN (' +
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
