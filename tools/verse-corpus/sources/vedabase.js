// Bhagavad-gita, Srimad-Bhagavatam and Caitanya-caritamrta, from the
// Vedabase Original Edition archive.
//
// One source for all three books, and Prabhupada's text throughout - the
// Devanagari or Bengali, the transliteration, and his translation. Nothing in
// this corpus comes from another translator, which is the point: a panel that
// answered in one voice for the Gita and a different one for the Bhagavatam
// would be quietly misrepresenting both.
//
// Why the archive rather than vedabase.io, which is the authentic source and
// serves all of this in clean markup: its robots.txt asks for ten seconds
// between requests, and chapter pages carry only links, so the text is one
// request per verse. Twenty thousand verses at that rate is eighty-odd hours of
// hammering a free service run by devotees. This archive is the same corpus,
// already extracted, fetched as a single tarball.
//
// What it does not carry: Bhagavatam cantos eleven and twelve, and canto ten
// past chapter thirteen. That is not a gap in the archive so much as the shape
// of it - Prabhupada completed the Bhagavatam through 10.13.64 and no further,
// and the archive is his own writing only. sources/sbCompletion.js covers the
// rest, and marks it as his disciples' work.
//
// A note on rights: the archive is MIT-licensed, but that covers the project's
// own scripts and compilation - the translations and purports inside it are
// Bhaktivedanta Book Trust material. Fine for a personal library; worth a
// second look before this is handed to anyone else.

const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const {fetchText, CACHE_DIR} = require('../fetch');

const TARBALL =
  'https://codeload.github.com/juanmanuelferrera/vedabase-original/tar.gz/refs/heads/main';

// Only the three books with verses in them. The archive also carries the
// lectures, letters and the smaller books, none of which anyone recites.
const BOOKS = [
  {dir: 'bhagavad-gita-as-it-is', book: 'bg'},
  {dir: 'srimad-bhagavatam', book: 'sb'},
  {dir: 'sri-caitanya-caritamrta', book: 'cc'},
];

const ROOT = 'vedabase-original-main';

// Devanagari and Bengali. Which of the two a verse is written in depends on
// the book - the Caitanya-caritamrta's own verses are Bengali - and neither is
// what gets matched, so they are only told apart from the transliteration.
const INDIC = /[ऀ-ॿঀ-৿]/;

const extractDir = () => path.join(CACHE_DIR, 'vedabase');

/**
 * Fetch and unpack the archive, unless it is already unpacked.
 *
 * 215MB over the wire, once. Everything but the three book directories is left
 * inside the tarball rather than written to disk - the archive carries the
 * whole Prabhupada library, and the rest of it is several times the size of
 * the part being used.
 */
