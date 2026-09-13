// hourlyMap.js
//
// Turning recorded watch sessions into "minutes watched per hour of the day".
//
// Kept apart from both the database and the API because the same rows arrive
// from either: a mentee's own sessions come from video_watch_history, a
// mentor's view of them comes from /report/hourly-watch-map/. One function
// means the grid cannot mean two different things depending on whose week is
// on screen.

// A session is split across the hours it actually spans rather than counted
// against the hour it began - an hour's sitting from 20:45 is fifteen minutes
// of one hour and forty-five of the next, and filing all of it under 20 would
// draw an evening that never happened.
//
// Local hours throughout: the question is when this person was awake and
// watching, which is a fact about their clock, not UTC. Epoch milliseconds are
// absolute, so this is the one place a timezone has to be chosen, and the
// device's is the closest thing to the right one.
const dayKey = date =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;

/** The last `days` day keys ending today, for when no week is named. */
export const lastNDays = (days = 7) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  return Array.from({length: days}, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return dayKey(date);
  });
};

/**
 * @param records [{clockIntervals: [[startMs, endMs], ...]}, ...] - the `date`
 *   on a record is ignored; the instants decide where each slice lands.
 * @param dates the day keys to build rows for, in the order they should show.
 *   Taken from the week the calendar is on, so the grid and the bar chart are
 *   always describing the same seven days.
 * @returns [{date, hours: number[24]}] - one row per requested day, whether or
 *   not anything was watched: an untouched day is a real answer.
 */
export const buildHourlyMap = (records, dates = lastNDays(7)) => {
  const buckets = new Map();
  for (const date of dates) {
    buckets.set(date, new Array(24).fill(0));
  }

  for (const record of records ?? []) {
    let sessions = record?.clockIntervals;
    if (typeof sessions === 'string') {
      try {
        sessions = JSON.parse(sessions || '[]');
      } catch {
        continue;
      }
    }
    if (!Array.isArray(sessions)) continue;

    for (const session of sessions) {
      if (!Array.isArray(session) || session.length < 2) continue;
      const [from, to] = session;
      if (!(to > from)) continue;

      // Walk the session hour by hour, adding only the part inside each one.
      let cursor = new Date(from);
      while (cursor.getTime() < to) {
        const hourEnd = new Date(cursor);
        hourEnd.setMinutes(0, 0, 0);
        hourEnd.setHours(hourEnd.getHours() + 1);

        const sliceEnd = Math.min(hourEnd.getTime(), to);
        const hours = buckets.get(dayKey(cursor));
        if (hours) {
          hours[cursor.getHours()] += (sliceEnd - cursor.getTime()) / 60000;
        }
        cursor = new Date(sliceEnd);
      }
    }
  }

  // Iterated over `dates`, not the Map, so the rows come back in the order the
  // caller asked for rather than insertion order.
  return dates.map(date => ({
    date,
    hours: (buckets.get(date) ?? new Array(24).fill(0)).map(
      minutes => Math.round(minutes * 10) / 10,
    ),
  }));
};

export default buildHourlyMap;
