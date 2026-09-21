// useVerseStore.js
//
// What the panel under the player is showing, and how it decided.
//
// The recogniser produces a few words at a time, and any one of those windows
// is weak evidence. Judged window by window, the panel would flicker on and off
// through a recitation that was perfectly clear to the person listening.
//
// Time is what fixes that. A recitation runs for fifteen or thirty seconds and
// a bhajan for minutes, so the same verse gets many chances rather than one.
// This holds a rolling window of everything heard recently, matches against the
// whole of it, and waits for corroboration before it commits.
//
// The other half is knowing when to stop showing something. A lecturer recites
// a verse once and then explains it for twenty minutes, and the verse is more
// wanted during the explanation than during the recitation - so a match is not
// cleared on a timer. It stays until something else replaces it, or until the
// player moves to different media.

import {create} from 'zustand';

import {identifyDetailed, nearMisses} from './matcher';
import {enqueue, flush, isStronger} from './feedback';
import {tuning} from './tuning';
import {lastCitation} from './citations';
import {lookup} from './corpusText';
import {explains, follow, isFollowable} from './follow';

// How much recent speech is matched against at once.
//
// Long enough to hold a whole verse - most take fifteen to twenty seconds to
// recite - because a run spanning two of the recogniser's utterances is only
// visible if both are in the window together. Not much longer: every extra
// second is more unrelated speech for a coincidence to hide in, and more stale
// text that could re-trigger a verse the lecture has left.
const WINDOW_MS = 25000;

// A run this long is enough on its own - around two full lines of verse - and
// that much of it has to have been this record specifically. Both values live
// in tuning.js, where a server can correct them; see the note where they are
// used below.

// How many separate windows have to agree before a weaker match is shown. In
// tuning.js.

// How far apart two of those windows have to be to count as separate.
//
// This exists because with Vosk the corroboration rule corroborated nothing:
// partial results arrived several times a second into a twenty-five second
// window, so two consecutive ingests shared almost all of their text and a weak
// match reached its two votes in about half a second.
//
// It was six seconds, and that number quietly became the feature's worst
// latency. The recogniser now delivers one result per hop rather than several
// per second - see VerseCaptureService - and the hop is four seconds. Six
// rejected every *consecutive* window, so corroboration needed two hops and a
// verse took around fifteen seconds to appear.
//
// Consecutive windows overlap by half, which makes them substantially
// independent evidence rather than the same evidence twice, so they should
// count. What this still has to reject is two matches out of one window, which
// nothing produces today but which a shorter hop would.
//
// Kept below the hop deliberately. Raise the hop above this and corroboration
// silently costs an extra window again, which looks like a slow feature rather
// than a broken constant.
// In tuning.js, and the range it may be moved within is capped below the hop
// for the reason above.

// Once something is displayed, evidence for the next thing has to be more
// recent than this - otherwise a verse the lecture has moved past could be
// re-shown because an old fragment is still sitting in the window.
const REPLACE_COOLDOWN_MS = 4000;

// How many windows in a row may fail to find the song on screen before it is
// let go.
//
// While a song is being followed the corpus is not consulted at all, so this is
// also how long a genuinely new song waits before it can be named. That is the
// deliberate half of the trade: the complaint this answers is that a correct
// song already on screen kept being replaced by the matcher's next guess, and
// being slow to hand over is the price of not doing that.
//
// Three, from simulating this loop over 2839 windows of real recogniser
// output. Letting go is much more often a mistake than holding on is:
//
//   after   drops a song still playing   windows holding one that stopped
//     3            2.1 per recording                 20.0%
//     4            1.3 per recording                 27.5%
//
// The right-hand column is the smaller cost and largely not this constant's
// doing - the window is still full of the previous song for twenty-five
// seconds after it ends, which is most of what that figure measures. It is
// also paid only when a wrong song is on screen at all, which the bench puts
// at one recording in twenty-four.
//
// Windows the model was unsure of never reach here; the confidence gate above
// drops those. So these are windows where something was clearly heard and it
// was not this song.
const GIVE_UP_WINDOWS = 3;

