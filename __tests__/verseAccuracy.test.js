// How well the matcher actually does, measured rather than asserted.
//
// The numbers here are the ones that decide whether this feature is worth
// having, so they are checked rather than hoped for. Both directions matter
// and they are not equally important: a verse the panel fails to name costs
// nothing much, and a *wrong* verse sitting under the player is actively bad,
// because the person cannot tell it is wrong without already knowing the
// answer. The thresholds below are set accordingly - loose on recall, strict
// on precision.
//
// The recogniser is simulated. `degrade` does to a verse roughly what an
// English speech model does to Sanskrit - flattens aspirates, wanders on
// sibilants, and re-splits the words - and `window_` then cuts out a few
// seconds' worth and damages it further. It is a rough stand-in, so treat the
// rates as a floor to defend, not a measurement of the real world.
import {identify} from '../src/verses/matcher';
import bg from '../src/verses/corpus/text/bg.json';
import songs from '../src/verses/corpus/text/songs.json';
import sb1 from '../src/verses/corpus/text/sb-1.json';

// Crude stand-in for a speech recogniser: drop diacritics, mangle aspirates
// and sibilants the way an English model does, and re-split words at random.
const degrade = (text, rnd) => {
  let s = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  s = s.replace(/[^a-z\s]/g, ' ');
  s = s.replace(/bh/g, 'b').replace(/dh/g, 'd').replace(/th/g, 't').replace(/kh/g, 'k');
  s = s.replace(/s/g, () => (rnd() < 0.3 ? 'sh' : 's'));
  s = s.replace(/v/g, () => (rnd() < 0.3 ? 'w' : 'v'));
  // Re-split: join everything, then cut at random points.
  const joined = s.replace(/\s+/g, '');
  let out = '', i = 0;
  while (i < joined.length) { const n = 2 + Math.floor(rnd() * 5); out += joined.slice(i, i + n) + ' '; i += n; }
  return out.trim();
};

const mulberry = seed => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const evaluate = (label, corpus, take) => {
  const rnd = mulberry(42);
  const entries = Object.entries(corpus).slice(0, take);
  let right = 0, wrong = 0, missed = 0;
  const misses = [];
  for (const [id, rec] of entries) {
    const heard = degrade(rec.lines.join(' '), rnd);
    const hit = identify(heard);
    if (!hit) { missed++; if (misses.length < 3) misses.push(`MISS ${rec.ref}`); }
    else if (hit.id === id) right++;
    else { wrong++; if (misses.length < 6) misses.push(`WRONG ${rec.ref} -> ${hit.ref}`); }
  }
  const n = entries.length;
  console.log(`\n${label}  n=${n}  correct=${right} (${(100*right/n).toFixed(1)}%)  wrong=${wrong}  no-match=${missed}`);
  misses.forEach(m => console.log('   ' + m));
  return {n, right, wrong, missed};
};

// Harder: a few seconds of audio, not a whole verse, with words dropped and
// syllables corrupted the way a recogniser does under music and a PA system.
const window_ = (text, rnd, words, dropRate, corruptRate) => {
  const all = text.split(/\s+/);
  if (all.length <= words) return text;
  const at = Math.floor(rnd() * (all.length - words));
  return all
    .slice(at, at + words)
    .filter(() => rnd() > dropRate)
    .map(w => (rnd() < corruptRate ? w.slice(0, Math.max(1, w.length - 1 - Math.floor(rnd() * 2))) : w))
    .join(' ');
};

const evaluateWindow = (label, corpus, take, words, dropRate, corruptRate) => {
  const rnd = mulberry(7);
  const entries = Object.entries(corpus).slice(0, take);
  let right = 0, wrong = 0, missed = 0;
  for (const [id, rec] of entries) {
    const heard = window_(degrade(rec.lines.join(' '), rnd), rnd, words, dropRate, corruptRate);
    const hit = identify(heard);
    if (!hit) missed++;
    else if (hit.id === id) right++;
    else wrong++;
  }
  const n = entries.length;
  console.log(`${label}  words=${words} drop=${dropRate} corrupt=${corruptRate}  correct=${(100*right/n).toFixed(1)}%  wrong=${wrong}  no-match=${missed}`);
  return {n, right, wrong, missed};
};

