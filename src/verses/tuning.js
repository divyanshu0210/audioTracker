// The numbers this feature is decided by, in one place and correctable.
//
// Every one of them began as a guess. They were set against a simulated
// recogniser, against synthetic Devanagari soup, and in one case on nothing at
// all - and they are what puts a wrong verse on screen. Until now, correcting
// one meant an APK, which in practice means they never get corrected.
//
// So they are read from here rather than written where they are used. The
// values ship with the app and work without network access. User ratings do
// not change matcher thresholds remotely.
//
// The validation below keeps locally stored values within safe ranges.

const KEY = '@verses/tuning';

// Required where it is used rather than imported.
//
// matcher.js reads its numbers from here, and the matcher is otherwise pure:
// text in, a verse out, no platform underneath it. An import at the top of this
// file would put AsyncStorage's native module behind every accuracy test in the
// suite, which is a strange thing for a test about phonetics to depend on.
const storage = () => require('@react-native-async-storage/async-storage').default;

/**
 * What the app ships with.
 *
 * Each entry carries the range it is allowed to move within. The ranges are
 * deliberately narrow: this is for correcting a number that is somewhat wrong,
 * not for redesigning the matcher from a server.
 */
const SETTINGS = {
  // matcher.js
  minRunChars: {value: 22, min: 15, max: 60},
  missPenalty: {value: 0.34, min: 0.1, max: 1},
  minSolidRatio: {value: 0.22, min: 0.05, max: 0.6},
  ambiguityMargin: {value: 0.92, min: 0.6, max: 0.99},

  // useVerseStore.js
  minConfidence: {value: 0.35, min: 0, max: 0.9},
  strongRunChars: {value: 55, min: 20, max: 120},
  strongSolidRatio: {value: 0.35, min: 0.1, max: 0.8},
  corroboration: {value: 2, min: 1, max: 4},
  voteSpacingMs: {value: 3000, min: 500, max: 20000},

  // How much harder a penalised verse has to work. Applied to the run length
  // it must reach - see `penalised` below. Not a ban: any of those verses can
  // genuinely be recited, and one that really is will clear the higher bar.
  penaltyFactor: {value: 1.4, min: 1, max: 3},
};

const defaults = () =>
  Object.fromEntries(
    Object.entries(SETTINGS).map(([name, spec]) => [name, spec.value]),
  );

let current = defaults();

// Verses that are matched wrongly far more often than the rest - short records
// built out of syllables every verse shares. Learned from what many people
// reported, which is why it can only come from the server: one person's library
// cannot tell a corpus-wide problem from their own listening.
let penalised = new Set();

/** The numbers to decide by, right now. Cheap - callers may read it per match. */
export const tuning = () => current;

/** Whether a record has to clear a higher bar than the rest. */
export const isPenalised = id => penalised.has(id);

/**
 * Take what a server sent, keeping only what is sane.
 *
 * Returns the names actually adopted, so a caller can log which of its numbers
 * are no longer the ones it shipped with.
 */
export const applyTuning = config => {
  if (!config || typeof config !== 'object') return [];

  const taken = [];
  const next = defaults();

  for (const [name, spec] of Object.entries(SETTINGS)) {
    const value = config[name];
    if (typeof value !== 'number' || !isFinite(value)) continue;
    if (value < spec.min || value > spec.max) {
      console.log(`[verses] ignoring ${name}=${value}, outside ${spec.min}..${spec.max}`);
      continue;
    }
    next[name] = value;
    taken.push(name);
  }

  current = next;
  penalised = new Set(
    Array.isArray(config.penalise) ? config.penalise.filter(id => typeof id === 'string') : [],
  );
  return taken;
};

/**
 * The last configuration this device saw.
 *
 * Read at startup so a phone that is offline today still uses what it learned
 * yesterday, rather than falling back to the shipped guesses.
 */
export const loadTuning = async () => {
  try {
    const raw = await storage().getItem(KEY);
    if (raw) applyTuning(JSON.parse(raw));
  } catch (err) {
    // The shipped values stand, which is a working feature.
  }
  return current;
};