// How much better a challenger has to explain the window than the song already
// on screen before the panel changes.
//
// Above one because the two are not symmetrical: what is showing is there on
// evidence that was good enough once, and swapping back and forth between two
// records that both half-fit is worse for the person than staying on either.
//
// Measured over 48 recordings, by what the panel does after it has found the
// song, and by whether it can still leave the pranama mantras for the song
// sung after them:
//
//   1.0    85.8% marked   6.0% showing the wrong song   handover 32/32
//   1.15   87.7%          2.7%                          32/32
//   1.8    88.6%          1.8%                          32/32
//   4.0    88.6%          1.8%                          32/32
//   8.0    88.5%          1.8%                          handover 22/32
//
// Everything from 1.8 to 4.0 is the same answer, which says the comparison is
// usually not close: a song being sung scores far above one that merely shares
// its vocabulary. 1.8 is the least restrictive value that reaches that plateau,
// and it is a long way from the cliff at the other end where a song that has
// genuinely ended can no longer be let go of.
const SWITCH_MARGIN = 1.8;

// How much of the window counts as "now" when choosing between two records.
//
// Long enough to hold a line or two of singing, so the comparison has something
// to weigh; short enough that a song which stopped ten seconds ago stops
// winning. See where it is used.
const RECENT_MS = 10000;

// What the recording's own name is worth, once the matcher proposes the song it
// names.
//
// A file called "Jaya Radha Madhava" is that song. What comes first is a
// pranama, or somebody introducing it, or two minutes of tuning - so the title
// is no reason to put anything on screen, and this never does. It is a reason
// to be ready: when the matcher eventually proposes that record on its own
// evidence, two independent things now agree, and it should not have to argue
// as hard as a record nothing else expected.
//
// Deliberately unable to invent a match. Every gate the matcher applies still
// applies; these only change which of two candidates it has already produced
// wins, and how many windows it takes. A wrong title can therefore cost time
// and the occasional wrong switch, but it can never name a record the sound
// does not support.
const EXPECTED_EASE = 2;
const EXPECTED_HOLD = 2;

// How clearly the song a recording is named after has to account for the last
// few seconds before the panel accepts that it has started.
//
// This exists because of what the window costs at a handover. The matcher is
// asked about the last twenty-five seconds, so for twenty-five seconds after
// the pranamas end they remain the best answer to that question - correctly,
// and in general there is nothing to be done about it. Measured, that was the
// whole of the delay: the panel took a median of eight windows, thirty-two
// seconds, to leave the pranamas for the bhajan that had already started.
//
// It is not the general case here. The recording's name already said which song
// this is; the only open question was when it starts, and ten seconds of it
// being plainly sung answers that without waiting for the window to forget what
// came before.
//
// Measured over 48 recordings, against a deliberately *wrong* expectation as
// well as the right one, because a shortcut that only ever helps when it is
// right is not worth having:
//
//            correct title                       wrong title
//          found  marked  wrong  handover      wrong-song
//   0.20   45/48  85.1%   0.7%   median 1        4.2%
//   0.30   44/48  86.5%   0.9%   median 1        2.2%
//   0.40   41/48  87.1%   1.4%   median 2        2.2%
//
// 0.30, because it is where a wrong title stops costing anything: 2.2% is what
// the panel does with no expectation at all, to the decimal. At 0.20 a wrong
// title doubles the time spent on the wrong song, and that is a real price
// paid by anyone whose file is named after a song it does not contain.
//
// Not a low bar despite the appearance. Genuine singing scores a median of
// about 0.185 against its own record over a full window, so 0.30 over ten
// seconds is the song being sung clearly and continuously, not a passing
// resemblance.
//
// Nothing else may be committed this way. `explains` on its own is a
// similarity score and would put a record on screen that merely sounds like
// what is being sung; what makes it evidence here is the file's own name
// independently saying the same thing.
const EXPECTED_ARRIVES = 0.3;

