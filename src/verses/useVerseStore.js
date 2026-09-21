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

import {identify, nearMisses} from './matcher';
import {enqueue, flush, isStronger} from './feedback';
import {tuning} from './tuning';
import {lastCitation} from './citations';
import {lookup} from './corpusText';

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

  // Everything recognised this session, oldest first. The panel offers this as
  // a list, and each entry carries the position it was heard at - which makes
  // it a table of contents for a lecture nobody indexed.
  history: [],

  // Recent recogniser output: [{text, at}], trimmed to WINDOW_MS.
  _window: [],
  // id -> {count, at}: how many *separate* windows have named it since the last
  // commit, and when the last one that counted arrived.
  _votes: new Map(),

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

    // The expensive part - a second pass over the index for the near-misses -
    // stays behind the flag.
    if (get().debug) {
      set({
        lastHeard: heard.length > 180 ? `…${heard.slice(-180)}` : heard,
        candidates: nearMisses(heard),
      });
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

    const hit = identify(heard);
    if (!hit) return;
    if (hit.id === get().current?.id) return;

    // Something already on screen is not replaced on the strength of evidence
    // that could be an echo of what is still sitting in the window.
    if (get().current && at - get()._lastCommitAt < REPLACE_COOLDOWN_MS) return;

    const votes = new Map(get()._votes);
    const prior = votes.get(hit.id);

    // Only a vote from a meaningfully different window counts. Anything sooner
    // is the same few seconds of audio being matched again - see
    // VOTE_SPACING_MS.
    const count =
      prior && at - prior.at < voteSpacingMs
        ? prior.count
        : (prior?.count || 0) + 1;

    votes.set(hit.id, {count, at: prior && count === prior.count ? prior.at : at});
    set({_votes: votes});

    // Two ways to be believed: one window that was unmistakable, or two
    // windows that agreed.
    //
    // The strong path also asks for solidity, which it did not before. Run
    // length alone says a long stretch lined up; it does not say the stretch
    // was *this* record rather than syllables every verse shares. A single
    // window committing on length alone is the remaining source of false
    // matches, because nothing else has to agree with it - measured on real
    // recitation, solidity sits between 0.39 and 0.63, so this rejects very
    // little of what is genuine.
    const unmistakable =
      hit.runChars >= strongRunChars && hit.solidRatio >= strongSolidRatio;

    if (unmistakable || count >= corroboration) {
      const record = lookup(hit.id);
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
      return {current: entry, _votes: new Map(), _lastCommitAt: nowMs()};
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
      return {current: null, _votes: new Map()};
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
      history: [],
      _window: [],
      _votes: new Map(),
      _lastCommitAt: 0,
      heardCount: 0,
      lastHeard: '',
      lastConfidence: 0,
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
  onSeek: () => set({_window: [], _votes: new Map()}),
}));

export default useVerseStore;
