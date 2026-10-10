// Does the panel find the song, on real recordings?
//
// Every number this feature was tuned by until now came from text put through a
// regex - a simulated recogniser, or synthetic Devanagari soup. This is the
// first measurement made of the thing itself: forty-six bhajans, transcribed by
// the model that ships, matched by the matcher that ships, against a corpus
// whose right answer is known from the filename.
//
// It reports three numbers and the third is the one that matters most:
//
//   found     the correct song was named at some point
//   wrong     some other record was named
//   quiet     nothing was named at all
//
// A wrong answer is worse than silence here. The person cannot tell a wrong
// verse from a right one without already knowing which it is, so a change that
// turns `quiet` into `found` is a gain and one that turns `quiet` into `wrong`
// is a loss, even if the found count rises.
//
//   node bench.js

const fs = require('fs');
const path = require('path');

require('@babel/register')({
  presets: ['module:@react-native/babel-preset'],
  only: [path.join(__dirname, '..', '..', 'src', 'verses')],
  extensions: ['.js', '.jsx'],
  cache: true,
});

const {identify} = require('../../src/verses/matcher');
const {lookup} = require('../../src/verses/corpusText');

const OUT = path.join(__dirname, 'out');

// Mirrors WINDOW_MS in useVerseStore.js: the matcher never sees one window, it
// sees everything heard in the last twenty-five seconds.
const WINDOW_SECONDS = 25;

const key = s =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

const main = () => {
  const songs = require('../../src/verses/corpus/text/songs.json');
  const refs = Object.keys(songs)
    .map(id => ({id, ref: songs[id].ref, k: key(songs[id].ref)}))
    .filter(r => r.k.length >= 10);

  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.jsonl'));

  let found = 0;
  let wrong = 0;
  let quiet = 0;
  const misses = [];
  const wrongs = [];

  for (const file of files) {
    const name = key(path.basename(file, '.jsonl'));
    // Longest matching title wins, so "Jaya Radha Madhava" is not beaten by a
    // shorter title that happens to be a substring of it.
    let truth = null;
    for (const r of refs) {
      if (name.includes(r.k) && (!truth || r.k.length > truth.k.length)) truth = r;
    }
    if (!truth) continue;

    // Every record that is this same song, not just the one whose title is
    // longest. kksongs and the song book both carry many of these, and where
    // their text differs enough to survive the builder's fold, the corpus holds
    // two records for one song. Naming either is right, and demanding a
    // particular id scored several correct answers as failures.
    // Containment either way, not equality. The two sources also disagree
    // about how much of a refrain belongs in the title - "Jaya Radha Madhava"
    // against "Jaya Radha Madhava Radha Madhava" - and those are one song.
    const acceptable = new Set(
      refs
        .filter(r => r.k.includes(truth.k) || truth.k.includes(r.k))
        .map(r => r.id),
    );

    const rows = fs
      .readFileSync(path.join(OUT, file), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse);

    const window = [];
    const named = new Set();
    for (const row of rows) {
      window.push(row);
      while (window.length && row.end - window[0].start > WINDOW_SECONDS) {
        window.shift();
      }
      const hit = identify(window.map(r => r.text).join(' '));
      // Named *and* displayable. The store commits only if the text resolves,
      // and for a while it silently could not for a whole source - so a bench
      // that asked only whether the matcher found something reported songs as
      // found that the panel could never have shown.
      if (hit && lookup(hit.id)) named.add(hit.id);
    }

    if ([...acceptable].some(id => named.has(id))) {
      found++;
      // Counted as found even if something else was also named: the store
      // commits on corroboration, so a single stray window is not what the
      // person sees.
    } else if (named.size) {
      wrong++;
      wrongs.push(`${truth.ref} -> ${[...named].slice(0, 2).join(', ')}`);
    } else {
      quiet++;
      misses.push(truth.ref);
    }
  }

  const n = found + wrong + quiet;
  console.log(`recordings with a known answer: ${n}`);
  console.log(`  found  ${String(found).padStart(3)}  ${((100 * found) / n).toFixed(1)}%`);
  console.log(`  wrong  ${String(wrong).padStart(3)}  ${((100 * wrong) / n).toFixed(1)}%`);
  console.log(`  quiet  ${String(quiet).padStart(3)}  ${((100 * quiet) / n).toFixed(1)}%`);

  if (wrongs.length) {
    console.log('\nnamed something else:');
    wrongs.slice(0, 8).forEach(w => console.log(`  ${w}`));
  }
  if (misses.length) {
    console.log('\nnamed nothing:');
    misses.slice(0, 8).forEach(m => console.log(`  ${m}`));
  }
};

main();