// No special case for what a programme opens with.
//
// Tried, because classes almost always begin with the pranama mantras and very
// often with Jaya Radha Madhava, and knowing that in advance is the same kind of
// prior the recording's own name gives. It does not work, and the two reasons
// are worth keeping so nobody spends the afternoon on it again.
//
// The pranamas need no help. Put through a real lecture they were named in
// every window of the recitation, on runs of 125 characters against a floor of
// 22. Adding them only cost: they are fifty-nine lines of the most generic
// devotional Sanskrit there is, so a bar low enough to help anything else is one
// they clear against almost any audio, and they began appearing at the top of
// recordings that never contained them.
//
// Jaya Radha Madhava cannot be helped this way. A prior can only favour a record
// the matcher has already proposed, and for this song it proposes nothing: the
// model emits a median of five to fourteen characters a window against the
// twenty-two a run needs, because it is sung slowly over a drone and each window
// catches a fragment. Lowering the bar to catch it finds it in one recording of
// eight at every value tried, while the share of windows sitting on the wrong
// song rises from 1.0% to 3.6%.
//
//   bar    Jaya Radha Madhava found    windows on the wrong song
//   0.30            1/8                        1.0%
//   0.20            1/8                        1.3%
//   0.12            1/8                        2.5%
//   0.08            1/8                        3.6%
//
// It is a recognition problem, not a threshold one, and the place to fix it is
// the model or the recording, not here.

// How sure the recogniser has to have been of a window for it to count.
//
// A Sanskrit model given English commentary, or a kirtan with a mrdanga over
// it, does not return nothing - it returns its best guess at Devanagari, and
// that guess is what the matcher then hunts for a verse in. The text alone
// cannot be told apart from a real recitation; it looks equally like Sanskrit.
// What separates them is that the model was not sure.
//
// Deliberately low. This is meant to drop windows the model was guessing its
// way through, not to second-guess it - the matcher's own gates are what decide
// whether something is a verse. Anything heard clearly enough to recite along
// with should be far above this.
//
// The debug line shows the figure for each window, which is how to tune it: put
// a lecture through, watch what real recitation scores and what the commentary
// between verses scores, and set it between them.
// In tuning.js. This is the one most obviously worth correcting from real
// recordings, since it was set without any.

const nowMs = () => Date.now();

// Where the media is, in seconds, pushed in by the player.
//
// Outside the store deliberately. The player reports progress about four times
// a second, and a value in zustand state would re-render every subscriber at
// that rate for something no subscriber draws - it is only read at the instant
// a verse is committed, to stamp the history entry.
//
// Seconds, because the two playback paths disagree: VLC counts milliseconds and
// the YouTube WebView seconds. BacePlayer normalises that (its TIME_FACTOR) and
// passes the result here, so this file never has to know which is running.
let positionSeconds = 0;

export const setVersePosition = seconds => {
  if (typeof seconds === 'number' && isFinite(seconds)) positionSeconds = seconds;
};

