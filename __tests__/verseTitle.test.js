// What a recording's own name gives away.
//
// The cheap path, and the only one that works before any audio has been read.
// What it has to get right is restraint: a title says what a lecture is
// *about*, so a wrong reading puts a verse on screen that was never recited.

import {songFromTitle, verseFromTitle} from '../src/verses/verseTitle';

describe('a verse named in the title', () => {
  it('reads the abbreviations filenames actually use', () => {
    expect(verseFromTitle('BG 2.13').ref).toBe('BG 2.13');
    expect(verseFromTitle('SB 1.1.1 morning class').ref).toBe('SB 1.1.1');
  });

  it('carries the whole record, ready to show', () => {
    const verse = verseFromTitle('BG 4.7 - Sunday feast lecture');
    expect(verse.lines.length).toBeGreaterThan(0);
    expect(verse.translation).toBeTruthy();
  });

  it('reads one named in the folder rather than the file', () => {
    // Filed by canto far more often than not.
    expect(verseFromTitle('morning class', '/Lectures/SB 1.1.1/audio.mp3').ref)
      .toBe('SB 1.1.1');
  });

  it('says nothing about a title naming no verse', () => {
    expect(verseFromTitle('Sunday feast lecture')).toBeNull();
    expect(verseFromTitle('')).toBeNull();
    expect(verseFromTitle(null, null)).toBeNull();
  });

  it('says nothing about a verse the corpus does not have', () => {
    // SB canto 13 does not exist.
    expect(verseFromTitle('SB 13.1.1')).toBeNull();
  });
});

describe('a song named in the title', () => {
  // A different claim from a verse in a title. A lecture called "BG 2.13" is
  // *about* that verse; a recording called "Jaya Radha Madhava" *is* that song,
  // and the only open question is when it starts.
  it('finds the song inside a filename', () => {
    expect(songFromTitle('IDT_Bhajans_-_Gauranga_Bolite_Habe-02_-_Radhanath_Swami').id)
      .toBe('songbook-gaurangabolitehabe');
    expect(songFromTitle('Bhajans - Jaya Radha Madhava - Mayapur').id)
      .toBe('songbook-jayaradhamadhava');
  });

  it('says nothing about a lecture', () => {
    // The one this was checked against: a real lecture recording, whose title
    // is ordinary English and names no song at all.
    expect(songFromTitle('MMC-1_Soul more important than body_RSP')).toBeNull();
    expect(songFromTitle('Sunday feast lecture')).toBeNull();
    expect(songFromTitle('')).toBeNull();
    expect(songFromTitle(null, null)).toBeNull();
  });

  it('refuses names too short to mean anything', () => {
    // Short names are not evidence: they turn up inside longer names, inside
    // people's names, and inside ordinary words.
    expect(songFromTitle('Nitai')).toBeNull();
  });

  it('does not let a name run across a word boundary', () => {
    // The corpus holds two different songs whose names begin the same way:
    // "Jaya Radha Madhava", which is the one everybody knows, and "Jaya Radha
    // Madhava Radha", a different kirtan naming deity after deity.
    //
    // Folding a title to bare letters put the wrong one in front. "Jaya Radha
    // Madhava-01 - Radhanath Swami" becomes jayaradhamadhavaradhanathswami,
    // which contains jayaradhamadhavaradha - the extra `radha` coming out of
    // the word Radhanath - so the longer name matched more of the title and
    // won. The panel then expected, and showed, the wrong song.
    expect(songFromTitle('IDT_Bhajans_-_Jaya_Radha_Madhava-01_-_Radhanath_Swami').id)
      .toBe('songbook-jayaradhamadhava');
    expect(songFromTitle('Jaya Radha Madhava - 1997 Radhanath Swami').id)
      .toBe('songbook-jayaradhamadhava');

    // And the other song is still found when the title really is that one.
    expect(songFromTitle('Jaya Radha Madhava Radha Madhava Radhe - kirtan').id)
      .toBe('songbook-jayaradhamadhavaradha');
  });

  it('prefers the longer name where two match', () => {
    // Titles carry more than one song's worth of words, and the longer match is
    // the more specific claim.
    const found = songFromTitle('Jaya Radha Madhava Radha Madhava');
    expect(found).not.toBeNull();
    expect(found.ref.length).toBeGreaterThanOrEqual('Jaya Radha Madhava'.length);
  });
});
