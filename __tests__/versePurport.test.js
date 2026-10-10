// Purports, which are fetched rather than bundled.
//
// Two things are worth testing and they fail in opposite ways. The path has to
// be right or nothing is ever found - and a wrong path looks exactly like a
// verse that has no purport, which is a real and common case. The extraction
// has to stop in the right place, or the panel shows the translation twice or
// swallows the first paragraph.
//
// The fixture below is the archive's real layout: a heading, the verse in
// blockquotes, the synonyms, the translation in bold, then the purport.

import {
  extractPurport,
  mayHavePurport,
  purportPath,
} from '../src/verses/purport';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

describe('where a purport lives', () => {
  it('maps the three books onto the archive', () => {
    // Verified against the unpacked archive: 200 of 200 sampled ids resolved
    // to a real file. The zero padding is the part that silently breaks -
    // chapter-2 does not exist, chapter-02 does.
    expect(purportPath('bg-2.13')).toBe(
      'bhagavad-gita-as-it-is/chapter-02/bg-2.13.md',
    );
    expect(purportPath('sb-1.2.6')).toBe(
      'srimad-bhagavatam/canto-01/chapter-02/sb-1.2.6.md',
    );
    expect(purportPath('cc-adi-1.1')).toBe(
      'sri-caitanya-caritamrta/adi-lila/chapter-01/cc-adi-1.1.md',
    );
    expect(purportPath('cc-antya-20.65')).toBe(
      'sri-caitanya-caritamrta/antya-lila/chapter-20/cc-antya-20.65.md',
    );
  });

  it('pads two-digit chapters without mangling them', () => {
    expect(purportPath('sb-10.14.8')).toBe(
      'srimad-bhagavatam/canto-10/chapter-14/sb-10.14.8.md',
    );
  });

  it('leaves a combined verse alone', () => {
    // The archive names these by their range, and so do our ids, so the two
    // agree without any special handling.
    expect(purportPath('bg-1.16-18')).toBe(
      'bhagavad-gita-as-it-is/chapter-01/bg-1.16-18.md',
    );
  });

  it('says nothing for a song', () => {
    expect(purportPath('song-jayasrilamaharaja')).toBeNull();
    expect(mayHavePurport('song-jayasrilamaharaja')).toBe(false);
    expect(mayHavePurport('bg-2.13')).toBe(true);
  });
});

const FIXTURE = `### Bg 2.13

> देहिनोऽस्मिन्यथा देहे कौमारं यौवनं जरा ।\\
> तथा देहान्तरप्राप्तिर्धीरस्तत्र न मुह्यति ॥१३॥

> dehino 'smin yathā dehe\\
> kaumāraṁ yauvanaṁ jarā

*dehinaḥ*—of the embodied; *asmin*—in this; *dehe*—in the body.

**As the embodied soul continually passes, in this body, from boyhood to youth to old age, the soul similarly passes into another body at death.**

Since every living entity is an individual soul, each is changing his body every moment.

Any man who has perfect knowledge is called a *dhīra*. Such a man is never deluded.`;

describe('pulling the purport out', () => {
  it('starts after the translation, not before it', () => {
    const purport = extractPurport(FIXTURE);
    expect(purport.startsWith('Since every living entity')).toBe(true);
    // The three things that must not leak in: the heading, the verse and the
    // translation. Each has been a bug in a scraper in this repo before.
    expect(purport).not.toContain('Bg 2.13');
    expect(purport).not.toContain('dehino');
    expect(purport).not.toContain('As the embodied soul');
  });

  it('keeps every paragraph of it', () => {
    expect(extractPurport(FIXTURE)).toContain('Any man who has perfect knowledge');
  });

  it('renders the emphasis as text rather than asterisks', () => {
    // Almost all of it is transliteration, and it reads worse with the markup
    // showing than without it.
    const purport = extractPurport(FIXTURE);
    expect(purport).toContain('called a dhīra');
    expect(purport).not.toContain('*');
  });

  it('is empty when there is no purport, which is ordinary', () => {
    // Many Caitanya-caritamrta verses have none - 78 of a 200-verse sample -
    // so this is a normal result and not a failure.
    const noPurport = `### CC Adi 1.1

> vande gurūn

**I offer my obeisances.**`;
    expect(extractPurport(noPurport)).toBe('');
    expect(extractPurport('')).toBe('');
  });
});
