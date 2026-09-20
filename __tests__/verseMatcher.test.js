// What the matcher has to get right, and what it has to refuse.
//
// The inputs below are not the verses as written - they are deliberately
// degraded the way an English speech recogniser degrades them: aspiration
// gone, vowel length gone, retroflexion gone, and word boundaries redrawn on
// English instincts. If the matcher only works on clean transliteration it
// does not work at all, because clean transliteration is the one thing it will
// never be given at runtime.

import {phoneticStream} from '../src/verses/phonetics';
import {identify, matchHashes, MIN_RUN_CHARS} from '../src/verses/matcher';
import {grams, hashGram} from '../src/verses/phonetics';

const asrHashes = text => grams(phoneticStream(text)).map(hashGram);

describe('phoneticStream', () => {
  it('lands IAST and an English rendering of it on the same stream', () => {
    expect(phoneticStream('kṛṣṇa')).toBe(phoneticStream('krishna'));
    expect(phoneticStream('bhakti')).toBe(phoneticStream('bakti'));
    expect(phoneticStream('viṣṇu')).toBe(phoneticStream('vishnu'));
  });

  it('forgets word boundaries, so sandhi and re-splitting cannot disagree', () => {
    expect(phoneticStream('jaya rādhā-mādhava')).toBe(phoneticStream('jayaradha madhava'));
  });

  it('is empty for text with no letters in it', () => {
    expect(phoneticStream('  ...  ')).toBe('');
    expect(phoneticStream(null)).toBe('');
  });
});

describe('identify', () => {
  it('finds a verse from a recogniser-mangled recitation', () => {
    // BG 2.13, as a recogniser would report it being chanted.
    const heard =
      'day he no smin yata dehe kaumaram yovanam jara tata deha antara praptir dhiras tatra na muhyati';
    const hit = identify(heard);
    expect(hit).not.toBeNull();
    expect(hit.ref).toBe('BG 2.13');
  });

  it('finds a verse from only half a line of it', () => {
    // BG 4.7 - the part a lecturer actually quotes in passing.
    const hit = identify('yada yada hi dharmasya glanir bhavati bharata');
    expect(hit).not.toBeNull();
    expect(hit.ref).toBe('BG 4.7');
  });

  it('refuses ordinary English prose', () => {
    const heard =
      'so today we are going to discuss the very important question of what it means to be conscious of our actual position in this world';
    expect(identify(heard)).toBeNull();
  });

  it('refuses anything shorter than the run threshold', () => {
    expect(identify('krsna')).toBeNull();
    expect(identify('')).toBeNull();
  });
});

describe('matchHashes', () => {
  it('scores the right verse far above the runner-up', () => {
    const results = matchHashes(
      asrHashes('sarva dharman parityajya mam ekam saranam vraja'),
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].ref).toBe('BG 18.66');
    if (results[1]) {
      expect(results[0].runChars).toBeGreaterThan(results[1].runChars);
    }
  });

  it('returns nothing rather than a weak guess', () => {
    expect(matchHashes(asrHashes('the quick brown fox jumped over'))).toEqual([]);
  });

  it('never returns a match under the run threshold', () => {
    const results = matchHashes(asrHashes('om namo bhagavate vasudevaya krsna'));
    results.forEach(r => expect(r.runChars).toBeGreaterThanOrEqual(MIN_RUN_CHARS));
  });
});
