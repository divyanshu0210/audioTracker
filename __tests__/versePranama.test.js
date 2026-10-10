// The pranama mantras, as one thing.
//
// They are not seventeen songs. They are one sequence, recited in one order, at
// the start of virtually every programme - which makes them the most reliably
// recited Sanskrit in the library and the likeliest thing to be on a recording.
//
// Held as seventeen records they served badly in both directions. Each was two
// to four lines, which is as much coincidence as evidence, and none was long
// enough to follow through: the panel named Sri Guru Pranama, sat on two lines
// while five more mantras were recited, and had to identify each of the rest
// from nothing. Joined, any one of them reaching the matcher puts the whole
// sequence on screen and the follower walks down it.
//
// Two things here are easy to break and silent when broken: the first prayer
// going missing again, and the prayer names leaking into `lines`.

import {follow, isFollowable} from '../src/verses/follow';
import {identify} from '../src/verses/matcher';
import {phoneticStream} from '../src/verses/phonetics';

const songs = require('../src/verses/corpus/text/songs.json');

const ID = 'songbook-pranamamantras';
const record = {id: ID, ...songs[ID]};

describe('the sequence is one record', () => {
  it('is the only pranama record in the corpus', () => {
    const ids = Object.keys(songs).filter(
      id => (songs[id].bookName || '') === 'Pranama Mantras',
    );
    expect(ids).toEqual([ID]);
  });

  it('carries every prayer in the book, in the book order', () => {
    expect(record.sections.length).toBe(17);
    // Several prayers run to more than one couplet, and the book gives each
    // couplet its own TRANSLATION - so a prayer is not one block. Counting
    // lines catches the four that used to be dropped for having no title of
    // their own, half of Prabhupada's pranati among them.
    expect(record.lines.length).toBe(59);
    const at = record.sections.map(s => s.at);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(at[0]).toBe(0);
    expect(at[at.length - 1]).toBeLessThan(record.lines.length);
  });

  it('begins with om ajnana-timirandhasya', () => {
    // The first prayer in the book, and the one that went missing. Nothing
    // bounded the backward scan above it but the table of contents, whose
    // lines end in a page number rather than a full stop, so the scan ran up
    // through four hundred lines of index and the block was discarded.
    expect(record.sections[0].title).toMatch(/Guru/);
    expect(phoneticStream(record.lines[0])).toContain(
      phoneticStream('ajnana timirandhasya'),
    );
  });

  it('keeps the prayer names out of the lines', () => {
    // A name is not sung. In `lines` it would be indexed as though it were,
    // and the marker could come to rest on it.
    const titles = new Set(record.sections.map(s => phoneticStream(s.title)));
    for (const line of record.lines) {
      expect(titles.has(phoneticStream(line))).toBe(false);
    }
  });

  it('drops the fragment that used to beat it', () => {
    // kksongs' "ISKCON Pranamas": three lines, of which the first is the
    // heading kept as though sung and the other two are the first mantra. It
    // is short and its text is the most recited Sanskrit there is, so it won
    // whenever that mantra was recited alone.
    expect(songs['song-iskconpranamas']).toBeUndefined();
  });
});

describe('finding it from somewhere else', () => {
  it('tells the scriptural verses that they are part of the sequence', () => {
    // Five of the prayers are verses of Caitanya-caritamrta, and reciting one
    // alone names it under that citation rather than naming the sequence -
    // which is the better answer, because it carries a real reference and a
    // purport. This is how somebody there still finds out what they are part
    // way through.
    //
    // While each prayer was a record of its own the builder's fold noticed
    // this by itself. Joining them broke it silently: the sequence is fifty
    // lines and matches no single verse.
    const cc = require('../src/verses/corpus/text/cc-adi.json');
    expect(cc['cc-adi-1.14'].alsoIn).toContain(record.ref);
    expect(cc['cc-adi-1.15'].alsoIn).toContain(record.ref);
  });
});

describe('what the panel can do with it', () => {
  it('is long enough to follow through, where a single prayer was not', () => {
    expect(isFollowable(record)).toBe(true);
    // Two lines. This is what every one of them used to be.
    expect(isFollowable({id: 'x', lines: record.lines.slice(0, 2)})).toBe(false);
  });

  it('places every prayer inside its own section', () => {
    record.sections.forEach((section, i) => {
      const end = record.sections[i + 1]?.at ?? record.lines.length;
      const where = follow(record, record.lines.slice(section.at, end).join(' '));
      expect(where).not.toBeNull();
      expect(where.line).toBeGreaterThanOrEqual(section.at);
      expect(where.line).toBeLessThan(end);
    });
  });

  it('names the sequence from most of it, six lines at a time', () => {
    // A window holds twenty-five seconds, which through the pranamas is
    // several of them - the isolated case below is the hard one, not this.
    let named = 0;
    let windows = 0;
    for (let i = 0; i + 6 <= record.lines.length; i += 5) {
      const hit = identify(record.lines.slice(i, i + 6).join(' '));
      windows++;
      if (hit?.id === ID) named++;
    }
    // Eight of ten when this was written. Of the other two, one lands on
    // Caitanya-caritamrta Antya 2.1, which is where the mangalacarana comes
    // from and so is not a wrong answer, and one spans the join between two
    // three-line temple verses and names nothing.
    expect(windows).toBeGreaterThanOrEqual(10);
    expect(named / windows).toBeGreaterThan(0.7);
  });

  it('names something for most prayers recited alone', () => {
    // Not all: five of them are verses of Caitanya-caritamrta and are named
    // under that citation instead, which is a better answer - it carries a
    // real reference and a purport - so this counts either as a hit.
    const named = record.sections.filter((section, i) => {
      const end = record.sections[i + 1]?.at ?? record.lines.length;
      return !!identify(record.lines.slice(section.at, end).join(' '));
    });
    expect(named.length).toBeGreaterThanOrEqual(15);
  });
});
