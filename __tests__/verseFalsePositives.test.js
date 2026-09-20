// What the matcher does when it is given nothing worth matching.
//
// This is the failure that made the feature unusable on a device, and it had no
// test until it had already shipped to a phone. A Hindi speech model listening
// to Sanskrit recitation does not politely return nothing - it returns fluent,
// confident Devanagari nonsense, at the same rate as it returns real words. So
// "what does the matcher do with soup" is not a corner case here. It is most of
// the input.
//
// The soup below is deliberately the hard kind: Devanagari, Hindi phonology,
// word-shaped. After the phonetic stream has discarded diacritics, aspiration,
// vowel length and word boundaries, it lives in the same small alphabet as the
// corpus, so it hits the index constantly. Random Latin letters would prove
// nothing.

import {identify} from '../src/verses/matcher';

const CONS = 'कखगघचछजझटठडढतथदधनपफबभमयरलवशषसह'.split('');
const VOW = ['', 'ा', 'ि', 'ी', 'ु', 'ू', 'े', 'ै', 'ो', 'ौ', 'ं'];

/** Plausible Hindi phonology, meaning nothing. Seeded, so failures repeat. */
const soup = (chars, seed) => {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let out = '';
  while (out.length < chars) {
    const syllables = Math.floor(rnd() * 4) + 2;
    let word = '';
    for (let i = 0; i < syllables; i++) {
      word += CONS[Math.floor(rnd() * CONS.length)];
      word += VOW[Math.floor(rnd() * VOW.length)];
    }
    out += word + ' ';
  }
  return out;
};

describe('recogniser nonsense', () => {
  it('names no verse, at any window length', () => {
    // Length is the axis that matters and the one the original scoring got
    // wrong. With gaps free, a run could crawl indefinitely, so the longer the
    // window the likelier a confident match - which is backwards, and meant the
    // 25-second window the panel actually uses sat at the worst end. Measured
    // before the fix: 0/40 at 120 characters rising to 2/40 at 900.
    for (const chars of [120, 300, 600, 900, 1400]) {
      const named = [];
      for (let seed = 1; seed <= 60; seed++) {
        const hit = identify(soup(chars, seed));
        if (hit) named.push(`${chars}ch seed ${seed} -> ${hit.ref} (${hit.runChars}ch run)`);
      }
      expect(named).toEqual([]);
    }
  });

  it('still hears a verse buried in it', () => {
    // The other half, and the reason this cannot be fixed by simply demanding
    // a denser match. A verse recited in the middle of a lecture arrives
    // surrounded by exactly this - so the alignment has to end at the edges of
    // the verse rather than wandering out into the noise on either side.
    const bg = require('../src/verses/corpus/text/bg.json');
    const verse = bg['bg-2.13'].lines.join(' ');

    const hit = identify(`${soup(300, 3)} ${verse} ${soup(300, 9)}`);
    expect(hit).toBeTruthy();
    expect(hit.id).toBe('bg-2.13');

    // And the run it reports is the verse, not the verse plus its surroundings.
    // Under the old scoring this came back spanning 315 characters of stream to
    // collect 56 - a number that made the run length meaningless as evidence.
    expect(hit.runChars).toBeLessThan(verse.length * 1.2);
  });
});
