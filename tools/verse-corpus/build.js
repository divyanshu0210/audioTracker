#!/usr/bin/env node
//
// Builds the verse corpus the app ships with.
//
//   node tools/verse-corpus/build.js                  # everything
//   node tools/verse-corpus/build.js --only=songs
//   node tools/verse-corpus/build.js --max-df=40
//
// Two kinds of output, because the two have opposite constraints:
//
//   corpus/index.json   what the matcher searches. Every posting for every
//                       verse, so it has to be small - it is loaded whole,
//                       once, and held in memory for as long as the player is
//                       open. Carries no readable text at all.
//
//   corpus/text/*.json  what the panel displays. Loaded one shard at a time
//                       and only for a verse that actually matched, so it can
//                       afford to be large and is sharded by book.
//
// The split is the reason a twenty-thousand-verse corpus fits on a phone: the
// expensive part (translations, Devanagari, word-for-word) is never in memory
// unless something matched, and the part that is always in memory is integers.

const fs = require('fs');
const path = require('path');

// The app's own modules are ESM. Reading the same phonetic rules the device
// will use is the entire point - an index built under different rules than it
// is queried with matches nothing - so they are imported rather than copied.
// A directory rather than a pattern. The pattern this used to be matched a
// forward slash only, so on Windows - where the filename babel tests is
// backslashed - it quietly matched nothing. That stayed invisible for as long
// as phonetics.js had no imports of its own, and surfaced the moment it gained
// one, as the app's ESM failing to resolve rather than as a filter problem.
require('@babel/register')({
  presets: [['@babel/preset-env', {targets: {node: 'current'}}]],
  only: [path.join(__dirname, '..', '..', 'src', 'verses')],
});
const {phoneticStream, grams, hashGram, neutralise, GRAM_SIZE} = require('../../src/verses/phonetics');

// How much of a record has to change before a flattened copy is worth indexing.
//
// Zero, now that the flattened copies live in their own half of the index and
// are only ever searched by a flattened query. While they shared the index with
// the originals a near-duplicate was harmful - shorter after its doubles
// collapse, so higher coverage for the same run, letting a wrong record's copy
// outscore a right record's original - and this was raised to 0.08 to suppress
// them. That cost more than it saved: it left two thirds of the
// Caitanya-caritamrta with no flattened form at all, so a sung query had
// nothing to find.
const MIN_SHIFT = 0;

/** Whether a record is sung or recited in Bengali rather than Sanskrit. */
const isBengali = record =>
  record.book === 'cc' || /bengali/i.test(record.language || '');

/**
 * A flattened copy of a record, when there is enough shift to be worth one.
 *
 * Returns nothing for a line that Bengali pronounces much as it is written,
 * which is a great many of the short ones. See MIN_SHIFT.
 */
const alternate = (record, stream) => {
  const shifted = (stream.match(/[ovy]/g) || []).length;
  if (!stream.length || shifted / stream.length < MIN_SHIFT) return [];

  const flat = neutralise(stream);
  return flat && flat !== stream ? [{record, stream: flat}] : [];
};


const OUT_DIR = path.join(__dirname, '..', '..', 'src', 'verses', 'corpus');
const TEXT_DIR = path.join(OUT_DIR, 'text');

const SOURCES = {
  // The three scriptures, from one archive rather than a scrape per book -
  // see sources/vedabase.js for why that is the polite route as well as the
  // fast one.
  vedabase: require('./sources/vedabase'),
  // The rest of the Bhagavatam - canto ten from chapter fourteen on, and
  // cantos eleven and twelve - which Prabhupada did not live to write and the
  // archive above therefore does not carry. Marked with its translators.
  sbCompletion: require('./sources/sbCompletion'),
  songs: require('./sources/songs'),
  // The curated set, and the one that decides whether a bhajan is found at
  // all - see sources/songbook.js. Listed after kksongs so that where the two
  // carry the same song, the indexer's duplicate collapse keeps one of them
  // and records the other as an alias rather than indexing both.
  songbook: require('./sources/songbook'),
};

// A gram in more than this many verses is not evidence of anything. Sanskrit
// is formulaic and these are long texts: sequences like `krsna` or `bagavan`
// sit in thousands of verses, and every one of them would be dragged into the
// candidate set on every query, for nothing. Dropping them cuts the index hard
// and makes matching *more* accurate, not less - what is left is the rare
// material that actually identifies a verse.
const DEFAULT_MAX_DF = 60;

