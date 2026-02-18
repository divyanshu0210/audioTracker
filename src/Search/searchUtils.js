import { getDb } from "../database/database";

export const searchAllTables = (query, filters = ['all'], parentId = null) => {
  const fastdb = getDb();
  const q = `%${query.toLowerCase()}%`;

  return new Promise(resolve => {
    const includeAll = filters.includes('all');
    const results = [];
    const promises = [];

    // ─────────────────────────────────────────
    // 1️⃣ SEARCH ITEMS TABLE
    // ─────────────────────────────────────────
    const selectedTypes = includeAll ? [] : filters.filter(Boolean);

    let itemQuery = `
      SELECT
          items.*,
          youtube_meta.channel_title,
          youtube_meta.thumbnail
        FROM items
        LEFT JOIN youtube_meta
          ON youtube_meta.item_id = items.id
      WHERE LOWER(items.title) LIKE ?
    `;

    const params = [q];
    if (parentId !== null) {
      itemQuery += ` AND items.parent_id = ?`;
      params.push(parentId);
    }
    if (!includeAll && selectedTypes.length > 0) {
      itemQuery += `
        AND type IN (${selectedTypes.map(() => '?').join(',')})
      `;
      params.push(...selectedTypes);
    }

    if (includeAll || selectedTypes.length > 0) {
      promises.push(
        new Promise(res => {
          fastdb.transaction(tx => {
            tx.executeSql(
              itemQuery,
              params,
              (_, {rows}) => {
                for (let i = 0; i < rows.length; i++) {
                  results.push({
                    ...rows.item(i),
                    source_type: rows.item(i).type, // for compatibility
                  });
                }
                res();
              },
              () => res(),
            );
          });
        }),
      );
    }

    // ─────────────────────────────────────────
    // 2️⃣ SEARCH NOTEBOOKS
    // ─────────────────────────────────────────
    if (includeAll || filters.includes('notebook')) {
      promises.push(
        new Promise(res => {
          fastdb.transaction(tx => {
            tx.executeSql(
              `SELECT *, 'notebook' as type FROM notebooks WHERE LOWER(title) LIKE ?`,
              [q],
              (_, {rows}) => {
                for (let i = 0; i < rows.length; i++) {
                  results.push({
                    ...rows.item(i),
                    source_type: 'notebook',
                  });
                }
                res();
              },
              () => res(),
            );
          });
        }),
      );
    }

    Promise.all(promises).then(() => resolve(results));
  });
};
