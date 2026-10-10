// Does the panel find the pranama mantras at the top of a lecture?
//
// Every threshold in the matcher was fitted to bhajan recordings, because those
// are what the eval set is made of. The pranamas are not a bhajan: they are the
// first thirty seconds of virtually every programme, they are short, and they
// are built almost entirely from the commonest words in the corpus - nama, om,
// visnu, pada, krsna - with one rare one in each prayer to say whose pranama it
// is. That is a different matching problem from a song, and the eval set had
// three windows of it.
//
// This measures both halves on one recording: whether the recitation at the top
// is named, and whether the lecture that follows is left alone. Lowering the run
// floor to catch the first would be no use if it also named a verse every time
// somebody said "Krishna" in English.
//
//   node pranama.js [out-dir]

const fs = require('fs');
const path = require('path');
require('@babel/register')({
  presets: ['module:@react-native/babel-preset'],
  only: [path.join(__dirname, '..', '..', 'src', 'verses')],
  extensions: ['.js', '.jsx'], cache: true,
});
const {identifyDetailed, nearMisses} = require('../../src/verses/matcher');
const {phoneticStream} = require('../../src/verses/phonetics');
const {applyTuning, tuning} = require('../../src/verses/tuning');
const songs = require('../../src/verses/corpus/text/songs.json');

const SEQ = 'songbook-pranamamantras';
const seqStream = phoneticStream(songs[SEQ].lines.join(' '));
const WINDOW_SECONDS = 25;

/**
 * Is this window actually pranama recitation?
 *
 * Decided from the text against the corpus, not from the matcher, so that this
 * is not the matcher marking its own homework. A window counts if a reasonable
 * share of its sound occurs literally somewhere in the sequence.
 */
const isRecitation = stream => {
  if (stream.length < 40) return false;
  let hit = 0;
  let n = 0;
  for (let i = 0; i + 9 <= stream.length; i += 4) {
    n++;
    if (seqStream.includes(stream.slice(i, i + 9))) hit++;
  }
  return n >= 5 && hit / n >= 0.3;
};

const windows = dir => {
  const out = [];
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.jsonl'))) {
    const rows = fs.readFileSync(path.join(dir, f), 'utf8')
      .split('\n').filter(Boolean).map(JSON.parse);
    const w = [];
    for (const row of rows) {
      w.push(row);
      while (w.length && row.end - w[0].start > WINDOW_SECONDS) w.shift();
      const text = w.map(r => r.text).join(' ');
      out.push({at: row.start, text, confidence: row.confidence});
    }
  }
  return out;
};

const main = () => {
  const dir = path.join(__dirname, process.argv[2] || 'out-pranama');
  const all = windows(dir);
  const recitation = all.filter(w => isRecitation(phoneticStream(w.text)));
  const speech = all.filter(w => !isRecitation(phoneticStream(w.text)));

  console.log(`${all.length} windows: ${recitation.length} of pranama recitation, ${speech.length} of everything else`);
  console.log(`recitation runs from ${Math.round(recitation[0]?.at ?? 0)}s to ${Math.round(recitation[recitation.length - 1]?.at ?? 0)}s\n`);

  const shipped = tuning();
  console.log('floor  solid | names the pranamas | names anything during the lecture');
  for (const floor of [26, 24, 22, 20, 18, 16]) {
    applyTuning({...shipped, minRunChars: floor});
    const named = recitation.filter(w => identifyDetailed(w.text).hit?.id === SEQ).length;
    const other = recitation.filter(w => {
      const h = identifyDetailed(w.text).hit;
      return h && h.id !== SEQ;
    }).length;
    const wrong = speech.filter(w => identifyDetailed(w.text).hit).length;
    console.log(
      `  ${String(floor).padStart(2)}   ${shipped.minSolidRatio.toFixed(2)} |` +
      ` ${String(named).padStart(3)}/${recitation.length} (${(100 * named / Math.max(1, recitation.length)).toFixed(0)}%)` +
      `  +${other} other |` +
      ` ${String(wrong).padStart(3)}/${speech.length} (${(100 * wrong / Math.max(1, speech.length)).toFixed(1)}%)`);
  }
  applyTuning(shipped);

  // What the recitation windows actually score, so the floor can be read
  // against something rather than guessed at.
  console.log('\nwhat the recitation windows score:');
  const runs = recitation.map(w => nearMisses(w.text, 1)[0]).filter(Boolean);
  const seqRuns = recitation
    .map(w => nearMisses(w.text, 6).find(c => c.ref === songs[SEQ].ref))
    .filter(Boolean)
    .map(c => c.runChars)
    .sort((a, b) => a - b);
  const q = (a, p) => a[Math.floor(p * (a.length - 1))] ?? 0;
  console.log(`  the sequence's run: p10 ${q(seqRuns, .1)}  p25 ${q(seqRuns, .25)}  median ${q(seqRuns, .5)}  p75 ${q(seqRuns, .75)}  max ${seqRuns[seqRuns.length - 1] ?? 0}`);
  console.log(`  (it is even a candidate in ${seqRuns.length} of ${recitation.length} recitation windows)`);
};

main();