async function ensureArchive() {
  const into = extractDir();
  if (BOOKS.every(b => fs.existsSync(path.join(into, b.dir)))) return into;

  fs.mkdirSync(into, {recursive: true});
  const tarball = path.join(CACHE_DIR, 'vedabase-original.tar.gz');

  if (!fs.existsSync(tarball)) {
    console.log('    fetching the archive (215 MB, once)...');
    const res = await fetch(TARBALL, {
      headers: {'User-Agent': 'audiotracker-verse-corpus/1.0'},
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching the archive`);
    fs.writeFileSync(tarball, Buffer.from(await res.arrayBuffer()));
  }

  console.log('    unpacking...');
  try {
    // Run from the destination and refer to the tarball relatively, rather
    // than passing either path absolutely. GNU tar reads a leading `C:` as a
    // remote host - `tar (child): Cannot connect to C` - and the Windows
    // builds of it are the ones most likely to be on PATH here. A relative
    // path with no drive letter sidesteps that on every platform.
    const relative = path.relative(into, tarball).split(path.sep).join('/');
    execFileSync(
      'tar',
      [
        '-xzf', relative,
        '--strip-components=1',
        ...BOOKS.map(b => `${ROOT}/${b.dir}`),
      ],
      {stdio: 'pipe', cwd: into},
    );
  } catch (err) {
    throw new Error(
      'could not unpack the archive - this needs `tar` on PATH ' +
        '(present on macOS, Linux and Windows 10+): ' + err.message,
    );
  }

  return into;
}

/** Every .md under a directory, recursively. */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

const cleanQuote = block =>
  block
    .split('\n')
    .map(line => line.replace(/^>\s?/, '').replace(/\\$/, '').trim())
    // Verse numbers set inside the script itself - ॥२४॥, ॥৬২॥ - are part of
    // the printed page, not of the verse.
    .map(line => line.replace(/[॥।]\s*[०-ॿ০-৯\d]+\s*[॥।]/g, '').trim())
    .filter(Boolean);

/**
 * One verse file.
 *
 * Returns null for anything without a transliteration - chapter colophons,
 * prefaces, and the handful of entries that are prose rather than verse. Those
 * have nothing to match against, and a record that can never match is worse
 * than no record: it still costs index space.
 */
function parseVerse(text) {
  const lines = text.split('\n');

  const heading = lines.find(l => l.startsWith('### '));
  if (!heading) return null;
  const ref = heading.slice(4).trim();

  // Blocks separated by blank lines. Simpler than a markdown parser and
  // sufficient, because these files are generated and uniform.
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);

  const quotes = blocks.filter(b => b.startsWith('>'));
  let original = null;
  let translit = null;

  for (const quote of quotes) {
    const cleaned = cleanQuote(quote);
    if (!cleaned.length) continue;
    if (INDIC.test(cleaned.join(''))) {
      if (!original) original = cleaned;
    } else if (!translit) {
      translit = cleaned;
    }
  }

  if (!translit || !translit.length) return null;

  // The translation is the one block that is entirely bold.
  const bold = blocks.find(b => b.startsWith('**') && b.endsWith('**'));
  const translation = bold
    ? bold.slice(2, -2).replace(/\*/g, '').replace(/\s+/g, ' ').trim()
    : '';

  return {ref, lines: translit, devanagari: original, translation};
}

/**
 * Turn "SB 7.9.24" / "CC Madhya 2.62" / "Bg 2.13" into a corpus id.
 *
 * The id has to be routable back to a shard by corpusText.shardFor without a
 * lookup table, which is why the book and the canto or lila stay in it.
 */
function idFor(book, ref) {
  const rest = ref.replace(/^(Bg\.?|SB|CC)\s*/i, '').trim();

  if (book === 'cc') {
    const m = rest.match(/^(Adi|Madhya|Antya)\s+(.+)$/i);
    if (!m) return null;
    return `cc-${m[1].toLowerCase()}-${m[2].replace(/\s+/g, '')}`;
  }

  const numbers = rest.replace(/\s+/g, '');
  if (!/^\d/.test(numbers)) return null;
  if (!isVerseNumber(numbers.split('.').pop())) return null;
  return `${book}-${numbers}`;
}

/**
 * Whether the last part of a reference is a verse number.
 *
 * Guards against the archive's non-verse entries: SB 10.1 carries a `notes`
 * file, real Sanskrit defining maha-ratha and atiratha, which parses exactly
 * like a verse and came through as "SB 10.1.notes" - a citation nobody can
 * speak, with no translation under it.
 *
 * Has to let the lettered numbers through, though. SB 4.29 really does print
 * verses as 1a, 1b, 2a and 2b, and 1a-2a is a real combined range. So the test
 * is that it starts with a digit and contains nothing but digits, an optional
 * a/b, and a range dash - which `notes` fails and `1a-2a` passes.
 */
const isVerseNumber = part =>
  /^\d+[ab]?(-\d+[ab]?)?$/.test(String(part || ''));

const displayRef = (book, ref) =>
  book === 'cc'
    ? ref.replace(/^CC\s*/i, 'CC ')
    : ref.replace(/^Bg\.?\s*/i, 'BG ').replace(/^SB\s*/i, 'SB ');

module.exports = async function loadVedabase({onProgress} = {}) {
  const root = await ensureArchive();
  const records = [];
  let done = 0;

  for (const {dir, book} of BOOKS) {
    const files = walk(path.join(root, dir));
    const total = files.length;

    for (const file of files) {
      // Colophons carry the chapter title and no verse.
      if (path.basename(file).includes('colophon')) continue;

      let parsed;
      try {
        parsed = parseVerse(fs.readFileSync(file, 'utf8'));
      } catch (err) {
        console.warn(`    ${path.basename(file)}: ${err.message}`);
        continue;
      }
      if (!parsed) continue;

      const id = idFor(book, parsed.ref);
      if (!id) continue;

      records.push({
        id,
        kind: 'verse',
        book,
        ref: displayRef(book, parsed.ref),
        title: null,
        lines: parsed.lines,
        devanagari: parsed.devanagari,
        translation: parsed.translation,
      });

      if (onProgress && ++done % 500 === 0) onProgress(done, total, `${book} ${parsed.ref}`);
    }
  }

  // The archive names a few verses twice - a combined range filed under its
  // own reference as well as under the first verse in it. Last one wins, which
  // is arbitrary but consistent; what matters is that two records with the same
  // id would make the text shard disagree with the index about which is which.
  const byId = new Map(records.map(r => [r.id, r]));
  const deduped = [...byId.values()];
  if (deduped.length !== records.length) {
    console.log(`    ${records.length - deduped.length} duplicate id(s) collapsed`);
  }

  return deduped;
};
