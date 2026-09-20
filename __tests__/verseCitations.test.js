// The citation parser reads the sentence a lecturer says *before* reciting -
// which is the moment the phonetic matcher has nothing to work with yet.

import {findCitations, lastCitation} from '../src/verses/citations';
import {lookup, shardFor, shardNames, knownShards} from '../src/verses/corpusText';

describe('findCitations', () => {
  it('reads a spoken Gita citation', () => {
    expect(lastCitation('bhagavad gita chapter four text seven').id).toBe('bg-4.7');
    expect(lastCitation('in the bhagavad gita chapter two verse thirteen').id).toBe('bg-2.13');
  });

  it('reads a spoken Bhagavatam citation', () => {
    expect(lastCitation('srimad bhagavatam canto one chapter two text six').id).toBe('sb-1.2.6');
    expect(lastCitation('bhagavatam canto seven chapter nine text twenty eight').id).toBe('sb-7.9.28');
  });

  it('reads a spoken Caitanya-caritamrta citation', () => {
    expect(lastCitation('caitanya caritamrta madhya lila chapter two text sixty two').id)
      .toBe('cc-madhya-2.62');
    expect(lastCitation('chaitanya charitamrita adi lila chapter one text one').id)
      .toBe('cc-adi-1.1');
    expect(lastCitation('caitanya caritamrta antya 4 43').id).toBe('cc-antya-4.43');
  });

  it('refuses a Caitanya-caritamrta citation with no lila named', () => {
    // Madhya 2.62 and Adi 2.62 are different verses, and nothing in
    // "caritamrta chapter two text sixty two" says which.
    expect(lastCitation('caitanya caritamrta chapter two text sixty two')).toBeNull();
  });

  it('reads digits as readily as words, since a recogniser mixes them', () => {
    expect(lastCitation('bhagavad gita chapter 18 text 66').id).toBe('bg-18.66');
    expect(lastCitation('gita 9 26').id).toBe('bg-9.26');
  });

  it('handles compound numbers', () => {
    expect(lastCitation('bhagavad gita chapter one text forty seven').id).toBe('bg-1.47');
    expect(lastCitation('bhagavad gita chapter eleven text one hundred and eight')).toBeTruthy();
  });

  it('takes the last citation when several are spoken', () => {
    const text = 'we read bhagavad gita chapter two text twelve and then chapter four text eight';
    expect(findCitations(text).length).toBeGreaterThanOrEqual(1);
    expect(lastCitation(text).book).toBe('bg');
  });

  it('says nothing about a sentence with no citation in it', () => {
    expect(lastCitation('so today we are discussing the nature of the soul')).toBeNull();
    expect(lastCitation('chapter four text seven')).toBeNull(); // no book named
    expect(lastCitation('')).toBeNull();
  });

  it('produces ids the corpus can actually resolve', () => {
    expect(lookup(lastCitation('bhagavad gita chapter four text seven').id).ref).toBe('BG 4.7');
    expect(lookup(lastCitation('srimad bhagavatam canto one chapter one text one').id).ref).toBe('SB 1.1.1');
  });

  it('resolves a verse that the edition prints inside a combined range', () => {
    // BG 1.17 is not an id in the corpus - the edition translates 1.16 to 1.18
    // as one unit - but a lecturer citing it still has to land somewhere.
    const cited = lastCitation('bhagavad gita chapter one text seventeen');
    expect(cited.id).toBe('bg-1.17');
    const record = lookup(cited.id);
    expect(record).not.toBeNull();
    expect(record.ref).toBe('BG 1.16-18');
  });

  it('returns an id for a verse that does not exist, and lookup refuses it', () => {
    // A misheard number is discarded by failing to resolve, not by guessing.
    expect(lookup('bg-99.99')).toBeNull();
  });
});

describe('corpusText', () => {
  it('routes every id to the right shard', () => {
    expect(shardFor('bg-2.13')).toBe('bg');
    expect(shardFor('sb-7.9.28')).toBe('sb-7');
    expect(shardFor('sb-10.13.2')).toBe('sb-10');
    expect(shardFor('sb-11.5.32')).toBe('sb-11');
    expect(shardFor('sb-12.13.23')).toBe('sb-12');
    expect(shardFor('cc-madhya-2.62')).toBe('cc-madhya');
    expect(shardFor('cc-adi-1.1')).toBe('cc-adi');
    expect(shardFor('cc-antya-4.43')).toBe('cc-antya');
    expect(shardFor('song-gopinath1')).toBe('songs');
    expect(shardFor(null)).toBeNull();
  });

  it('knows about every shard the build produced', () => {
    // Metro cannot build the require map at runtime, so a shard added to the
    // corpus without being added to corpusText.js would be silently
    // unreachable - every verse in it matching and then failing to display.
    expect(knownShards().sort()).toEqual(shardNames().sort());
  });

  it('resolves a verse by the citation of a work that quotes it', () => {
    // The Caitanya-caritamrta quotes BG 18.66 three times. Only one of the
    // four is indexed, but all four are still addressable by name.
    expect(lookup('cc-madhya-8.63').ref).toBe('CC Madhya 8.63');
    expect(lookup('bg-18.66').ref).toBe('BG 18.66');
  });

  it('tells a verse where else it appears', () => {
    // What the panel shows instead of going silent over a four-way tie.
    const verse = lookup('bg-18.66');
    expect(verse.alsoIn).toEqual(expect.arrayContaining(['CC Madhya 8.63']));
  });

  it('covers the Bhagavatam past where Prabhupada stopped writing', () => {
    // He completed through SB 10.13.64. Canto eleven holds the Uddhava-gita
    // and gets lectured on constantly, so a corpus that stopped at the
    // archive's edge would go quiet through a lot of real material.
    expect(lookup('sb-11.5.32')).not.toBeNull();
    expect(lookup('sb-12.13.23')).not.toBeNull();
    expect(lookup('sb-10.90.50')).not.toBeNull();
  });

  it('names the translator only where it is not Prabhupada', () => {
    // The Sanskrit is nobody's translation, but the English after 10.13.64 is
    // his disciples' work and must not read as his.
    expect(lookup('sb-10.13.64').translator).toBeUndefined();
    expect(lookup('bg-2.13').translator).toBeUndefined();
    expect(lookup('sb-10.14.1').translator).toMatch(/disciples/);
    expect(lookup('sb-11.5.32').translator).toMatch(/disciples/);
  });

  it('resolves a spoken citation from the completed cantos', () => {
    const cited = lastCitation('srimad bhagavatam canto eleven chapter five text thirty two');
    expect(cited.id).toBe('sb-11.5.32');
    expect(lookup(cited.id).ref).toBe('SB 11.5.32');
  });

  it('returns a full record, not just a reference', () => {
    const verse = lookup('bg-2.13');
    expect(verse.ref).toBe('BG 2.13');
    expect(verse.lines.length).toBeGreaterThan(0);
    expect(verse.translation).toBeTruthy();
  });
});
