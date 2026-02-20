import {getDb} from './database';

// Vibrant Colors for Pie Chart
const DEVICE_COLOR = '#00D97E'; // Brighter Green
const DRIVE_COLOR = '#4D9FFF';  // Brighter Blue

const getYtColor = i =>
  [
    '#ff4c4c', // Vibrant Red
    '#ff6f61', // Coral Red
    '#ff3b3f', // Crimson Red
    '#ff5e57', // Tomato Red
    '#ff2e63', // Hot Pinkish Red
    '#ff1744', // Electric Red
  ][i % 6];


export const fetchWatchTimeData = (startDate, endDate) => {
  const fastdb = getDb();

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      const query = `
        SELECT 
          i.type,
          ym.channel_title,
          SUM(vwh.newWatchTimePerDay) AS time
        FROM video_watch_history vwh
        JOIN items i 
          ON i.source_id = vwh.videoId
        LEFT JOIN youtube_meta ym 
          ON ym.item_id = i.id
        WHERE vwh.date BETWEEN ? AND ?
        GROUP BY i.type, ym.channel_title
        ORDER BY time DESC
      `;

      tx.executeSql(
        query,
        [startDate, endDate],
        (_, { rows }) => {
          const chartData = [];
          const totals = { device: 0, drive: 0 };

          for (let i = 0; i < rows.length; i++) {
            const row = rows.item(i);
            if (!row.time) continue;

            if (row.type === 'device_file') {
              totals.device += row.time;
            } else if (row.type === 'drive_file') {
              totals.drive += row.time;
            } else if (row.type === 'youtube_video') {
              chartData.push({
                name: row.channel_title || `Unknown Channel ${i + 1}`,
                time: row.time,
                color: getYtColor(i),
              });
            }
          }

          if (totals.device > 0) {
            chartData.push({
              name: 'Device',
              time: totals.device,
              color: DEVICE_COLOR,
            });
          }

          if (totals.drive > 0) {
            chartData.push({
              name: 'Drive',
              time: totals.drive,
              color: DRIVE_COLOR,
            });
          }

          resolve(chartData);
        },
        (_, error) => reject(error),
      );
    });
  });
};

