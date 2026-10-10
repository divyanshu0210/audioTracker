// Was that the right verse?
//
// Every threshold this feature rests on was set without a real recording.
// MIN_CONFIDENCE, MIN_SOLID_RATIO, MISS_PENALTY, the corroboration count - all
// tuned against a simulated recogniser or synthetic Devanagari soup, and in one
// case guessed outright. They are what puts a wrong verse on screen, and there
// has been no way to tell which of them is wrong or in which direction.
//
// So every match is logged with the numbers that produced it, and then with
// whatever the person did about it. Two kinds of signal, because they answer
// different questions:
//
//   deliberate   a thumb. Rare, and unambiguous when it comes.
//   incidental   what they did anyway. Dismissing a verse seconds after it
//                appears, or seeking back to one from the history. Noisier per
//                event, but there is one on every match rather than on the few
//                anyone bothers to rate.
//
// A revisit is the strongest signal here and the one nobody has to be asked
// for: seeking to a verse means it was both right and worth finding again.
//
// Deliberately no audio. Keeping the window would be the only route to
// improving recognition itself, and that needs a training pipeline and
// thousands of labelled utterances - so it would mean holding recorded lectures
// on someone's phone for nothing.

import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = '@verses/feedback/queue';

// Enough that a week offline loses nothing, small enough to be beneath
// noticing: a row is about two hundred bytes.
const MAX_QUEUED = 500;

// Sent in batches. One request per match would be a request every few minutes
// through a lecture, for data that is worth nothing until it is aggregated.
const BATCH = 50;

// A request that hangs is worse here than one that fails. Without this, a
// captive portal or a half-open connection leaves a fetch outstanding for as
// long as the platform allows, and the next flush stacks on top of it.
const TIMEOUT_MS = 10000;

// Only explicit thumbs are feedback. The matcher may keep richer local state
// while the recording is playing, but that state is not useful to the server.
const PUBLIC_VERDICTS = new Set(['right', 'wrong']);
const compactRow = row => ({
  key: String(row.key),
  verdict: row.verdict,
  id: row.id || '',
  ref: row.ref || '',
  kind: row.kind || '',
});

/**
 * Add explicit ratings to the queue.
 *
 * Keep the matched verse/song so counts can be grouped by it, together with
 * the verdict. All matcher evidence stays on the device.
 */
export const enqueue = async rows => {
  if (!rows || !rows.length) return;
  try {
    const feedback = rows
      .filter(row => row?.key && PUBLIC_VERDICTS.has(row.verdict))
      .map(compactRow);
    // Also compact any queue left by an older app version, so legacy
    // diagnostic rows are never uploaded after this update.
    const queued = (await load())
      .filter(row => row?.key && PUBLIC_VERDICTS.has(row.verdict))
      .map(compactRow);
    if (!feedback.length) {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queued));
      return;
    }
    await AsyncStorage.setItem(
      QUEUE_KEY,
      JSON.stringify([...queued, ...feedback].slice(-MAX_QUEUED)),
    );
  } catch (err) {
    console.log('[verses] could not queue feedback:', err?.message);
  }
};
const load = async () => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    return [];
  }
};

// One flush at a time. Connectivity returning while a lecture ends would
// otherwise start two, and both would read the same rows and send them twice.
let flushing = false;

/**
 * Send what is queued, and keep whatever would not go.
 *
 * Rows are only dropped once the server has taken them, so a lecture played in
 * flight mode is not lost - it goes up whenever the device is next online and
 * something calls this. Nothing here is worth a message to somebody watching a
 * lecture, so every failure is silent.
 */
export const flush = async () => {
  if (flushing) return 0;

  // Asked before trying rather than after failing. Offline, fetch does not
  // fail quickly - it can sit until the platform gives up - and this runs while
  // a lecture is playing.
  try {
    const net = await NetInfo.fetch();
    // isInternetReachable is null until it has been determined; only a
    // definite false is taken as offline, since a null would otherwise block
    // the first flush after launch forever.
    if (!net.isConnected || net.isInternetReachable === false) return 0;
  } catch (err) {
    // No answer about the network is not a reason to skip the attempt.
  }

  flushing = true;
  let sent = 0;
  try {
    // Keeps going while the server keeps accepting. A device that has been
    // offline for a week has more than one batch waiting, and leaving the rest
    // until the next recording would take a week to drain.
    for (;;) {
      const storedRows = await load();
      const rows = storedRows
        .filter(row => row?.key && PUBLIC_VERDICTS.has(row.verdict))
        .map(compactRow);
      if (rows.length !== storedRows.length) {
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(rows));
      }
      if (!rows.length) break;

      const batch = rows.slice(0, BATCH);
      if (!(await post(batch))) break;

      await AsyncStorage.setItem(
        QUEUE_KEY,
        JSON.stringify(rows.slice(batch.length)),
      );
      sent += batch.length;
      if (rows.length <= BATCH) break;
    }
  } finally {
    flushing = false;
  }
  return sent;
};

/** True only if the server took them. */
const post = async rows => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // Required lazily. userMgt reads a zustand store at module scope, and
    // pulling that in at import time would drag the mentor system into the
    // player's startup for the sake of one string.
    const {BASE_URL} = require('../appMentorBackend/userMgt');

    // Who these came from, if the app knows.
    //
    // Sent because two of the three things this data is for are wrong without
    // it. One enthusiastic listener producing two hundred rows would otherwise
    // set the thresholds for everybody, and a verse that is a magnet in one
    // person's library would look like a magnet in general. Both of those
    // Include the account when available so the server can count ratings per
    // user. The payload contains no audio or matcher diagnostics.
    const userId = await AsyncStorage.getItem('userId');

    // Trailing slash matters: Django's APPEND_SLASH turns a POST to the
    // slashless form into a redirect, and a redirected POST loses its body.
    const response = await fetch(`${BASE_URL}/verses/feedback/`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(userId ? {rows, userId} : {rows}),
      signal: controller.signal,
    });
    return response.ok;
  } catch (err) {
    // Offline, timed out, or the endpoint is not up yet. The rows stay put.
    return false;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Send whatever is waiting the moment the device has a connection again.
 *
 * Without this, a queue built up offline waits for the next time a recording
 * changes - which on a device that is offline all evening and online overnight
 * could be the following day.
 *
 * Idempotent: subscribing twice would flush twice on every change.
 */
let watching = false;

export const flushWhenOnline = () => {
  if (watching) return;
  watching = true;
  try {
    NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable !== false) flush();
    });
  } catch (err) {
    watching = false;
  }
};
