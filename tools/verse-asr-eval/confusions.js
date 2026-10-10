// What the model hears instead of what is sung.
//
// The phonetic rules in phonetics.js were reasoned from what a recogniser
// *ought* to confuse - aspiration, vowel length, sibilant place. That was a
// guess, and twice now a rule derived that way has been wrong. This measures it
// instead.
//
// For every transcribed bhajan whose song is in the corpus, each ten-second
// window is locally aligned against the true lyrics and every substitution is
// counted. The result is a confusion table built from real output on real
// singing, which is the only honest basis for deciding what the stream should
// throw away.
//
//   node confusions.js
//
// Alignment is Needleman-Wunsch over the best-matching region, run only where
// the window matched well enough to be the same passage - a bad alignment
// between unrelated text would fill the table with noise and look like
// evidence.

const fs = require('fs');
const path = require('path');

require('@babel/register')({
  presets: ['module:@react-native/babel-preset'],
  only: [path.join(__dirname, '..', '..', 'src', 'verses')],
  extensions: ['.js', '.jsx'],
  cache: true,
});

const {phoneticStream} = require('../../src/verses/phonetics');

const OUT = path.join(__dirname, 'out');

// Below this share of aligned characters matching, the two pieces of text are
// not the same passage and their differences are not confusions.
const MIN_IDENTITY = 0.45;

/** Every song in the corpus, by its phonetic stream. */
const corpus = () => {
  const songs = require('../../src/verses/corpus/text/songs.json');
  return Object.keys(songs).map(id => ({
    id,
    ref: songs[id].ref,
    stream: phoneticStream((songs[id].lines || []).join(' ')),
  }));
};

/** A filename to the song it is a recording of. */
const titleKey = s =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

const guessSong = (file, records) => {
  const name = titleKey(path.basename(file, '.jsonl'));
  let best = null;
  for (const record of records) {
    const key = titleKey(record.ref);
    if (key.length >= 10 && name.includes(key)) {
      if (!best || key.length > titleKey(best.ref).length) best = record;
    }
  }
  return best;
};

/**
 * Align `heard` against the best-matching region of `truth`.
 *
 * Semi-global: free gaps at the ends of `truth`, because a window is a few
 * seconds out of a whole song and should not be penalised for the rest of it.
 */
const align = (heard, truth) => {
  const n = heard.length;
  const m = truth.length;
  if (!n || !m) return null;

  const MATCH = 2;
  const MISMATCH = -1;
  const GAP = -2;

  // One row at a time would be enough for the score, but the traceback needs
  // the whole grid - these are short strings.
  const score = Array.from({length: n + 1}, () => new Int32Array(m + 1));
  for (let i = 1; i <= n; i++) score[i][0] = i * GAP;
  // Row 0 stays zero: starting anywhere in `truth` is free.

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diagonal =
        score[i - 1][j - 1] + (heard[i - 1] === truth[j - 1] ? MATCH : MISMATCH);
      const up = score[i - 1][j] + GAP;
      const left = score[i][j - 1] + GAP;
      score[i][j] = Math.max(diagonal, up, left);
    }
  }

  // Ending anywhere in `truth` is free too, so take the best cell of the last
  // row.
  let end = 0;
  for (let j = 1; j <= m; j++) if (score[n][j] > score[n][end]) end = j;

  const pairs = [];
  let i = n;
  let j = end;
  while (i > 0 && j > 0) {
    const diagonal =
      score[i - 1][j - 1] + (heard[i - 1] === truth[j - 1] ? MATCH : MISMATCH);
    if (score[i][j] === diagonal) {
      pairs.push([truth[j - 1], heard[i - 1]]);
      i--;
      j--;
    } else if (score[i][j] === score[i - 1][j] + GAP) {
      pairs.push([null, heard[i - 1]]); // the model inserted a sound
      i--;
    } else {
      pairs.push([truth[j - 1], null]); // the model dropped one
      j--;
    }
  }
  return pairs.reverse();
};

const main = () => {
  const records = corpus();
  const files = fs.existsSync(OUT)
    ? fs.readdirSync(OUT).filter(f => f.endsWith('.jsonl'))
    : [];

  const subs = new Map(); // "truth>heard" -> count
  const dropped = new Map();
  const inserted = new Map();
  let aligned = 0;
  let identified = 0;
  let same = 0;
  let total = 0;

  for (const file of files) {
    const record = guessSong(file, records);
    if (!record || record.stream.length < 40) continue;
    identified++;

    const rows = fs
      .readFileSync(path.join(OUT, file), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse);

    for (const row of rows) {
      const heard = phoneticStream(row.text || '');
      if (heard.length < 20) continue;

      const pairs = align(heard, record.stream);
      if (!pairs) continue;

      const matches = pairs.filter(([t, h]) => t !== null && t === h).length;
      if (matches / pairs.length < MIN_IDENTITY) continue;

      aligned++;
      for (const [t, h] of pairs) {
        total++;
        if (t === h) same++;
        else if (t === null) inserted.set(h, (inserted.get(h) || 0) + 1);
        else if (h === null) dropped.set(t, (dropped.get(t) || 0) + 1);
        else {
          const key = `${t}>${h}`;
          subs.set(key, (subs.get(key) || 0) + 1);
        }
      }
    }
  }

  const top = (map, n) =>
    [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

  console.log(`transcripts: ${files.length}, identified: ${identified}`);
  console.log(`windows aligned: ${aligned}`);
  console.log(
    `characters: ${total}, identical: ${same} (${((100 * same) / Math.max(1, total)).toFixed(1)}%)`,
  );

  console.log('\nmost common substitutions  (sung -> heard)');
  for (const [key, n] of top(subs, 30)) {
    console.log(`  ${key.padEnd(6)} ${String(n).padStart(5)}  ${((100 * n) / total).toFixed(2)}%`);
  }

  console.log('\nmost often dropped by the model');
  for (const [c, n] of top(dropped, 12)) console.log(`  ${c}  ${n}`);

  console.log('\nmost often inserted by the model');
  for (const [c, n] of top(inserted, 12)) console.log(`  ${c}  ${n}`);
};

main();
