// Letting go of one song for the next.
//
// The panel follows a song once it knows it, and following means the corpus is
// not consulted while the singing still fits - which is what stops a correct
// song being replaced by the matcher's next guess. The cost of that is this
// test: a follower too willing to believe it is still in a song will never hand
// over to the next one, and there is nothing the person can do about it.
//
// Reported from a device in exactly the shape below. The pranama mantras are
// sung before a programme; they are one record of fifty-nine lines and the most
// generic devotional Sanskrit there is; and the song that came after them could
// not get on screen.
//
// Two things here were learned the hard way.
//
// The store is driven for real rather than reimplemented, because the bug was
// in the control flow and not in the matching - every piece worked alone while
// the whole did the wrong thing.
//
// And what is sung is real recogniser output, not corpus text and not corpus
// text with characters knocked out. Both of those pass against the broken code.
// A recogniser does not drop letters from the right answer; it guesses, and its
// guesses are full of the commonest devotional syllables there are - which is
// precisely why a long record made of those syllables claims them. The fixture
// below is what the model actually returned for one real recording, and the
// pranama mantras claim eighteen of its twenty-four windows.

import useVerseStore from '../src/verses/useVerseStore';

jest.mock('../src/verses/feedback', () => ({
  enqueue: () => Promise.resolve(),
  flush: () => Promise.resolve(),
  isStronger: (next, current) => next !== current,
}));

const songs = require('../src/verses/corpus/text/songs.json');

const PRANAMAS = 'songbook-pranamamantras';
const SONG = 'songbook-nadiyagodrumenityananda';

// Twenty-four hops of Su-srota output, in order, from a recording of Nadiya
// Godrume Nityananda Mahajan - about a minute and a half. Nothing is cleaned
// up; the empty string is a hop the model returned nothing for, and it is kept
// because that happens.
//
// Long enough on purpose. The window holds twenty-five seconds, so for the
// first six hops after the pranamas stop it still contains them and they are
// still the best answer in it - correctly. The handover cannot happen until
// that clears, and a fixture shorter than that tests nothing but the window.
const HEARD = [
  "",
  "नादीयागोतूमि",
  "नित्यानन्दमाहाशः",
  "वसन्ति सियास",
  "नादीयगदगुणे निद्य्यानन्द महाच",
  "नादीय को धूमे नित्यानन्दमााच",
  "हातीयशिनाामतजिदराकार",
  "पाथियसेनभतजी",
  "रा क नादीय कोद्रुम्",
  "मै निद्यानन्द महहा",
  "ययागोद्रूणे नित्यानन्द महाच",
  "श्रदपञ्चान्हे",
  "श्रदपञ्चान् हे",
  "प्रभूवाहव्यायि भायि मोकेभक्ष",
  "प्रभुवा्याहि पहि मागे पक्ष",
  "ओमो कृष्ण वाजो कृष्णघोरक्ष",
  "ओलो कृष्णभाजो कृष्ण भोलो कृष्ण शिक्ष",
  "माादीय कोत्रु मे नित्यानन्द महाचा",
  "नादीय कोदृणे मित्यानन्द महाच",
  "अपरार सुयहो येयोोः कृष्णना",
  "अपररसून्यहो यलोःो कृष्णो",
  "कृष्ण कृष्णमाता कृष्णप्रिया",
  "कृष्णमता कष्ण",
  "कष्णान्त नादीय गोध्रुव",
];

const store = () => useVerseStore.getState();

// The recogniser delivers one result per hop, and the hop is four seconds. Real
// time matters: the store spaces its votes and holds a cooldown after a commit,
// both in milliseconds, so ingesting everything inside one millisecond would
// exercise neither.
let clock = 0;
const HOP_MS = 4000;

beforeEach(() => {
  clock = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
  store().reset();
  store().setEnabled(true);
});

afterEach(() => {
  Date.now.mockRestore();
});

const hear = utterances => {
  for (const text of utterances) {
    clock += HOP_MS;
    store().ingest(text, 1);
  }
};

/** Recite the pranamas, cleanly, until they are the thing on screen. */
const recitePranamas = () => {
  const lines = songs[PRANAMAS].lines;
  hear(
    Array.from({length: Math.ceil(lines.length / 3)}, (_, i) =>
      lines.slice(i * 3, i * 3 + 3).join(' '),
    ),
  );
};

