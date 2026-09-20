// corpusText.js
//
// The readable half of the corpus: the Devanagari, the transliteration, the
// translation - everything the panel actually draws, and none of what the
// matcher searches.
//
// Kept apart from the index on purpose. The index is integers and is held for
// as long as the player is open; this is sixteen megabytes of text across
// fifteen shards, and a session that never matches a Caitanya-caritamrta verse
// should never pay to have the Madhya-lila in memory. So a shard is loaded the
// first time something inside it matches, and then kept - a lecture that quotes
// one canto will quote several.
//
// Metro resolves `require` statically, so the map below cannot be built from
// the shard name at runtime. Every shard has to be written out. If a new one is
// ever added to the build output it has to be added here too, which the test in
// __tests__ checks by comparing this map against the manifest.

import manifest from './corpus/text/manifest.json';

const SHARDS = {
  bg: () => require('./corpus/text/bg.json'),
  'sb-1': () => require('./corpus/text/sb-1.json'),
  'sb-2': () => require('./corpus/text/sb-2.json'),
  'sb-3': () => require('./corpus/text/sb-3.json'),
  'sb-4': () => require('./corpus/text/sb-4.json'),
  'sb-5': () => require('./corpus/text/sb-5.json'),
  'sb-6': () => require('./corpus/text/sb-6.json'),
  'sb-7': () => require('./corpus/text/sb-7.json'),
  'sb-8': () => require('./corpus/text/sb-8.json'),
  'sb-9': () => require('./corpus/text/sb-9.json'),
  'sb-10': () => require('./corpus/text/sb-10.json'),
  'sb-11': () => require('./corpus/text/sb-11.json'),
  'sb-12': () => require('./corpus/text/sb-12.json'),
  'cc-adi': () => require('./corpus/text/cc-adi.json'),
  'cc-madhya': () => require('./corpus/text/cc-madhya.json'),
  'cc-antya': () => require('./corpus/text/cc-antya.json'),
  songs: () => require('./corpus/text/songs.json'),
};

const loaded = new Map();

/**
 * Which shard an id lives in.
 *
 * Derived from the id rather than stored per record, because the index holds
 * twenty thousand of these and a string per record is exactly the kind of
 * weight the split above exists to avoid.
 *
 *   bg-2.13          -> bg
 *   sb-1.1.2         -> sb-1
 *   cc-madhya-2.62   -> cc-madhya
 *   song-gopinath1   -> songs
 */
export const shardFor = id => {
  if (!id) return null;
  if (id.startsWith('bg-')) return 'bg';
  if (id.startsWith('song-')) return 'songs';
  if (id.startsWith('cc-')) return `cc-${id.split('-')[1]}`;
  if (id.startsWith('sb-')) return `sb-${id.slice(3).split('.')[0]}`;
  return null;
};

const shardContents = shard => {
  if (!shard) return null;
  if (!loaded.has(shard)) {
    const load = SHARDS[shard];
    if (!load) return null;
    try {
      loaded.set(shard, load());
    } catch (err) {
      // A shard that will not parse should cost its own verses and nothing
      // else - the player is still playing, and the panel can stay empty.
      console.warn(`[verses] shard ${shard} failed to load:`, err?.message);
      loaded.set(shard, {});
    }
  }
  return loaded.get(shard);
};

// A verse inside a combined record, e.g. bg-1.17 inside bg-1.16-18.
//
// The edition prints consecutive verses as one unit wherever they were
// translated as one - thirty-three such units in the Gita alone, and a hundred
// more across the Bhagavatam and the Caitanya-caritamrta. The recitation path
// never notices, because it matches the text and the text is all there under
// the combined id. The *citation* path does: a lecturer saying "chapter one,
// text seventeen" produces bg-1.17, which is not an id in the corpus, and the
// verse would silently fail to resolve.
const resolveRange = (contents, id) => {
  // Only the last number of an id can be a range - `bg-1.16-18`, never
  // `bg-1-2.16`. So the prefix is everything up to the final number.
  const m = id.match(/^(.*\.)(\d+)$/);
  if (!m) return null;

  const [, prefix, wanted] = m;
  const target = Number(wanted);

  for (const key of Object.keys(contents)) {
    if (!key.startsWith(prefix)) continue;
    const range = key.slice(prefix.length).match(/^(\d+)-(\d+)$/);
    if (!range) continue;
    const from = Number(range[1]);
    // The printed form abbreviates: `16-18` means 16 to 18, but `108-110` can
    // appear as `108-10`. Read the end as sharing the first digits of the
    // start whenever it is the smaller number.
    let to = Number(range[2]);
    if (to < from) {
      const head = range[1].slice(0, range[1].length - range[2].length);
      to = Number(head + range[2]);
    }
    if (target >= from && target <= to) return contents[key];
  }
  return null;
};

/**
 * The full record for an id, or null.
 *
 * Synchronous: `require` of a bundled asset does not go to disk, and making
 * this a promise would put an await between a match and the panel drawing it
 * for no benefit. The first call for a shard is the expensive one.
 */
export const lookup = id => {
  const contents = shardContents(shardFor(id));
  if (!contents) return null;
  return contents[id] || resolveRange(contents, id) || null;
};

/** Shard names the build produced, for the test that keeps SHARDS honest. */
export const shardNames = () => Object.keys(manifest);

export const knownShards = () => Object.keys(SHARDS);

/** Drops the cached shards. Nothing needs this but a low-memory warning. */
export const releaseText = () => loaded.clear();
