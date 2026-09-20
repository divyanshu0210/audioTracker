// Purports, fetched when somebody asks for one.
//
// They are not in the corpus and should not be. The three books come to 93MB
// of markdown and the purports are most of that - shipping them would take the
// bundled corpus from 27MB to around 100MB, inside an APK that already asks for
// a 190MB model. For text that is read a few times a session, on a screen
// showing a verse under a playing lecture, that is the wrong trade.
//
// So the verse and its translation stay bundled - those have to be instant,
// because a verse appears on its own while somebody is listening - and the
// purport is fetched on the tap that asks to read it. Once fetched it is kept,
// so the second look is offline and immediate.
//
// The source is the same archive the corpus was built from, read as raw
// markdown rather than scraped: no HTML, no parsing of somebody's page layout,
// and a file path that falls straight out of the record id.

import AsyncStorage from '@react-native-async-storage/async-storage';

const RAW =
  'https://raw.githubusercontent.com/juanmanuelferrera/vedabase-original/main/';

const KEY_PREFIX = '@verses/purport/';

const pad = n => String(n).padStart(2, '0');

/**
 * Where a record's markdown lives in the archive, or null.
 *
 * The archive's layout is derivable from the id, which is the whole reason this
 * is a few lines rather than an index:
 *
 *   bg-2.13        bhagavad-gita-as-it-is/chapter-02/bg-2.13.md
 *   sb-1.2.6       srimad-bhagavatam/canto-01/chapter-02/sb-1.2.6.md
 *   cc-adi-1.1     sri-caitanya-caritamrta/adi-lila/chapter-01/cc-adi-1.1.md
 *
 * Combined verses keep their range in the filename - bg-1.16-18.md - and so do
 * our ids, so they need no special handling.
 */
export const purportPath = id => {
  if (!id) return null;

  const bg = id.match(/^bg-(\d+)\./);
  if (bg) return `bhagavad-gita-as-it-is/chapter-${pad(bg[1])}/${id}.md`;

  const sb = id.match(/^sb-(\d+)\.(\d+)\./);
  if (sb) {
    return `srimad-bhagavatam/canto-${pad(sb[1])}/chapter-${pad(sb[2])}/${id}.md`;
  }

  const cc = id.match(/^cc-(adi|madhya|antya)-(\d+)\./);
  if (cc) {
    return `sri-caitanya-caritamrta/${cc[1]}-lila/chapter-${pad(cc[2])}/${id}.md`;
  }

  // Songs, and anything else. kksongs has no purports.
  return null;
};

/** Whether this record could have a purport at all. */
export const mayHavePurport = id => purportPath(id) !== null;

/**
 * The purport out of a verse's markdown.
 *
 * The file is laid out as a heading, the verse in blockquotes, a synonyms line,
 * the translation in bold, and then the purport as ordinary paragraphs. So the
 * purport is simply everything after the bold block - no parsing of the prose
 * itself, which is what keeps this from breaking on the next verse that is
 * formatted slightly differently.
 *
 * Not every verse has one. Many of the Caitanya-caritamrta's do not, and the
 * colophons have nothing at all, so an empty result is ordinary rather than a
 * failure.
 */
export const extractPurport = markdown => {
  if (!markdown) return '';

  const blocks = markdown
    .split(/\n\s*\n/)
    .map(b => b.trim())
    .filter(Boolean);

  // The translation is the bold block. Found from the end of the front matter
  // rather than by counting blocks, because the number of blockquote blocks
  // varies - some verses print Devanagari, some do not.
  const translationAt = blocks.findIndex(b => b.startsWith('**'));
  if (translationAt === -1) return '';

  return blocks
    .slice(translationAt + 1)
    // Anything still quoted after the translation is a cited verse inside the
    // purport; keep it, but drop the quote marker.
    .map(b => b.replace(/^>\s?/gm, ''))
    // Markdown emphasis, which is transliteration in nearly every case. The
    // text reads better without the asterisks than with them rendered.
    .map(b => b.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1'))
    // A trailing backslash is markdown's hard line break.
    .map(b => b.replace(/\\$/gm, ''))
    .join('\n\n')
    .trim();
};

/**
 * A record's purport.
 *
 * Returns '' when there is genuinely none, and throws only when it could not be
 * fetched - the two are different, and the panel says different things about
 * them.
 */
export const fetchPurport = async id => {
  const path = purportPath(id);
  if (!path) return '';

  const key = `${KEY_PREFIX}${id}`;
  try {
    const cached = await AsyncStorage.getItem(key);
    if (cached !== null) return cached;
  } catch (err) {
    // A cache that cannot be read is not a reason to fail; fetch it again.
  }

  const response = await fetch(RAW + path);
  if (response.status === 404) {
    // The archive does not carry this one. Remembered as empty so the next tap
    // does not go to the network to be told the same thing.
    await remember(key, '');
    return '';
  }
  if (!response.ok) {
    throw new Error(`could not fetch the purport (HTTP ${response.status})`);
  }

  const purport = extractPurport(await response.text());
  await remember(key, purport);
  return purport;
};

const remember = async (key, value) => {
  try {
    await AsyncStorage.setItem(key, value);
  } catch (err) {
    // Costs the next read a fetch, which is the state it was in anyway.
    console.log('[verses] could not cache a purport:', err?.message);
  }
};

/** Everything cached, for a settings screen that wants to reclaim the space. */
export const clearPurports = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter(k => k.startsWith(KEY_PREFIX));
    if (ours.length) await AsyncStorage.multiRemove(ours);
    return ours.length;
  } catch (err) {
    return 0;
  }
};