// kksongs files a number of pages under "songs" that are nothing of the kind:
// whole Gita chapters, long stretches of Caitanya-caritamrta, verse
// compilations running to eight hundred lines. They are real pages, but they
// are not what anyone sings, and every verse inside them is already in the
// corpus under its own citation - so all they contribute is a second record
// that matches whenever the first one does.
//
// The cap is on the sung text, not the page: the longest thing actually sung
// as a song runs to a few hundred characters, and a `song` ten times that is a
// scrape of something else.
const MAX_SONG_CHARS = 3000;

/**
 * Which display shard a record belongs in.
 *
 * Has to agree exactly with corpusText.shardFor on the device, which derives
 * the same answer from the id alone. A test compares the shards written here
 * against the require map there, because a shard the app does not know about
 * is unreachable - every verse in it matching, and then failing to display.
 *
 * The big books are split further than by book: a whole Bhagavatam of display
 * text is far too much to hold in memory for one matched verse, and a lecture
 * that quotes one canto tends to stay in it.
 */
const shardFor = record => {
  if (record.book === 'sb') return `sb-${record.id.slice(3).split('.')[0]}`;
  if (record.book === 'cc') return `cc-${record.id.split('-')[1]}`;
  return record.book;
};

const arg = (name, fallback) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const progress = (done, total, label) => {
  if (done % 25 === 0 || done === total) {
    process.stdout.write(`\r    ${done}/${total}  ${String(label).slice(0, 48).padEnd(48)}`);
    if (done === total) process.stdout.write('\n');
  }
};

/** Int32Array to base64, which is how it travels inside JSON. */
const packInts = values => {
  const arr = new Int32Array(values);
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
};

