// Records that are written in Sanskrit and sung in Bengali.
//
// More than half the songs in this corpus are Bengali, and so is the whole
// Caitanya-caritamrta - together about eleven thousand records. They are
// transliterated here in Sanskrit and sung in Bengali, which are different
// sounds: `vande` is sung `bonde`, `govinda` is `gobindo`, `jaya` is `joy`.
//
// Left alone that made them very nearly unfindable the moment anybody sang
// them: 24% for songs, 6.8% for the Caitanya-caritamrta, which was worse than
// silence because it came with more wrong answers than right ones.
//
// The fix has three parts and each one has a way of failing quietly, which is
// what this file is for.

import {identify} from '../src/verses/matcher';
import {neutralise, phoneticStream} from '../src/verses/phonetics';

/**
 * How a Bengali speaker sings what the corpus writes in Sanskrit.
 *
 * An approximation - real Bengali shifts some vowels and not others, by
 * position and by metre. That is exactly why the matcher flattens the
 * distinction rather than trying to predict it, and why this test can afford to
 * be crude: if matching depended on guessing these right, it would already be
 * broken.
 */
const asSung = text =>
  text
    .replace(/v/g, 'b')
    .replace(/y(?=[aāeiou])/g, 'j')
    .replace(/a/g, 'o')
    .replace(/ś|ṣ/g, 'sh');

const bengaliSongs = () => {
  const songs = require('../src/verses/corpus/text/songs.json');
  return Object.keys(songs)
    .filter(id => /bengali/i.test(songs[id].language || ''))
    .map(id => ({id, record: songs[id]}));
};

describe('flattening the difference', () => {
  it('lands both pronunciations on the same string', () => {
    // The whole idea in one assertion. Not "predicts the Bengali" - meets it.
    const sanskrit = neutralise(phoneticStream('vande govinda'));
    const bengali = neutralise(phoneticStream('bonde gobindo'));
    expect(bengali).toBe(sanskrit);
  });

  it('leaves a line with nothing to flatten alone', () => {
    // Most Sanskrit is barely touched, which is why the primary index is not
    // simply replaced by the flattened one.
    const stream = phoneticStream('dehinaḥ asmin dehe');
    expect(neutralise(stream)).toBe(stream);
  });
});

describe('finding a Bengali record from how it is sung', () => {
  it('matches songs at better than nine in ten', () => {
    const songs = bengaliSongs().slice(0, 150);
    let right = 0;
    for (const {id, record} of songs) {
      const hit = identify(asSung(record.lines.slice(0, 3).join(' ')));
      if (hit && hit.id === id) right++;
    }
    // 24% before any of this; about 97% measured across 250.
    expect(right / songs.length).toBeGreaterThan(0.9);
  });

  it('matches the Caitanya-caritamrta, which is only a couplet long', () => {
    const cc = require('../src/verses/corpus/text/cc-madhya.json');
    const ids = Object.keys(cc).slice(0, 150);
    let right = 0;
    for (const id of ids) {
      const hit = identify(asSung(cc[id].lines.join(' ')));
      if (hit && hit.id === id) right++;
    }
    // 6.8% before, and with more wrong answers than right ones. Lower than the
    // songs because a couplet gives far less to align than three sung lines.
    expect(right / ids.length).toBeGreaterThan(0.7);
  });

  it('still matches them as written', () => {
    // The flattened half is an addition, not a replacement. A Sanskrit reading
    // of a Bengali record has to keep working.
    const songs = bengaliSongs().slice(0, 100);
    let right = 0;
    for (const {id, record} of songs) {
      const hit = identify(record.lines.slice(0, 3).join(' '));
      if (hit && hit.id === id) right++;
    }
    expect(right / songs.length).toBeGreaterThan(0.9);
  });
});

describe('what the flattened half must not do', () => {
  it('is not offered to a Sanskrit query', () => {
    // The gate that took the last false match out, and the invariant it
    // protects: Sanskrit in, never a Bengali song out.
    //
    // It was found through SB 1.2.20, which cannot match itself - every one of
    // its grams is above the document-frequency cutoff, so all of them are
    // neutral, and a neutral gram can carry a run but never start one. The
    // build has always warned about the handful of records in that state. What
    // made it visible was that the flattened half then answered in its place,
    // with a song sharing not one word with it.
    const bg = require('../src/verses/corpus/text/bg.json');
    const sb = require('../src/verses/corpus/text/sb-1.json');

    let songs = 0;
    let looked = 0;
    for (const source of [bg, sb]) {
      for (const id of Object.keys(source).slice(0, 80)) {
        const hit = identify(source[id].lines.join(' '));
        looked++;
        if (hit && hit.kind === 'song') songs++;
      }
    }

    expect(looked).toBeGreaterThan(100);
    expect(songs).toBe(0);
  });

  it('does not overturn a refusal', () => {
    // The Caitanya-caritamrta quotes the Gita constantly - CC Antya 8.67-68 is
    // BG 6.16 with two words changed - so the Sanskrit pass can deadlock
    // between them and decline. That is an answer, and the Bengali pass must
    // not be allowed to break the tie from the other half of the index.
    const bg = require('../src/verses/corpus/text/bg.json')['bg-6.16'];
    const hit = identify(bg.lines.join(' '));
    expect(hit === null || hit.id === 'bg-6.16').toBe(true);
  });
});
