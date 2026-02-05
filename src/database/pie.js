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
    fastdb.transaction(
      tx => {
        const results = {youtube: 0, drive: 0, device: 0};
        const chartData = [];

        const youtubeQuery = `
        SELECT SUM(vwh.newWatchTimePerDay) AS time
        FROM video_watch_history vwh
        JOIN videos v ON v.ytube_id = vwh.videoId
        WHERE vwh.date BETWEEN ? AND ?`;

        tx.executeSql(
          youtubeQuery,
          [startDate, endDate],
          (_, {rows}) => {
            results.youtube = rows.item(0).time || 0;

            const driveQuery = `
            SELECT SUM(vwh.newWatchTimePerDay) AS time
            FROM video_watch_history vwh
            JOIN files f ON f.drive_id = vwh.videoId
            WHERE vwh.date BETWEEN ? AND ?`;

            tx.executeSql(
              driveQuery,
              [startDate, endDate],
              (_, {rows}) => {
                results.drive = rows.item(0).time || 0;

                const deviceQuery = `
                SELECT SUM(vwh.newWatchTimePerDay) AS time
                FROM video_watch_history vwh
                JOIN device_files df ON df.uuid = vwh.videoId
                WHERE vwh.date BETWEEN ? AND ?`;

                tx.executeSql(
                  deviceQuery,
                  [startDate, endDate],
                  (_, {rows}) => {
                    results.device = rows.item(0).time || 0;

                    if (results.device > 0) {
                      chartData.push({
                        name: 'Device',
                        time: results.device,
                        color: DEVICE_COLOR,
                      });
                    }

                    if (results.drive > 0) {
                      chartData.push({
                        name: 'Drive',
                        time: results.drive,
                        color: DRIVE_COLOR,
                      });
                    }

                    const ytChannelQuery = `
                    SELECT v.channel_title AS channel, SUM(vwh.newWatchTimePerDay) AS time
                    FROM video_watch_history vwh
                    JOIN videos v ON v.ytube_id = vwh.videoId
                    WHERE vwh.date BETWEEN ? AND ?
                    GROUP BY v.channel_title
                    ORDER BY time DESC`;

                    tx.executeSql(
                      ytChannelQuery,
                      [startDate, endDate],
                      (_, {rows}) => {
                        for (let i = 0; i < rows.length; i++) {
                          const item = rows.item(i);
                          if (item.time > 0) {
                            chartData.push({
                              name: item.channel || `Unknown Channel ${i + 1}`,
                              time: item.time,
                              color: getYtColor(i)
                            });
                          }
                        }
                        console.log('Final Chart Data:', chartData);
                        resolve(chartData);
                      },
                      (_, error) => {
                        console.error(
                          'Error executing YouTube channel query:',
                          error,
                        );
                        reject(error);
                      },
                    );
                  },
                  (_, error) => {
                    console.error(
                      'Error executing Device WatchTime query:',
                      error,
                    );
                    reject(error);
                  },
                );
              },
              (_, error) => {
                console.error('Error executing Drive WatchTime query:', error);
                reject(error);
              },
            );
          },
          (_, error) => {
            console.error('Error executing YouTube WatchTime query:', error);
            reject(error);
          },
        );
      },
      error => {
        console.error('Transaction error:', error);
        reject(error);
      },
    );
  });
};
