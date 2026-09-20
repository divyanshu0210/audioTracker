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
const {phoneticStream, grams, hashGram, GRAM_SIZE} = require('../../src/verses/phonetics');

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
  for (const group of byStream.values()) {
    if (group.length === 1) {
      indexed.push(group[0]);
      continue;
    }
    // Stable within a book, so a rebuild picks the same canonical record and
    // the committed corpus does not churn.
    const sorted = [...group].sort(
      (a, b) => PRIORITY[a.book] - PRIORITY[b.book] || a.id.localeCompare(b.id),
    );
    const [chosen, ...others] = sorted;
    chosen.alsoIn = others.map(r => r.ref);
    indexed.push(chosen);
  }
  const collapsed = records.length - indexed.length;
  if (collapsed) {
    console.log(`  ${collapsed} record(s) share their text with another and were folded into it`);
  }

  const docs = [];
  const byGram = new Map(); // hash -> doc ordinals

  indexed.forEach((record, ordinal) => {
    const stream = streamOf.get(record);
    docs.push({
      id: record.id,
      ref: record.ref,
      kind: record.kind,
      book: record.book,
      // Length of the stream, so scoring can ask what fraction of a verse was
      // heard without loading the verse.
      len: stream.length,
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
  const kept = [];
  const common = [];
  for (const entry of byGram.entries()) {
    (entry[1].length <= maxDf ? kept : common).push(entry);
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