const useVerseStore = create((set, get) => ({
  // Whether the feature is on for this session. Separate from `listening`,
  // which is whether the recogniser is actually running - it can be on and not
  // listening, while playback is paused or the model is downloading.
  enabled: false,
  listening: false,
  // Set when the recogniser could not start, so the panel can say why rather
  // than sitting blank.
  unavailable: null,

  // {id, ref, kind, lines, devanagari, translation, title, source, at}
  //   source: 'heard' - matched from the recitation itself
  //           'cited' - the lecturer named it out loud
  //           'title' - named in the recording's own title
  current: null,

  // The song the recording's name says this is, if it names one.
  //
  // Not shown, and not evidence on its own - see EXPECTED_EASE. It is a prior:
  // something to be ready for while the pranamas and the introductions happen,
  // and something to hold onto once it arrives.
  expected: null,

  // Which line of `current` is being sung, or null if the place is not known.
  //
  // Only ever set for songs. A verse is four lines and already entirely on
  // screen, so there is no place to point at - see follow.js.
  followLine: null,

  // Everything recognised this session, oldest first. The panel offers this as
  // a list, and each entry carries the position it was heard at - which makes
  // it a table of contents for a lecture nobody indexed.
  history: [],

  // Recent recogniser output: [{text, at}], trimmed to WINDOW_MS.
  _window: [],
  // id -> {count, at}: how many *separate* windows have named it since the last
  // commit, and when the last one that counted arrived.
  _votes: new Map(),
  // Consecutive windows that could not be placed inside the song on screen.
  _lostWindows: 0,

  // key -> the row that will be sent about this match, once it is settled. See
  // feedback.js. Held rather than sent immediately because the verdict is not
  // known when the match is made - it is whatever happens next.
  _rows: new Map(),
  _lastCommitAt: 0,

  // The debug view, off unless somebody holds the ear pill. Worth having in a
  // shipped build: when the panel stays empty, only this separates "no audio is
  // arriving" from "the recogniser is producing nonsense" from "it is producing
  // something reasonable that the matcher will not take".
  debug: false,
  heardCount: 0,
  lastHeard: '',
  lastConfidence: 0,
  candidates: [],

  // Why the last window did not put anything on screen.
  //
  // The single most asked question about this feature, and until now
  // unanswerable from the outside: the debug list shows candidates that clear
  // the *display* gates, so a match can look unanswerable there and still be
  // refused - for a near-tie, for wanting a second window to agree, or for
  // arriving inside the cooldown after something else. All of those look
  // identical from an empty panel.
  why: '',

  setEnabled: enabled => {
    if (!enabled) get().reset();
    set({enabled, unavailable: null});
  },

  setListening: listening => set({listening}),
  setUnavailable: reason => set({unavailable: reason, listening: false}),

  /** Everything heard recently, as one string. */
  heardText: () => get()._window.map(entry => entry.text).join(' '),

  /**
   * New text from the recogniser.
   *
   * Partial results are ingested as readily as final ones. A partial is less
   * accurate, but waiting for the final result of an utterance means waiting
   * for a pause in the speech, and a verse recited mid-sentence would not
   * surface until the sentence ended.
   */
  ingest: (text, confidence = 1) => {
    if (!get().enabled || !text || !text.trim()) return;

    // Counted before the confidence gate, so the debug view can show that
    // audio is arriving even while everything is being thrown away. The two
    // failures look identical otherwise.
    set(state => ({
      heardCount: state.heardCount + 1,
      lastConfidence: confidence,
    }));

    const {
      minConfidence,
      strongRunChars,
      strongSolidRatio,
      corroboration,
      voteSpacingMs,
    } = tuning();

    if (confidence < minConfidence) {
      if (get().debug) {
        set({
          why: `unsure ${confidence.toFixed(2)} < ${minConfidence}`,
          lastHeard: `(unsure ${confidence.toFixed(2)}) ${text}`.slice(0, 180),
        });
      }
      return;
    }

    const at = nowMs();
    const window_ = [...get()._window, {text: text.trim(), at}].filter(
      entry => at - entry.at <= WINDOW_MS,
    );
    set({_window: window_});

    const heard = window_.map(entry => entry.text).join(' ');

    // The last few seconds on their own.
    //
    // Not used for choosing between two records: tried, and scoring that
    // comparison on ten seconds instead of the window quadrupled the rate at
    // which the panel sat on the wrong song, from 2.2% of windows to 8.8%, and
    // did not speed the handover up by a single window. Ten seconds is thin
    // evidence and the comparison flipped on noise.
    //
    // It is used for one thing only, below: noticing that the song this
    // recording is named after has started, while the window is still full of
    // whatever came before it.
    const recent = window_
      .filter(entry => at - entry.at <= RECENT_MS)
      .map(entry => entry.text)
      .join(' ');

    if (get().debug) {
      set({lastHeard: heard.length > 180 ? `…${heard.slice(-180)}` : heard});
    }

    // The citation path first. A lecturer naming a verse is the strongest
    // signal available and the earliest - it arrives before there is any
    // Sanskrit to match.
    const cited = lastCitation(heard);
    if (cited) {
      const record = lookup(cited.id);
      // A misheard number produces an id for a verse that does not exist.
      // Failing to resolve is how that gets discarded.
      if (record && cited.id !== get().current?.id) {
        get().commitRecord(record, cited.id, 'cited', {confidence});
        return;
      }
    }

    // Following, in place of identifying again.
    //
    // Up to here every window has asked the same question - which of twenty-six
    // thousand records is this - and gone on asking it long after the answer
    // was settled and on screen. That is not only wasted work. It is the one
    // way a correct song gets replaced by a wrong one: the matcher is still
    // guessing, and eventually a guess clears the gates.
    //
    // Once a song is up the useful question is where in it the singing has
    // reached. See follow.js: it is a smaller question, it cannot name anything
    // else, and for a bhajan that runs for minutes the line being sung is most
    // of what the panel is for.
    //
    // A title seed is excluded. It says what the recording is *about* rather
    // than what is being sung, and letting it capture the follower would give
    // the weakest source in the system the power to hold the panel shut.
    const expectedId = get().expected?.id;

    // The song this recording is named after, starting.
    //
    // Judged on the last few seconds rather than the window, because the point
    // is to notice it before the window has finished with the previous song.
    // Nothing else may be committed this way: `explains` alone is a similarity
    // score, and on its own it would put a record on screen that merely sounds
    // like what is being sung. What makes it evidence here is that the file's
    // own name independently said the same thing.
    if (
      expectedId &&
      expectedId !== get().current?.id &&
      at - get()._lastCommitAt >= REPLACE_COOLDOWN_MS
    ) {
      const record = lookup(expectedId);
      const fit = record ? explains(record, recent) : 0;
      if (fit >= EXPECTED_ARRIVES) {
        get().commitRecord(record, expectedId, 'heard', {
          confidence,
          fit: Math.round(100 * fit) / 100,
          fromTitle: true,
        });
        if (get().debug) {
          set({why: `${record.ref} has started (${fit.toFixed(2)}, named in the title)`});
        }
        return;
      }
    }

    const showing = get().current;
    const following =
      !!showing && showing.source !== 'title' && isFollowable(showing);

    let heldFit = 0;
    if (following) {
      const where = follow(showing, heard);

      if (where) {
        // `line` is null when the song is still playing but the last few
        // seconds could not be placed in it. The marker stays where it was:
        // the singer has not gone anywhere, and one that lags is better than
        // one that blinks out whenever a few seconds come out badly.
        set(state => ({
          _lostWindows: 0,
          followLine: where.line === null ? state.followLine : where.line,
        }));
        heldFit = explains(showing, heard);
      } else {
        const lost = get()._lostWindows + 1;
        // Out of patience: drop the marker. What is on screen stays until
        // something below replaces it.
        set(
          lost >= GIVE_UP_WINDOWS
            ? {_lostWindows: 0, followLine: null}
            : {_lostWindows: lost},
        );
      }

      if (get().debug) {
        const line = get().followLine;
        set({
          why:
            `following ${showing.ref}: ` +
            (line === null ? 'place unknown' : `line ${line + 1}/${showing.lines.length}`) +
            ` fit ${heldFit.toFixed(2)}`,
        });
      }
    }

    // What else this could be, asked on every window whether or not something
    // is being followed.
    //
    // Following and identifying are not alternatives, and treating them as
    // alternatives is what went wrong twice. Silence the matcher while a song
    // is up and the next song can never arrive. Make the follower timid enough
    // that the matcher is rarely silenced, and the marker suffers for a
    // problem that was never the marker's.
    //
    // So both run, always, and the two answers are compared below. Following
    // can then be as generous as it likes: being sure where the singing is
    // inside this record does not prevent another record turning out to
    // explain the sound better.
    //
    // Decided once, here, and every debug field below is filled from this same
    // call.
    //
    // They used to be computed at different points - the candidate list where
    // the window was built, the reason wherever the logic happened to give up -
    // so the panel could show a reason from one window beside candidates from
    // another. That is worse than showing nothing: it reads as a contradiction
    // and sends whoever is looking at it after the wrong thing. It sent me
    // after the wrong thing.
    const decision = identifyDetailed(heard);

    if (get().debug) {
      set({candidates: nearMisses(heard), why: decision.why});
    }

    const {hit} = decision;
    if (!hit) return;
    if (hit.id === get().current?.id) {
      if (get().debug) set({why: 'already showing'});
      return;
    }

    // Something already on screen is not replaced on the strength of evidence
    // that could be an echo of what is still sitting in the window.
    if (get().current && at - get()._lastCommitAt < REPLACE_COOLDOWN_MS) {
      if (get().debug) set({why: 'cooldown'});
      return;
    }

    const votes = new Map(get()._votes);
    const prior = votes.get(hit.id);

    // Only a vote from a meaningfully different window counts. Anything sooner
    // is the same few seconds of audio being matched again - see
    // VOTE_SPACING_MS.
    const count =
      prior && at - prior.at < voteSpacingMs
        ? prior.count
        : (prior?.count || 0) + 1;

    // The recording's own name counts as one of the agreeing windows.
    //
    // Corroboration exists because one window is weak evidence. For the song
    // the file is named after it is not the only evidence - the name already
    // said so, from a different direction entirely - and making it wait for a
    // second window is asking the same source twice.
    // The recording's own name counts as one of the agreeing windows.
    //
    // Corroboration exists because one window is weak evidence. For the song
    // the file is named after it is not the only evidence - the name already
    // said so, from a different direction entirely - and making it wait for a
    // second window is asking the same source twice.
    const needed = hit.id === expectedId ? 1 : corroboration;

    votes.set(hit.id, {count, at: prior && count === prior.count ? prior.at : at});
    set({_votes: votes});

    // Two ways to be believed: one window that was unmistakable, or two
    // windows that agreed.
    //
    // Unmistakable asks for length *and* solidity, each on its own.
    //
    // A single measure combining them was tried - run length times solid ratio,
    // so that a long run at modest solidity could pay for itself - and on the
    // corpus of the day it looked better. It is not, on this one: measured over
    // 392 matched windows from 48 recordings, the pair fast-commits about 15
    // correct windows for every wrong one, and the combined measure about 9.
    //
    // That difference matters more than the ratio suggests, because this is the
    // only path a one-off wrong window can reach the screen by. Corroboration
    // would refuse it - it needs two windows to agree - so every error admitted
    // here is one the system would otherwise have caught.
    //
    // The lesson is in how the first answer went stale rather than in either
    // number: it was measured, then the song book added 183 records and
    // superseded 119, and nobody measured again. A threshold is only as current
    // as the corpus it was fitted to.
    const unmistakable =
      hit.runChars >= strongRunChars && hit.solidRatio >= strongSolidRatio;

    if (get().debug && !unmistakable && count < needed) {
      set({
        why:
          `${hit.ref}: ${hit.runChars}ch x ${Math.round(100 * hit.solidRatio)}% = ` +
          `${Math.round(hit.runChars * hit.solidRatio)} solid ` +
          `(need ${strongRunChars}ch & ${strongSolidRatio}), ` +
          `votes ${count}/${needed}` +
          (hit.id === expectedId ? ' (named in the title)' : ''),
      });
    }

    if (unmistakable || count >= needed) {
      const record = lookup(hit.id);

      // Does this actually explain the singing better than what is up?
      //
      // The last thing asked before the panel changes, and the only one that
      // compares the two candidates on the same terms. The matcher's gates say
      // whether a record is a good enough answer on its own; they cannot say
      // whether it is a better answer than the record already showing, because
      // they never look at that one.
      //
      // Both scored by how much of this window one stretch of them accounts
      // for - see `explains`. A song being sung scores far above a song that
      // merely shares its vocabulary, and the margin is what keeps a run of
      // ordinary windows from shuffling the panel between two plausible
      // records.
      if (following && record) {
        const theirs = explains(record, heard);
        // Easier to arrive at the song the recording is named after, and harder
        // to be talked out of it once there.
        const margin =
          hit.id === expectedId
            ? SWITCH_MARGIN / EXPECTED_EASE
          : showing.id === expectedId
            ? SWITCH_MARGIN * EXPECTED_HOLD
            : SWITCH_MARGIN;
        if (theirs < heldFit * margin) {
          if (get().debug) {
            set({
              why:
                `keeping ${showing.ref} (${heldFit.toFixed(2)}) over ` +
                `${hit.ref} (${theirs.toFixed(2)})`,
            });
          }
          return;
        }
      }
      // The evidence travels with the record. The moment it was decided is the
      // only moment these numbers exist - by the time anybody dismisses it or
      // seeks back to it, the window has moved on.
      if (record) {
        get().commitRecord(record, hit.id, 'heard', {
          runChars: hit.runChars,
          solidRatio: hit.solidRatio,
          coverage: hit.coverage,
          confidence,
          votes: count,
        });
      }
    }
  },

  /**
   * Show the verse the recording is named after, before anything is heard.
   *
   * The weakest source and treated as such: it says what the lecture is
   * *about*, not what is being recited, so the first thing actually heard or
   * cited replaces it. It never enters the history, because the history records
   * moments in the recording and this belongs to no moment.
   */
  /**
   * Note the song the recording is named after, without showing it.
   *
   * The difference from seedFromTitle is the whole point. A lecture titled
   * "BG 2.13" is *about* that verse and may never recite it, so showing it is
   * a reasonable guess at what somebody wants on screen. A recording called
   * "Jaya Radha Madhava" *is* that song, and showing it before it starts would
   * be wrong in a more specific way: the panel would be right about the
   * recording and wrong about the moment, and there would be a marked line
   * claiming to be where the singing is while nobody is singing.
   */
  expectSong: (record, id) =>
    set({expected: record && id ? {id, ref: record.ref} : null}),

  seedFromTitle: (record, id) =>
    set(state =>
      state.current ? {} : {current: {...record, id, source: 'title', at: 0}},
    ),

  commitRecord: (record, id, source, evidence) =>
    set(state => {
      const heardAt = nowMs();
      // Identifies this showing of this verse. The same verse recited twice is
      // two matches with two separate verdicts, because either can be right
      // while the other is wrong.
      const key = `${id}-${heardAt}`;
      const entry = {...record, id, source, key, at: positionSeconds, heardAt};

      const rows = new Map(state._rows);
      rows.set(key, {
        key,
        verdict: 'shown',
        id,
        ref: record.ref,
        kind: record.kind,
        source,
        position: Math.round(positionSeconds),
        at: new Date().toISOString(),
        ...(evidence || {}),
      });

      return {
        _rows: rows,
        current: entry,
        // The same verse recited twice in a lecture is two entries, because
        // both positions are real and either might be the one being looked for.
        // Consecutive duplicates are not, and those are what the cooldown
        // above prevents.
        history: [...state.history, entry],
        _votes: new Map(),
        _lastCommitAt: nowMs(),
        // A new record is a new place to find. Carrying the old line number
        // over would highlight a line of this song chosen by the last one.
        followLine: null,
        _lostWindows: 0,
      };
    }),

  /**
   * The verdict on a match, from whatever the person did about it.
   *
   * Signals arrive in any order and only the strongest is kept - a verse
   * dismissed and then thumbed up was right, whatever the dismissal suggested.
   * See VERDICTS.
   */
  recordVerdict: (key, verdict) =>
    set(state => {
      const row = state._rows.get(key);
      if (!row || !isStronger(verdict, row.verdict)) return {};
      const rows = new Map(state._rows);
      rows.set(key, {...row, verdict});
      return {_rows: rows};
    }),

  /** A thumb on what is on screen. Deliberate, and the least ambiguous signal. */
  rate: verdict =>
    set(state => {
      if (!state.current || state.current.rated) return {};
      get().recordVerdict(state.current.key, verdict);
      return {current: {...state.current, rated: verdict}};
    }),

  /**
   * Put a verse from the history back on screen.
   *
   * Tapping one used to seek the media and nothing else, so the panel went on
   * showing whatever had been matched most recently - the player jumped to the
   * right place and the text under it disagreed with the audio.
   *
   * The cooldown is stamped as though this were a fresh commit. Without it the
   * next window to arrive could replace this within a second, and what the
   * person asked to see would be gone before they had read it - which looks
   * exactly like the bug this fixes.
   */
  showFromHistory: entry =>
    set(() => {
      if (!entry) return {};
      return {
        current: entry,
        _votes: new Map(),
        _lastCommitAt: nowMs(),
        followLine: null,
        _lostWindows: 0,
      };
    }),

  /**
   * Somebody seeking to a verse from the history.
   *
   * The strongest signal available and the only one nobody has to be asked
   * for: going back to a match means it was right *and* worth finding again.
   */
  noteRevisit: key => get().recordVerdict(key, 'revisited'),

  /**
   * Dismiss what is on screen without forgetting that it happened.
   *
   * Counted against the match, but weakly. Somebody may be clearing the panel
   * because they already know the verse rather than because it is wrong, which
   * is why a thumb outranks this.
   */
  dismiss: () =>
    set(state => {
      if (state.current) get().recordVerdict(state.current.key, 'dismissed');
      return {current: null, _votes: new Map(), followLine: null, _lostWindows: 0};
    }),

  toggleDebug: () => set(state => ({debug: !state.debug})),

  /**
   * Put what has been decided somewhere that survives the process.
   *
   * Until this runs, a lecture's matches exist only in the map above - and a
   * process that is swiped away or killed for memory takes them with it.
   * Somebody who plays one lecture and closes the app would otherwise produce
   * no data at all, which is exactly the person worth hearing from.
   *
   * Deliberately does not clear what it wrote. A verse still on screen can
   * still be rated, and that later verdict has to be able to overwrite this
   * one - the rows are keyed, the queue keeps the newest, and the server
   * upserts, so sending a row twice settles on the stronger verdict rather
   * than counting it twice.
   */
  persist: () => {
    const rows = [...get()._rows.values()];
    if (rows.length) enqueue(rows).then(flush);
  },

  /**
   * Starting over: different media, or the feature switched off.
   *
   * History goes too. It is a table of contents for one recording, and carrying
   * it onto the next would be wrong in a way that is hard to notice - the
   * timestamps would still look plausible.
   */
  reset: () => {
    positionSeconds = 0;

    // Settled now: nothing further can happen to a match from a recording that
    // is no longer playing. Queued rather than sent, and the send is allowed to
    // fail - see feedback.js.
    const rows = [...get()._rows.values()];
    if (rows.length) {
      enqueue(rows).then(flush);
    }

    return set({
      _rows: new Map(),
      current: null,
      expected: null,
      followLine: null,
      history: [],
      _window: [],
      _votes: new Map(),
      _lostWindows: 0,
      _lastCommitAt: 0,
      heardCount: 0,
      lastHeard: '',
      lastConfidence: 0,
      why: '',
      candidates: [],
    });
  },

  /**
   * A seek: everything in the window was heard before the jump and describes a
   * part of the recording that is no longer playing.
   *
   * What is on screen stays. It was right about somewhere, and blanking the
   * panel on every scrub would make it useless for looking around a lecture.
   */
  onSeek: () => set({_window: [], _votes: new Map(), followLine: null}),
}));

export default useVerseStore;
