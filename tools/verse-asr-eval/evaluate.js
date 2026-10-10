// Does this model's output actually find verses?
//
// Takes the JSONL transcribe.py produces and runs it through the same matcher
// the app uses - not a reimplementation of it, the actual module - so whatever
// this reports is what the panel would have shown.
//
// It reconstructs the rolling window from useVerseStore rather than matching
// each chunk alone, because a single chunk is weak evidence and the store never
// judges one on its own. The difference is large: a verse straddling two chunks
// is invisible to either and obvious to the window holding both.
//
// Usage:
//   node evaluate.js out/lecture.sa.ctc.jsonl
//   node evaluate.js out/*.jsonl            # compare languages side by side
//
// Read the transcript above the verdict, not just the verdict. Three failures
// look identical from a verse count of zero and have nothing in common:
// nothing heard, nonsense heard, or something reasonable the matcher declined.

const fs = require('fs');
const path = require('path');

// The app's modules are ES modules written for React Native's preset, and this
// runs in plain Node. Transforming them on require is what lets the harness use
// the real matcher rather than a copy of it that can quietly drift.
require('@babel/register')({
  presets: ['module:@react-native/babel-preset'],
  only: [path.join(__dirname, '..', '..', 'src', 'verses')],
  // The corpus is JSON and must not go through Babel.
  extensions: ['.js', '.jsx'],
  cache: true,
});

// Straight from the app. If these drift, this harness stops measuring the
// thing it claims to measure.
const {identify, nearMisses} = require('../../src/verses/matcher');
const {phoneticStream} = require('../../src/verses/phonetics');
const {lastCitation} = require('../../src/verses/citations');

// Mirrors WINDOW_MS in useVerseStore.js.
const WINDOW_SECONDS = 25;

const clock = seconds => {
  const t = Math.max(0, Math.floor(seconds));
  const m = String(Math.floor(t / 60)).padStart(2, '0');
  return `${m}:${String(t % 60).padStart(2, '0')}`;
};

const readRows = file =>
  fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));

const evaluateFile = file => {
  const rows = readRows(file);
  if (!rows.length) {
    console.log(`${path.basename(file)}: empty`);
    return;
  }

  const minutes = rows[rows.length - 1].end / 60;
  console.log(`\n${'='.repeat(72)}`);
  console.log(`${path.basename(file)}   ${minutes.toFixed(1)} min, ${rows.length} chunks`);
  console.log('='.repeat(72));

  // Is there anything to work with at all? A model that has returned nothing,
  // or a handful of characters per chunk, is not a matcher problem.
  const chars = rows.reduce((n, r) => n + r.text.length, 0);
  const empty = rows.filter(r => !r.text.trim()).length;
  const devanagari = rows.reduce(
    (n, r) => n + (r.text.match(/[ऀ-ॿ]/g) || []).length,
    0,
  );
  console.log(
    `heard: ${chars} chars, ${Math.round(chars / rows.length)}/chunk · ` +
      `${empty} empty chunks · ${((100 * devanagari) / Math.max(1, chars)).toFixed(0)}% Devanagari`,
  );

  const window = [];
  const found = [];
  let lastId = null;
  const citations = [];

  for (const row of rows) {
    window.push(row);
    while (window.length && row.end - window[0].start > WINDOW_SECONDS) {
      window.shift();
    }
    const heard = window.map(r => r.text).join(' ');

    // The citation path is worth reporting separately. A lecturer naming a
    // verse out loud is the strongest signal the feature has, it arrives before
    // there is any Sanskrit to match, and it survives a model that cannot read
    // recitation at all - so a poor showing on verses but a good one here still
    // means a useful feature.
    const cited = lastCitation(heard);
    if (cited && cited.id !== citations[citations.length - 1]?.id) {
      citations.push({id: cited.id, at: row.start});
    }

    const hit = identify(heard);
    if (hit && hit.id !== lastId) {
      found.push({
        at: row.start,
        ref: hit.ref,
        runChars: hit.runChars,
        solid: hit.solidRatio,
      });
      lastId = hit.id;
    }
  }

  console.log(`\nverses matched: ${found.length}`);
  for (const f of found) {
    console.log(
      `  [${clock(f.at)}] ${f.ref}   ${f.runChars}ch run, ${Math.round(100 * f.solid)}% solid`,
    );
  }

  console.log(`citations heard: ${citations.length}`);
  for (const c of citations.slice(0, 15)) {
    console.log(`  [${clock(c.at)}] ${c.id}`);
  }

  // When nothing matched, how close did it get? This is the question that
  // separates "the model cannot read this" from "the thresholds are too tight",
  // and they need completely different fixes.
  if (!found.length) {
    console.log('\nnothing matched. best near-misses across the recording:');
    const best = [];
    for (let i = 0; i < rows.length; i += 3) {
      const heard = rows
        .slice(Math.max(0, i - 1), i + 2)
        .map(r => r.text)
        .join(' ');
      if (phoneticStream(heard).length < 30) continue;
      for (const c of nearMisses(heard, 1)) {
        best.push({...c, at: rows[i].start});
      }
    }
    best.sort((a, b) => b.runChars - a.runChars);
    for (const c of best.slice(0, 8)) {
      console.log(
        `  [${clock(c.at)}] ${c.ref}  ${c.runChars}ch, ${Math.round(100 * c.solidRatio)}% solid`,
      );
    }
    if (!best.length) console.log('  (nothing resembled anything in the corpus)');
  }

  // A sample of the raw text, last, so it is the thing left on screen.
  console.log('\ntranscript sample:');
  for (const row of rows.slice(0, 4)) {
    console.log(`  [${clock(row.start)}] ${row.text.slice(0, 100)}`);
  }
  const mid = Math.floor(rows.length / 2);
  for (const row of rows.slice(mid, mid + 4)) {
    console.log(`  [${clock(row.start)}] ${row.text.slice(0, 100)}`);
  }
};

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node evaluate.js <transcript.jsonl> [...]');
  process.exit(1);
}
files.forEach(evaluateFile);
