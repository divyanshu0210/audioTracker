import { getDb } from "../../database/database";

export const searchAllTables = (query, filters = ['all']) => {
  const fastdb = getDb();
  const q = `%${query.toLowerCase()}%`;

  const tableQueries = [
    { table: 'folders', column: 'name', label: 'folder' },
    { table: 'files', column: 'name', label: 'drive' },
    { table: 'device_files', column: 'name', label: 'device' },
    { table: 'videos', column: 'title', label: 'youtube' },
    { table: 'playlists', column: 'title', label: 'playlist' },
    { table: 'notebooks', column: 'name', label: 'Notebook' },
  ];

  const filteredQueries =
    filters.includes('all')
      ? tableQueries
      : tableQueries.filter(q => filters.includes(q.table));

  return new Promise(resolve => {
    let results = [];
    let remaining = filteredQueries.length;

    if (remaining === 0) return resolve([]);

    filteredQueries.forEach(({ table, column, label }) => {
      fastdb.transaction(tx => {
        tx.executeSql(
          `SELECT * FROM ${table} WHERE LOWER(${column}) LIKE ?`,
          [q],
          (_, { rows }) => {
            for (let i = 0; i < rows.length; i++) {
              const item = rows.item(i);
              let formattedItem = null;

              switch (label) {
                case 'folder':
                  formattedItem = {
                    driveId: item.drive_id,
                    name: item.name,
                    parentId: item.parent_id,
                    mimeType: 'application/vnd.google-apps.folder',
                    file_path: null,
                    duration: null,
                    created_at: item.created_at,
                    in_show: item.in_show,
                    out_show: item.out_show,
                    source_type: label,
                  };
                  break;
                case 'drive':
                  formattedItem = {
                    driveId: item.drive_id,
                    name: item.name,
                    parentId: item.parent_id,
                    mimeType: item.mimeType,
                    file_path: item.file_path,
                    duration: item.duration,
                    created_at: item.created_at,
                    in_show: item.in_show,
                    out_show: item.out_show,
                    source_type: label,
                  };
                  break;
                case 'device':
                  formattedItem = {
                    driveId: item.id,
                    name: item.name,
                    parentId: item.parent_id,
                    mimeType: item.mimeType,
                    file_path: item.file_path,
                    duration: item.duration,
                    created_at: item.created_at,
                    in_show: item.in_show,
                    out_show: item.out_show,
                    source_type: label,
                  };
                  break;
                case 'youtube':
                  formattedItem = {
                    id: item.id,
                    ytube_id: item.ytube_id,
                    title: item.title,
                    channel_title: item.channel_title,
                    type: 'youtube',
                    thumbnail: null,
                    parent_id: null,
                    in_show: item.in_show,
                    out_show: item.out_show,
                    duration: item.duration,
                    created_at: item.created_at,
                    source_type: label,
                  };
                  break;
                case 'playlist':
                  formattedItem = {
                    id: item.id,
                    ytube_id: item.ytube_id,
                    title: item.title,
                    channel_title: item.channel_title,
                    type: 'playlist',
                    thumbnail: item.thumbnail,
                    parent_id: null,
                    in_show: item.in_show ?? 0,
                    out_show: item.out_show,
                    duration: null,
                    created_at: item.created_at,
                    source_type: label,
                  };
                  break;
                case 'Notebook':
                  formattedItem = {
                    id: item.id,
                    name: item.name,
                    color: item.color,
                    created_at: item.created_at,
                    source_type: label,
                  };
                  break;
              }

              if (formattedItem) results.push(formattedItem);
            }

            if (--remaining === 0) resolve(results);
          },
          () => {
            if (--remaining === 0) resolve(results);
          },
        );
      });
    });
  });
};
