// What a recording's own name gives away.
//
// The cheap path, and the only one that works before any audio has been read.
// What it has to get right is restraint: a title says what a lecture is
// *about*, so a wrong reading puts a verse on screen that was never recited.

import {verseFromTitle} from '../src/verses/verseTitle';

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
