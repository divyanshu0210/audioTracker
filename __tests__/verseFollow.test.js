// Following a song, once it is known.
//
// The matcher's job ends when the song is named. From there the question is
// where in it the singing has reached, and these are the two answers that have
// to be right: the marker lands on the line being sung, and the follower lets
// go when the singing is no longer this song.
//
// The second is the one with teeth. While a place keeps being found the corpus
// is never consulted, so a follower that finds itself inside any song at all is
// a follower that never hands over to the next one.

import {follow, isFollowable, forgetFollowed} from '../src/verses/follow';

const songs = require('../src/verses/corpus/text/songs.json');
const bg = require('../src/verses/corpus/text/bg.json');

const record = id => ({id, ...songs[id]});

// Narottama dasa's, ten lines, and in the corpus from the song book. Chosen
// because two of its lines open identically - `rupa-raghunatha-pade` at six and
// at eight - so placing it needs more than the first words of a line.
const GAURANGA = 'songbook-gaurangabolitehabe';

beforeEach(forgetFollowed);

describe('what is worth following', () => {
  it('follows a song', () => {
    expect(isFollowable(record(GAURANGA))).toBe(true);
  });

  it('does not follow a verse', () => {
    // Four lines, entirely on screen already. There is no place to point at.
    const id = Object.keys(bg)[0];
    expect(isFollowable({id, ...bg[id]})).toBe(false);
  });

  it('does not follow nothing', () => {
    expect(isFollowable(null)).toBe(false);
    expect(isFollowable({lines: []})).toBe(false);
  });
});

describe('finding the line', () => {
  const rec = () => record(GAURANGA);

  // Sung as it is written. The window holds the line before the current one,
  // the way the store's rolling window would.
  const heardAt = i => [rec().lines[i - 1] || '', rec().lines[i]].join(' ');

  it('lands on the line being sung, all the way through', () => {
    const lines = rec().lines;
    const placed = [];
    for (let i = 0; i < lines.length; i++) {
      const where = follow(rec(), heardAt(i));
      expect(where).not.toBeNull();
      placed.push(where.line);
    }
    expect(placed).toEqual(lines.map((_, i) => i));
  });

  it('tells the two rupa-raghunatha-pade lines apart', () => {
    // Identical for their first twenty characters and different after, so
    // anything keying off the opening of a line gets one of these wrong.
    expect(follow(rec(), heardAt(6)).line).toBe(6);
    expect(follow(rec(), heardAt(8)).line).toBe(8);
  });

  it('places Devanagari, which is what the recogniser actually emits', () => {
    // The song book carries no Devanagari, so this can only work by the two
    // scripts reducing to the same phonetic stream.
    const where = follow(
      rec(),
      'कबे हाम हेरबो श्री बृन्दाबन रूप रघुनाथ पदे होइबे आकुति',
    );
    expect(where.line).toBe(6);
  });

  it('places singing the model heard imperfectly', () => {
    // Doubled and dropped vowels, the sibilant wrong: roughly what comes back
    // from real audio.
    const where = follow(rec(), 'कबे हामा हेराबो सिरी बिरिन्दाबाना');
    expect(where.line).toBe(5);
  });
});

describe('letting go', () => {
  it('lets go of a song that is not being sung', () => {
    expect(follow(record(GAURANGA), 'hare krishna hare krishna krishna krishna hare hare')).toBeNull();
  });

  it('lets go of English commentary', () => {
    expect(
      follow(
        record(GAURANGA),
        'so today we are speaking about the glories of the holy name and how ' +
          'the previous acaryas have described this process for us',
      ),
    ).toBeNull();
  });

  it('holds on when the last few seconds are unplaceable but the song is not over', () => {
    // Two lines of this song, then something the model garbled. The tail
    // cannot be placed, but the window is still full of the song - so the
    // answer is "still here, place unknown", not "gone".
    const lines = record(GAURANGA).lines;
    const where = follow(
      record(GAURANGA),
      [lines[2], lines[3], 'ta ta ta ta ta ta ta'].join(' '),
    );
    expect(where).not.toBeNull();
    expect(where.presence).toBeGreaterThan(0);
  });

  it('does not take quiet for the end of the song', () => {
    // Barely any text. Not evidence of anything, least of all that the song
    // stopped - the model simply has not said much.
    const where = follow(record(GAURANGA), 'कबे');
    expect(where).not.toBeNull();
    expect(where.line).toBeNull();
  });
});

describe('over the whole corpus', () => {
  // The per-song checks above could pass on one lucky record. This is every
  // song long enough to follow, walked line by line as though sung.
  it('lands on the right line for almost every line of every song', () => {
    const ids = Object.keys(songs).filter(
      id => (songs[id].lines || []).length >= 6,
    );
    expect(ids.length).toBeGreaterThan(500);

    let exact = 0;
    let within = 0;
    let total = 0;
    for (const id of ids) {
      const rec = record(id);
      for (let i = 0; i < rec.lines.length; i++) {
        const heard = [rec.lines[i - 1] || '', rec.lines[i]].join(' ');
        const where = follow(rec, heard);
        total++;
        if (!where || where.line === null) continue;
        if (where.line === i) exact++;
        if (Math.abs(where.line - i) <= 1) within++;
      }
    }

    // Measured at 96.6% exact and 98.5% within a line over 18,662 lines of 913
    // songs. The bar is set below that to leave room for the corpus changing,
    // but not far below: a real regression in the alignment shows up here as
    // several points, not a fraction of one - the one that did show up, a
    // cluster reaching into the following line, cost five.
    expect(exact / total).toBeGreaterThan(0.93);
    expect(within / total).toBeGreaterThan(0.96);
  });
});
