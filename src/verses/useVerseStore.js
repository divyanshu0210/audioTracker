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

// A run this long is enough on its own. Around two full lines of verse.
const STRONG_RUN_CHARS = 55;

// How many separate windows have to agree before a weaker match is shown.
const CORROBORATION = 2;

// How far apart two of those windows have to be to count as separate.
//
// Without this the corroboration rule corroborates nothing. The recogniser
// returns partial results several times a second and the window is twenty-five
// seconds long, so two consecutive ingests share almost all of their text - the
// second "agreeing" with the first is the same evidence read twice, and a
// weak match reached its two votes in about half a second.
//
// A quarter of the window, so that by the second vote a good deal of what
// produced the first has aged out and the match has had to survive on material
// heard since.
const VOTE_SPACING_MS = 6000;

// Once something is displayed, evidence for the next thing has to be more
// recent than this - otherwise a verse the lecture has moved past could be
// re-shown because an old fragment is still sitting in the window.
const REPLACE_COOLDOWN_MS = 4000;

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
  _lastCommitAt: 0,

  // The debug view, off unless somebody holds the ear pill. Worth having in a
  // shipped build: when the panel stays empty, only this separates "no audio is
  // arriving" from "the recogniser is producing nonsense" from "it is producing
  // something reasonable that the matcher will not take".
  debug: false,
  heardCount: 0,
  lastHeard: '',
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
  ingest: text => {
    if (!get().enabled || !text || !text.trim()) return;

    const at = nowMs();
    const window_ = [...get()._window, {text: text.trim(), at}].filter(
      entry => at - entry.at <= WINDOW_MS,
    );
    set({_window: window_});

    const heard = window_.map(entry => entry.text).join(' ');

    // Counted always, so the number means "results since this recording
    // started" rather than "since you opened the debug view".
    set(state => ({heardCount: state.heardCount + 1}));

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
        get().commitRecord(record, cited.id, 'cited');
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
      prior && at - prior.at < VOTE_SPACING_MS
        ? prior.count
        : (prior?.count || 0) + 1;

    votes.set(hit.id, {count, at: prior && count === prior.count ? prior.at : at});
    set({_votes: votes});

    if (hit.runChars >= STRONG_RUN_CHARS || count >= CORROBORATION) {
      const record = lookup(hit.id);
      if (record) get().commitRecord(record, hit.id, 'heard');
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

  commitRecord: (record, id, source) =>
    set(state => {
      const entry = {...record, id, source, at: positionSeconds, heardAt: nowMs()};
      return {
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

  /** Dismiss what is on screen without forgetting that it happened. */
  dismiss: () => set({current: null, _votes: new Map()}),

  toggleDebug: () => set(state => ({debug: !state.debug})),

  /**
   * Starting over: different media, or the feature switched off.
   *
   * History goes too. It is a table of contents for one recording, and carrying
   * it onto the next would be wrong in a way that is hard to notice - the
   * timestamps would still look plausible.
   */
  reset: () => {
    positionSeconds = 0;
    return set({
      current: null,
      history: [],
      _window: [],
      _votes: new Map(),
      _lastCommitAt: 0,
      heardCount: 0,
      lastHeard: '',
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