it('names a whole recited record almost every time', () => {
  for (const [label, corpus] of [['Bhagavad-gita', bg], ['Bhagavatam c1', sb1], ['Songs       ', songs]]) {
    const {n, right, wrong} = evaluate(label, corpus, 250);
    expect(right / n).toBeGreaterThan(0.95);
    expect(wrong).toBe(0);
  }
});

it('still finds a record from a few seconds of damaged audio', () => {
  console.log('--- rolling window, degraded ---');

  // A clean window of a dozen words is the easy case, and has to be near
  // perfect.
  //
  // It was 95% before the gap penalty went into the matcher and is 93.6% after
  // - a deliberate trade, and the threshold is lowered rather than the penalty
  // softened. What the penalty bought is the whole reason the feature was
  // unusable on a device: free gaps let a run crawl through unrelated speech
  // and five percent of windows of pure Devanagari soup produced a confident
  // verse. Every window lost here is lost to no-match, never to a wrong answer
  // - the `wrong` assertions below are what actually matter, and they held at
  // zero throughout. See MISS_PENALTY in matcher.js for the measured curve.
  const clean = evaluateWindow('BG  ', bg, 250, 12, 0, 0);
  expect(clean.right / clean.n).toBeGreaterThan(0.93);
  expect(clean.wrong).toBe(0);

  // Damaged, it is not. A single window is weak evidence and recall drops a
  // long way - which is exactly why useVerseStore accumulates across windows
  // instead of trusting any one of them. A recitation lasts far longer than
  // one window, so several poor chances compound into a good one.
  //
  // What has to hold even here is the other direction: when it cannot tell,
  // it says nothing rather than guessing.
  for (const [w, d, c] of [[12, 0.15, 0.2], [8, 0.15, 0.2], [6, 0.2, 0.25]]) {
    const r = evaluateWindow('BG  ', bg, 250, w, d, c);
    expect(r.wrong / r.n).toBeLessThan(0.02);
  }
  for (const [w, d, c] of [[12, 0.15, 0.2], [8, 0.15, 0.2]]) {
    const r = evaluateWindow('Song', songs, 250, w, d, c);
    expect(r.wrong / r.n).toBeLessThan(0.02);
  }
});

// The window the matcher actually sees is twenty-five seconds of accumulated
// speech, not one sentence. That distinction hid a real bug: single sentences
// passed cleanly while a full window matched a verse every few seconds on a
// device. A long string has far more chances for a coincidental run, and the
// corpus contained English and Spanish songs whose lyrics *are* ordinary
// sentences - see tools/verse-corpus/sources/songs.js.
const LECTURE_WINDOW = [
  'so today we are going to discuss the very important question of what it means to be conscious',
  'of our actual position in this material world and how that applies when we are working every day',
  'prabhupada came to america in nineteen sixty five and he started this movement with nothing at all',
  'the question is how do we apply this understanding in our daily life when we are so busy',
  'everyone should try to understand this point very carefully because it is the basis of everything',
].join(' ');

it('stays silent through a full window of lecture English', () => {
  // The case that matters, and the one the single-sentence test below missed.
  expect(identify(LECTURE_WINDOW)).toBeNull();

  // And at every length on the way there, since the window fills gradually.
  const words = LECTURE_WINDOW.split(' ');
  for (let n = 20; n <= words.length; n += 10) {
    const heard = words.slice(0, n).join(' ');
    const hit = identify(heard);
    if (hit) console.log(`   ${n} words -> ${hit.ref} run=${hit.runChars}`);
    expect(hit).toBeNull();
  }
});

it('never names a verse during ordinary lecture English', () => {
  const prose = [
    'so we have to understand that this material world is temporary and full of miseries',
    'prabhupada came to america in nineteen sixty five with forty rupees in his pocket',
    'the question is how do we apply this in our daily life when we are working',
    'today i want to speak about the importance of chanting and hearing every day',
    'and then he said that the devotee is always thinking of how to serve better',
    'this morning we were discussing the second chapter and its practical meaning',
    'everyone please come forward and take some prasadam after the class is over',
    'the temple president announced that the festival will be held next saturday',
  ];
  const fp = prose.map(p => identify(p)).filter(Boolean);
  fp.forEach(f => console.log(`   false positive: ${f.ref} run=${f.runChars}`));
  expect(fp).toHaveLength(0);
});