describe('the pranamas, then a song', () => {
  it('shows the pranamas while they are being recited', () => {
    recitePranamas();
    expect(store().current?.id).toBe(PRANAMAS);
    expect(store().followLine).not.toBeNull();
  });

  it('lets the song that follows them onto the screen', () => {
    recitePranamas();
    expect(store().current?.id).toBe(PRANAMAS);

    hear(HEARD);

    // Within a minute and a half of the song starting, most of which is the
    // window emptying itself of the pranamas.
    expect(store().current?.id).toBe(SONG);
  });

  it('does not carry the old marker onto the new song', () => {
    recitePranamas();
    hear(HEARD);
    const line = store().followLine;
    if (line !== null) {
      expect(line).toBeLessThan(songs[SONG].lines.length);
    }
  });
});

describe('a song it is still hearing', () => {
  it('finds it from nothing, and keeps it', () => {
    hear(HEARD);
    expect(store().current?.id).toBe(SONG);

    // The same song goes on. Nothing else may take the panel from it.
    hear(HEARD);
    expect(store().current?.id).toBe(SONG);
  });

  it('follows it, and moves the marker through it', () => {
    // The point of holding onto a song is to say where in it the singing is.
    // Loosening what it takes to hand over could quietly cost that, and every
    // other test here would still pass - so this watches the marker itself.
    //
    // Measured through this store over 32 real recordings, a line is marked in
    // 78.3% of the windows after the song is found. Here it only has to be
    // marked at all, and to move more than once: a marker that never moves is
    // a marker on the line the song was recognised at.
    const seen = [];
    for (const text of HEARD) {
      clock += HOP_MS;
      store().ingest(text, 1);
      if (store().current?.id === SONG && store().followLine !== null) {
        seen.push(store().followLine);
      }
    }

    expect(store().current?.id).toBe(SONG);
    expect(seen.length).toBeGreaterThan(4);
    expect(new Set(seen).size).toBeGreaterThan(1);
    // Every marked line is a line this song actually has.
    for (const line of seen) {
      expect(line).toBeLessThan(songs[SONG].lines.length);
    }
  });
});

describe('the song the recording is named after', () => {
  // The recording this fixture comes from is called "Nadiya Godrume
  // Nityananda Mahajan", so the title names the song that is sung - after the
  // pranamas, and after whatever else happens first.
  it('shows nothing on its own', () => {
    // The safety property, and the reason a wrong title costs nothing. A title
    // is a reason to be ready, not evidence that anything is being sung: the
    // panel would otherwise be right about the recording and wrong about the
    // moment, with a marked line claiming to be where the singing is while
    // nobody is singing.
    store().expectSong(songs[SONG], SONG);
    expect(store().current).toBeNull();
    expect(store().followLine).toBeNull();

    // Even after a minute of something that is not it.
    recitePranamas();
    expect(store().current?.id).toBe(PRANAMAS);
  });

  it('cannot put a song on screen that is not being sung', () => {
    // Expecting one song while a different one is sung must name the one that
    // is sung. Measured over 48 recordings, a deliberately wrong expectation
    // changed nothing at all - not what was found, not the marker, not the
    // handover - because every gate the matcher applies still applies and a
    // record the sound does not support is never proposed in the first place.
    store().expectSong(songs[PRANAMAS], PRANAMAS);
    hear(HEARD);
    expect(store().current?.id).toBe(SONG);
  });

  it('still reaches the song after the pranamas', () => {
    store().expectSong(songs[SONG], SONG);
    recitePranamas();
    expect(store().current?.id).toBe(PRANAMAS);
    hear(HEARD);
    expect(store().current?.id).toBe(SONG);
  });

  it('gets onto the screen without waiting for the window to clear', () => {
    // The complaint this answers: the pranamas end, the bhajan starts, and the
    // panel stays on the pranamas. It is not the matcher failing to recognise
    // the bhajan - it is the window. For twenty-five seconds after the last
    // pranama the window is still full of them, and they are still the best
    // answer to a question asked about the last twenty-five seconds.
    //
    // Knowing the song from the title is what makes the shortcut safe, so the
    // handover is measured with the title set and counted in windows.
    store().expectSong(songs[SONG], SONG);
    recitePranamas();
    expect(store().current?.id).toBe(PRANAMAS);

    let windows = 0;
    for (const text of HEARD) {
      clock += HOP_MS;
      store().ingest(text, 1);
      windows++;
      if (store().current?.id === SONG) break;
    }
    // A median of one window over 48 recordings, against eight without the
    // title. Four here, because this fixture opens with a hop the model
    // returned nothing for and two more it barely heard.
    expect(store().current?.id).toBe(SONG);
    expect(windows).toBeLessThanOrEqual(6);
  });

  it('is forgotten when the recording changes', () => {
    store().expectSong(songs[SONG], SONG);
    store().reset();
    expect(store().expected).toBeNull();
  });
});