async function main() {
  const only = arg('only', Object.keys(SOURCES).join(',')).split(',').map(s => s.trim());
  const maxDf = Number(arg('max-df', DEFAULT_MAX_DF));

  fs.mkdirSync(TEXT_DIR, {recursive: true});

  const records = [];
  for (const name of only) {
    const load = SOURCES[name];
    if (!load) {
      console.error(`unknown source: ${name} (have ${Object.keys(SOURCES).join(', ')})`);
      process.exit(1);
    }
    console.log(`\n  ${name}...`);
    let loaded = await load({onProgress: progress});

    if (name === 'songs') {
      const before = loaded.length;
      loaded = loaded.filter(r => r.lines.join(' ').length <= MAX_SONG_CHARS);
      const dropped = before - loaded.length;
      if (dropped) {
        console.log(`    ${dropped} over ${MAX_SONG_CHARS} chars dropped as compilations`);
      }
    }

    console.log(`    ${loaded.length} records`);
    records.push(...loaded);
  }

  // The same song from two sources is one song.
  //
  // kksongs and the song book overlap heavily, and their transliterations
  // differ just enough that the indexer's exact-text fold does not catch them -
  // `sri` against `sri`, a hyphen moved, an extra stanza. Left in, the two sit
  // in the index scoring almost identically, and the ambiguity gate then
  // refuses to name either. Measured: whole-song accuracy fell from 98.8% to
  // 88.8%, entirely into no-match, by *adding* songs.
  //
  // The book wins where both have a song. It is the curated text, it is what
  // the temple actually sings, and its stanza numbering is the one a congregation
  // follows.
  // Keyed on how the song *sounds*, not on what it is called.
  //
  // Titles were tried first and caught only 68 of them: the two sources spell
  // the same song differently - "(Ami) Jamuna Puline" against "Ami Jamuna
  // Puline", a hyphen moved, a diacritic dropped - and an exact title match
  // misses every one of those. The phonetic stream already discards precisely
  // those differences, which makes its opening a far better identity than the
  // name: two records that begin with the same forty characters of sound are
  // the same song, whatever either source chose to call it.
  const songKey = record => phoneticStream(record.lines.join(' ')).slice(0, 40);

  // One line's sound, for comparing records line by line. Short lines are
  // dropped by the caller: a handful of characters is shared by too much to
  // mean two records are the same thing.
  const lineKey = line => {
    const stream = phoneticStream(line);
    return stream.length >= 12 ? stream : '';
  };

  // Matched on sound *or* on name. The stream catches the same song spelled
  // differently; the title catches the same song recorded at different lengths,
  // where the openings diverge before forty characters and the streams never
  // meet - which is how three records for Jaya Radha Madhava survived.
  const titleKey = ref =>
    (ref || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

  const bookStreams = new Set(
    records
      .filter(r => r.id.startsWith('songbook-'))
      .map(songKey)
      .filter(k => k.length >= 40),
  );
  const bookTitles = new Set(
    records
      .filter(r => r.id.startsWith('songbook-') && (r.translation || '').length > 40)
      .map(r => titleKey(r.ref))
      .filter(Boolean),
  );

  // Only a book record that *has* a translation may supersede one, so the
  // curated lyrics never arrive at the cost of losing the meaning.
  const fromBook = {
    has: record => bookStreams.has(songKey(record)) || bookTitles.has(titleKey(record.ref)),
  };
  // A record that is a handful of lines out of the book's pranama sequence is
  // a fragment of it, not a song of its own.
  //
  // kksongs carries one: three lines called "ISKCON Pranamas", of which the
  // first is the heading `Sri Guru Pranama` kept as though it were sung and the
  // other two are the first mantra. It is the whole sequence's worth of ground
  // covered one seventeenth of the way, and because it is short and its text is
  // the most recited Sanskrit there is, it beat the full sequence whenever that
  // mantra was recited on its own - which is exactly the splitting that joining
  // the prayers was meant to end.
  //
  // Compared line by line rather than as one string, because that stray heading
  // sits in the middle of its text and defeats any substring test. Measured
  // over the whole corpus, this folds that record and nothing else at any
  // threshold from a half upwards; two thirds already folds nothing, since the
  // one record it should catch is two lines out of three.
  const sequences = records
    .filter(r => r.sections && r.lines)
    .map(r => new Set(r.lines.map(lineKey).filter(Boolean)));

  const fragmentOfSequence = record => {
    const lines = (record.lines || []).map(lineKey).filter(Boolean);
    if (!lines.length) return false;
    return sequences.some(
      seq => lines.filter(l => seq.has(l)).length / lines.length >= 0.6,
    );
  };

  const beforeDedupe = records.length;
  const deduped = records.filter(
    r =>
      r.kind !== 'song' ||
      (r.id.startsWith('songbook-')
        ? false
        : fromBook.has(r) || fragmentOfSequence(r)) === false,
  );
  if (deduped.length !== beforeDedupe) {
    console.log(
      `
  ${beforeDedupe - deduped.length} song(s) superseded by the song book's text`,
    );
  }
  records.length = 0;
  records.push(...deduped);

  if (!records.length) {
    console.error('nothing loaded; refusing to overwrite the corpus with an empty one');
    process.exit(1);
  }

  // --- the searchable side -------------------------------------------------
  //
  // One stream per record, from its lines only. Translations are deliberately
  // not indexed: they are English prose about the verse, not the sounds of it,
  // and indexing them would let an English sentence in the lecture match a
  // verse nobody recited.
  console.log('\n  indexing...');

  // Records whose text is character-for-character the same after
  // phoneticisation are not competing answers - they are one verse with
  // several citations. The Caitanya-caritamrta quotes the Gita and the
  // Bhagavatam constantly: BG 18.66 appears verbatim at CC Madhya 8.63, 9.265
  // and 22.94, and those four are indistinguishable from the sound of someone
  // reciting it, because they *are* the same recitation.
  //
  // Indexing all four made the matcher see a four-way tie, call it ambiguous
  // and show nothing - the worst outcome available, since the verse was
  // perfectly clear. So one of each group is indexed and the rest become
  // `alsoIn` on it, which is a better answer than any of them alone: the panel
  // can say the verse and where else it is found.
  //
  // All of them stay in the text shards regardless, because a lecturer citing
  // CC Madhya 8.63 by name must still resolve to something.
  const streamOf = new Map(); // record -> stream
  const byStream = new Map(); // stream -> records sharing it

  // Which book wins when the same text is in several: the original before the
  // work that quotes it.
  const PRIORITY = {bg: 0, sb: 1, cc: 2, songs: 3};

  for (const record of records) {
    const stream = phoneticStream(record.lines.join(' '));
    streamOf.set(record, stream);
    // A record with no phonetic content at all cannot be indexed and cannot
    // collide with anything; it still belongs in the text shards.
    if (!stream) continue;

    const group = byStream.get(stream);
    if (group) group.push(record);
    else byStream.set(stream, [record]);
  }

  const indexed = [];
  const chosenOf = new Map(); // stream -> the record that represents it
  for (const [stream, group] of byStream) {
    if (group.length === 1) {
      indexed.push(group[0]);
      chosenOf.set(stream, group[0]);
      continue;
    }
    // Stable within a book, so a rebuild picks the same canonical record and
    // the committed corpus does not churn.
    const sorted = [...group].sort(
      (a, b) => PRIORITY[a.book] - PRIORITY[b.book] || a.id.localeCompare(b.id),
    );
    const [chosen, ...others] = sorted;
    chosen.alsoIn = others.map(r => r.ref);
    chosenOf.set(stream, chosen);
    indexed.push(chosen);
  }

  // A prayer inside a sequence is often also scripture under its own citation.
  //
  // Five of the pranama mantras are verses of Caitanya-caritamrta, and while
  // each was a record of its own the fold above noticed and said so. Joining
  // the prayers into one record broke that: the sequence is fifty lines and
  // matches no single verse, so five verses quietly lost the note saying where
  // else they are found.
  //
  // That note is how somebody reciting the Panca-tattva pranama, who is shown
  // CC Adi 1.14 because it is the better answer - a real citation, with a
  // purport - finds out that it is also the sequence they are part way through.
  for (const record of records) {
    if (!record.sections) continue;
    record.sections.forEach((section, i) => {
      const to = record.sections[i + 1]?.at ?? record.lines.length;
      const chosen = chosenOf.get(
        phoneticStream(record.lines.slice(section.at, to).join(' ')),
      );
      if (!chosen || chosen === record) return;
      chosen.alsoIn = [...new Set([...(chosen.alsoIn || []), record.ref])];
    });
  }
  const collapsed = records.length - indexed.length;
  if (collapsed) {
    console.log(`  ${collapsed} record(s) share their text with another and were folded into it`);
  }

  const docs = [];
  const byGram = new Map(); // hash -> doc ordinals

  // Most records are indexed once. The Bengali ones are indexed twice: as
  // written, and as sung.
  //
  // More than half the songs here are Bengali - 512 of 900 - and so is the
  // whole Caitanya-caritamrta. They are written in Sanskrit transliteration and
  // sung in Bengali, which are different sounds: `vande` is sung `bonde`,
  // `govinda` is `gobindo`, `jaya` is `joy`. Measured on the corpus's own
  // lyrics, applying that shift dropped matching from 97.6% to 24.0% - nearly
  // every Bengali song became unfindable the moment somebody sang it.
  //
  // Collapsing the difference in phonetics.js fixes the songs and costs the
  // verses: merging a with o and v with b shrank the alphabet by a third and
  // took Bhagavad-gita accuracy from 99.2% to 93.6%. The problem is specific to
  // one language, so the fix is too. A second entry costs one document and its
  // grams, and leaves every Sanskrit record exactly as it was.
  // Primaries first, then every alternate. The order is load-bearing: it lets
  // the matcher tell one kind from the other by ordinal alone, so a Sanskrit
  // query can ignore the flattened half of the index without a lookup per
  // posting.
  //
  // They have to be ignorable. Left visible to every query, four thousand extra
  // documents in a coarser alphabet are four thousand extra chances for
  // Devanagari soup to find something - measured, they put verses back on
  // screen for pure nonsense, which is the failure this matcher was rebuilt to
  // stop.
  const primaries = indexed.map(record => ({record, stream: streamOf.get(record)}));
  const alternates = [];
  for (const record of indexed) {
    if (isBengali(record)) {
      alternates.push(...alternate(record, streamOf.get(record)));
    }
  }
  const forms = [...primaries, ...alternates];

  if (alternates.length) {
    console.log(
      `  ${alternates.length} record(s) also indexed flattened, for Bengali`,
    );
  }

  forms.forEach(({record, stream}, ordinal) => {
    docs.push({
      id: record.id,
      ref: record.ref,
      kind: record.kind,
      book: record.book,
      // Length of the stream, so scoring can ask what fraction of a verse was
      // heard without loading the verse.
      len: stream.length,
      // Not scored against the length of one prayer, for a record that is a
      // sequence of them.
      //
      // Tried, and it is worse. Coverage is what separates a verse from a
      // compilation that quotes it, and joining seventeen prayers into one
      // record does put that mechanism on the wrong side of what it protects:
      // reciting the Prabhupada pranati is reciting a whole prayer, and it
      // scores as two percent of a compilation. Measuring against a typical
      // prayer instead raises the sequence's score, which is the intended
      // effect and the wrong outcome - five of these prayers are also verses
      // of Caitanya-caritamrta, and lifting the sequence brings it level with
      // them. Level is a tie, and a tie shows nothing at all.
      //
      // Measured: prayers recited alone that named anything fell from 16 of 17
      // to 11. The sequence being the quieter answer is what lets the verse be
      // the loud one.
    });

    // De-duplicated per document: a gram appearing twice in one verse is one
    // fact about that verse, and the posting list only answers "is it in".
    const seen = new Set();
    for (const gram of grams(stream)) {
      if (seen.has(gram)) continue;
      seen.add(gram);
      const hash = hashGram(gram);
      const list = byGram.get(hash);
      if (list) list.push(ordinal);
      else byGram.set(hash, [ordinal]);
    }
  });

  const totalPostings = [...byGram.values()].reduce((n, l) => n + l.length, 0);


  // Sorted by hash so the device can binary-search a flat array instead of
  // building a Map of half a million entries at startup.
  // "Too common" is judged on the records as written, not on the flattened
  // copies as well.
  //
  // The two halves of the index are two readings of the same corpus, so a gram
  // appearing in both is one fact about one record counted twice. Counting them
  // together inflated every frequency, pushed 2,700 more grams over the
  // threshold into the neutral bucket, and quietly weakened discrimination for
  // every query in the corpus - including Sanskrit ones that never touch the
  // flattened half. That is what put verses back on screen for nonsense and
  // took a point off the Bhagavad-gita: not the alternates being matched, but
  // the alternates being counted.
  const kept = [];
  const common = [];
  for (const entry of byGram.entries()) {
    const df = entry[1].reduce((n, ordinal) => n + (ordinal < primaries.length ? 1 : 0), 0);
    (df <= maxDf ? kept : common).push(entry);
  }
  kept.sort((a, b) => a[0] - b[0]);
  common.sort((a, b) => a[0] - b[0]);

  const hashes = [];
  const starts = [];
  const postings = [];
  for (const [hash, list] of kept) {
    hashes.push(hash | 0);
    starts.push(postings.length);
    postings.push(...list);
  }
  starts.push(postings.length); // one past the end, so every range is a pair

  const index = {
    version: 1,
    gramSize: GRAM_SIZE,
    // Ordinals below this are records as written; at or above it they are the
    // flattened copies. See the note where `forms` is built.
    primaryCount: primaries.length,
    builtAt: new Date().toISOString(),
    maxDf,
    docs,
    // The grams that were dropped for being everywhere, kept as bare hashes.
    //
    // Not searchable and not evidence - but the matcher has to be able to tell
    // "this gram is in so many verses it says nothing" from "this gram is in
    // no verse at all". The first should leave a run of matches intact as it
    // passes through; the second is a genuine mismatch and has to break it.
    // Without this list both look identical from the device, every common
    // syllable severs the run it sits in, and nothing ever clears the
    // threshold. A few thousand integers to avoid that is a bargain.
    common: packInts(common.map(([hash]) => hash | 0)),
    hashes: packInts(hashes),
    starts: packInts(starts),
    postings: packInts(postings),
  };

  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index));

  // --- the readable side ---------------------------------------------------
  const shards = new Map();
  for (const record of records) {
    const shard = shardFor(record);
    if (!shards.has(shard)) shards.set(shard, {});
    const {book, ...rest} = record;
    shards.get(shard)[record.id] = rest;
  }

  const manifest = {};
  for (const [shard, contents] of shards) {
    const file = path.join(TEXT_DIR, `${shard}.json`);
    fs.writeFileSync(file, JSON.stringify(contents));
    manifest[shard] = {count: Object.keys(contents).length, bytes: fs.statSync(file).size};
  }
  fs.writeFileSync(path.join(TEXT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // --- report --------------------------------------------------------------
  const kb = n => `${(n / 1024).toFixed(0)} KB`;
  console.log(`
  records      ${records.length} (${indexed.length} indexed)
  grams        ${byGram.size} distinct, ${totalPostings} postings
  kept         ${kept.length} grams (df <= ${maxDf}), ${postings.length} postings
  dropped      ${common.length} grams as too common (kept as neutral)
  index.json   ${kb(fs.statSync(path.join(OUT_DIR, 'index.json')).size)}
  text shards  ${shards.size}, ${kb(Object.values(manifest).reduce((n, s) => n + s.bytes, 0))} total
`);

  const reachable = new Set(postings);
  const orphans = docs.filter((_, i) => !reachable.has(i)).length;
  if (orphans) {
    console.warn(`  ${orphans} record(s) have no indexable gram left - they can never match.`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
