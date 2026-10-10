// The Hindi model returns Devanagari, and everything downstream reads Latin
// letters.
//
// That single fact is what this file exists for. Vosk's Hindi model has a
// Devanagari lexicon, so a verse it recognises comes back as `देहिनोऽस्मिन्`
// rather than a romanisation - and phoneticStream strips everything outside
// a-z. Without transliteration, every Hindi result became an empty string, the
// whole Hindi path matched nothing at all, and nothing anywhere reported a
// fault. These are the tests that would have caught it.

import {devanagariToLatin, hasDevanagari} from '../src/verses/devanagari';
import {phoneticStream} from '../src/verses/phonetics';
import {identify} from '../src/verses/matcher';
import {lastCitation} from '../src/verses/citations';
import {citationKey} from '../src/verses/citationKey';
import {HINDI_NUMBER_FORMS} from '../src/verses/hindiNumbers';

describe('devanagariToLatin', () => {
  it('leaves text with no Devanagari in it alone', () => {
    expect(devanagariToLatin('bhagavad gita 2.13')).toBe('bhagavad gita 2.13');
    expect(hasDevanagari('hello')).toBe(false);
  });

  it('reads the inherent vowel, and lets a matra cancel it', () => {
    expect(devanagariToLatin('क')).toBe('ka');
    expect(devanagariToLatin('कि')).toBe('ki');
    // Virama: no vowel at all, so the consonants join.
    expect(devanagariToLatin('क्')).toBe('k');
  });

  it('reads anusvara as the nasal that belongs to the next consonant', () => {
    // स्कंध is skandh, not skamdh. Getting this wrong broke every Hindi
    // citation using a word like it, because `skandh` is one of the words that
    // says which book is being cited.
    expect(devanagariToLatin('स्कंध')).toContain('skandh');
    // Before a labial it really is m.
    expect(devanagariToLatin('अंबा')).toContain('amb');
  });
});

describe('a verse in either script', () => {
  const pairs = [
    ['देहिनोऽस्मिन्यथा देहे कौमारं यौवनं जरा', "dehino 'smin yathā dehe kaumāraṁ yauvanaṁ jarā"],
    ['कृष्ण', 'kṛṣṇa'],
    ['भगवद्गीता', 'bhagavad-gītā'],
  ];

  it('lands on exactly the same phonetic stream', () => {
    // The whole requirement in one line: whatever the Hindi model returns has
    // to be comparable with the IAST the corpus is indexed from.
    pairs.forEach(([devanagari, iast]) => {
      expect(phoneticStream(devanagari)).toBe(phoneticStream(iast));
    });
  });

  it('finds a verse recited and returned in Devanagari', () => {
    const hit = identify(
      'देहिनोऽस्मिन्यथा देहे कौमारं यौवनं जरा तथा देहान्तरप्राप्तिर्धीरस्तत्र न मुह्यति',
    );
    expect(hit).not.toBeNull();
    expect(hit.ref).toBe('BG 2.13');
  });
});

describe('citations spoken in Hindi', () => {
  it('reads a romanised Hindi citation', () => {
    expect(lastCitation('bhagavad gita adhyaya char shlok saat').id).toBe('bg-4.7');
    expect(lastCitation('bhagavad gita adhyay do shlok terah').id).toBe('bg-2.13');
    expect(lastCitation('shrimad bhagavatam skandh ek adhyaya do shlok chhe').id)
      .toBe('sb-1.2.6');
  });

  it('reads the same citation written in Devanagari', () => {
    // Which is the form the Hindi recogniser actually produces.
    expect(lastCitation('भगवद्गीता अध्याय चार श्लोक सात').id).toBe('bg-4.7');
    expect(lastCitation('श्रीमद्भागवतम् स्कंध एक अध्याय दो श्लोक छह').id).toBe('sb-1.2.6');
  });

  it('reads Hindi numerals that have no English-style composition', () => {
    // `chhiyasath` is sixty-six as one word - there is no "sixty" in it to
    // read, which is why the numbers are a table rather than a rule.
    expect(lastCitation('gita adhyaya atharah shlok chhiyasath').id).toBe('bg-18.66');
  });

  it('reads a citation that switches language mid-sentence', () => {
    // Which is how people actually talk: an English frame with Hindi numbers
    // in it, or the reverse, or Devanagari for the book and English for the
    // rest. Nothing special handles this - the numerals are looked up in both
    // languages per word, and the structural words of both are filler - but it
    // is the common case and should not be left to luck.
    expect(lastCitation('bhagavad gita chapter char text saat').id).toBe('bg-4.7');
    expect(lastCitation('gita adhyaya four shlok seven').id).toBe('bg-4.7');
    expect(lastCitation('gita chapter do verse terah').id).toBe('bg-2.13');
    expect(lastCitation('bhagavad gita adhyaya eighteen shlok chhiyasath').id)
      .toBe('bg-18.66');
    expect(lastCitation('shrimad bhagavatam canto ek chapter do text chhe').id)
      .toBe('sb-1.2.6');
  });

  it('reads a Devanagari book name with the rest in English', () => {
    expect(lastCitation('गीता chapter char shlok seven').id).toBe('bg-4.7');
  });

  it('reads digits wherever they turn up', () => {
    // Recognisers write some numbers as words and some as digits with no
    // consistency, and both models do it.
    expect(lastCitation('bhagavad gita adhyaya 4 shlok saat').id).toBe('bg-4.7');
    expect(lastCitation('srimad bhagavatam skandh 1 adhyaya 2 shlok 6').id)
      .toBe('sb-1.2.6');
  });

  it('still reads English citations', () => {
    expect(lastCitation('bhagavad gita chapter four text seven').id).toBe('bg-4.7');
  });

  it('keeps saat and saath apart', () => {
    // Seven and sixty. phoneticStream flattens both to `sat`, which is why
    // citations use a gentler key than verse matching does - a number word has
    // no context to recover from being wrong.
    expect(citationKey('saat')).not.toBe(citationKey('saath'));
    expect(lastCitation('gita adhyaya do shlok saat').id).toBe('bg-2.7');
    expect(lastCitation('gita adhyaya do shlok saath').id).toBe('bg-2.60');
  });

  it('has no two numerals sharing a key', () => {
    // A collision here silently turns one number into another inside every
    // citation that uses it.
    const seen = new Map();
    const clashes = [];
    for (const [value, forms] of Object.entries(HINDI_NUMBER_FORMS)) {
      for (const form of forms) {
        const key = citationKey(form);
        if (seen.has(key) && seen.get(key) !== value) {
          clashes.push(`${key}: ${seen.get(key)} and ${value} (${form})`);
        } else {
          seen.set(key, value);
        }
      }
    }
    expect(clashes).toEqual([]);
  });
});
