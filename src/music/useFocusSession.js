// useFocusSession.js
//
// Focus mode for one player session: whether it is on, whether it can be
// turned off, and the attention check that keeps it honest.
//
// Split out of BacePlayer because it is a self-contained clock. BacePlayer owns
// what focus mode *does* - it is the one that can stop playback, refuse PiP and
// drop the foreground service - and this owns when it should.
//
// Nothing here touches VideoTracker. Time already played stays credited even
// when a check is missed: the check stops playback, it does not take anything
// back. That makes the guarantee a ceiling rather than a penalty - media can
// never run more than one check window with nobody there - and it keeps the
// report a plain record of what played, which is what the mentor has always
// been reading.

import {useCallback, useEffect, useRef, useState} from 'react';
import {resolveFocusMode} from './useFocusModeStore';

// The window a check falls somewhere inside. Randomised rather than fixed, so
// it cannot be waited out: a check every 5 minutes on the dot is a check you can
// tap and walk away from for 4 minutes 50.
const CHECK_MIN_MS = 3 * 60 * 1000;
const CHECK_MAX_MS = 7 * 60 * 1000;

// How long the prompt waits before giving up. Long enough to notice it during a
// lecture you are actually watching, short enough that an abandoned phone stops
// quickly.
export const CHECK_GRACE_MS = 30 * 1000;

// The least a window may have left when playback resumes.
//
// A window is carried across a pause rather than redrawn, so one paused with
// two seconds to run would otherwise fire a check almost the instant play is
// pressed - which reads as the app having waited to pounce.
//
// It is a floor rather than a reset, so it buys ten seconds against a window of
// minutes. It can still be milked: pause and resume every few seconds in the
// last stretch of a window and the floor re-arms each time, deferring that one
// check indefinitely. Measured, not assumed - forty such cycles carried 200
// seconds of playback with no prompt.
//
// Left alone because those bursts earn nothing. VideoTracker.onPause banks a
// segment only at 10 seconds or more, the same figure, so anything short enough
// to milk this is short enough to be discarded there.
//
// The two are not actually the same measure, though, and nothing links them:
// this one is wall-clock and the tracker's is media time. Above 1x they part
// company - at 2x a five-second burst is ten seconds of media and does count -
// so if either number moves, or playback speed is ever capped for focus mode,
// check this pair again.
const RESUME_MIN_MS = 10 * 1000;

const nextDelay = () =>
  CHECK_MIN_MS + Math.random() * (CHECK_MAX_MS - CHECK_MIN_MS);

/**
 * @param sourceId      the item being played
 * @param duration      its length in seconds, 0/undefined until the player knows
 * @param onMissedCheck called when a check goes unanswered; pauses playback
 */
export const useFocusSession = ({sourceId, duration, onMissedCheck}) => {
  const [focusOn, setFocusOn] = useState(false);
  // True while this is an assignment that has never been watched through. The
  // toggle is dead in this state.
  const [locked, setLocked] = useState(false);
  // True while a check is on screen waiting to be answered.
  const [prompting, setPrompting] = useState(false);

  // Read by the timers, which outlive any one render.
  const focusOnRef = useRef(false);
  // Whether the person has set focus mode themselves for this item. Their
  // choice outranks a later re-resolve; see the resolve effect.
  const userChoseRef = useRef(false);
  const missedRef = useRef(onMissedCheck);
  const nextCheckTimer = useRef(null);
  const graceTimer = useRef(null);

  // What is left of the current window, in ms, when playback stops - and the
  // two values needed to work that out. Null means "no window in progress",
  // which is what makes the next start draw a fresh one.
  const remainingMsRef = useRef(null);
  const windowStartedAtRef = useRef(0);
  const windowMsRef = useRef(0);

  useEffect(() => {
    missedRef.current = onMissedCheck;
  }, [onMissedCheck]);

  useEffect(() => {
    focusOnRef.current = focusOn;
  }, [focusOn]);

  const clearTimers = useCallback(() => {
    clearTimeout(nextCheckTimer.current);
    clearTimeout(graceTimer.current);
    nextCheckTimer.current = null;
    graceTimer.current = null;
  }, []);

  /**
   * Start a window of `ms`, or draw a fresh one when given nothing.
   *
   * Records when it started and how long it is, which is what lets a pause
   * bank the remainder instead of throwing it away.
   */
  const startWindow = useCallback(
    ms => {
      clearTimers();
      if (!focusOnRef.current) return;

      const delay = ms == null ? nextDelay() : ms;
      windowStartedAtRef.current = Date.now();
      windowMsRef.current = delay;
      remainingMsRef.current = delay;

      nextCheckTimer.current = setTimeout(() => {
        nextCheckTimer.current = null;
        // Spent. A pause from here on has no remainder to carry.
        remainingMsRef.current = null;
        setPrompting(true);
        graceTimer.current = setTimeout(() => {
          graceTimer.current = null;
          setPrompting(false);
          missedRef.current?.();
        }, CHECK_GRACE_MS);
      }, delay);
    },
    [clearTimers],
  );

  // A window earned outright: answered the check, or typed a note. Nothing is
  // carried over, because nothing is owed.
  const scheduleNext = useCallback(() => startWindow(null), [startWindow]);

  /**
   * Store what is left of the running window, before whatever is about to
   * cancel it does so.
   *
   * Shared by the two things that stop a window early - playback pausing, and
   * the track changing - because both have the same answer: the person was
   * watching for that long, and it counts.
   *
   * Safe to call twice. A track change and the pause that comes with it arrive
   * in either order, and once the timer is cleared there is nothing left to
   * bank, so the second call finds nothing to do.
   */
  const bankRemaining = useCallback(() => {
    if (graceTimer.current) {
      // The prompt was already up. Forfeited rather than banked - see the note
      // in onPlaybackChange.
      remainingMsRef.current = null;
    } else if (nextCheckTimer.current) {
      const elapsed = Date.now() - windowStartedAtRef.current;
      remainingMsRef.current = Math.max(0, windowMsRef.current - elapsed);
    }
  }, []);

  /**
   * Resolve focus mode for this item.
   *
   * Re-runs on duration as well as on the item, and that is not incidental:
   * completion is coverage over duration, and at mount the duration is whatever
   * the items row happened to store - often 0 for a file that has never
   * finished playing. resolveFocusMode locks on an undecidable, so the first
   * pass locks and this second one, once the player reports a real length,
   * releases it. Locking first and unlocking late is the right order to get
   * wrong in; the reverse hands out a moment where the toggle works.
   *
   * Which is also why the person's own choice has to be remembered rather than
   * recomputed. The gap between those two passes is seconds long and the toggle
   * is live for all of it on anything unlocked - so someone can switch focus
   * mode off, and then the duration lands and the second resolve turns it back
   * on under them, for no reason they can see.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {on, locked: isLocked} = await resolveFocusMode(sourceId, duration);
      if (cancelled) return;

      setLocked(isLocked);

      // A lock overrides everything, including a choice made moments ago while
      // the item still looked unlocked.
      if (isLocked) {
        setFocusOn(true);
        return;
      }
      if (userChoseRef.current) return;
      setFocusOn(on);
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceId, duration]);

  // A new item starts its own session - its own focus setting, and no prompt
  // left on screen over a different lecture.
  //
  // The window itself carries over, though, which is the one thing here that is
  // not per-item. Attention is a fact about the person, not the file: someone
  // twenty minutes into a queue has been watching for twenty minutes however
  // many times the track changed. Redrawing per item also meant a playlist of
  // short clips was never checked at all - each advance started another 3-7
  // minute window that nothing four minutes long could ever reach, which made
  // assigning short files a way around the checks entirely.
  useEffect(() => {
    bankRemaining();
    clearTimers();
    setPrompting(false);
    userChoseRef.current = false;
  }, [sourceId, bankRemaining, clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  // Focus mode going off mid-session stops the clock; going on starts it, but
  // only once something is actually playing - onPlaybackChange does that.
  useEffect(() => {
    if (!focusOn) {
      clearTimers();
      setPrompting(false);
      // Switching focus mode off ends the window rather than suspending it.
      // Turning it back on is not a way to resume a nearly-elapsed one, and an
      // hour of unfocused playback should not leave a check due immediately.
      remainingMsRef.current = null;
    }
  }, [focusOn, clearTimers]);

  /**
   * Playback started or stopped.
   *
   * Called from BacePlayer's own pause handler rather than watched as state, so
   * that play/pause costs no render in a component that is memoized precisely
   * to avoid them.
   */
  const onPlaybackChange = useCallback(
    paused => {
      if (paused || !focusOnRef.current) {
        // Bank what is left rather than discarding it. Without this,
        // pause-then-play drew a whole new 3-7 minutes each time, so tapping
        // pause every couple of minutes pushed the next check away
        // indefinitely and for free.
        //
        // Except when the prompt is already up, which bankRemaining forfeits:
        // stopping playback while being asked is itself an answer, and no time
        // can accrue against a lecture that is not running.
        bankRemaining();
        clearTimers();
        setPrompting(false);
        return;
      }

      // Resuming picks the window back up where it stopped. A fresh draw only
      // happens when there is genuinely no window in progress - the first play
      // of a track, or after a check has been answered or missed.
      startWindow(
        remainingMsRef.current == null
          ? null
          : Math.max(remainingMsRef.current, RESUME_MIN_MS),
      );
    },
    [bankRemaining, clearTimers, startWindow],
  );

  // Someone is plainly there: they are typing a note about the thing they are
  // listening to. Pushing the check out rather than ignoring the signal means
  // focus mode never interrupts the one activity it most wants to encourage.
  const onPresenceSignal = useCallback(() => {
    if (!focusOnRef.current) return;
    // Mid-prompt this would be a way to answer the check without seeing it,
    // which is fine - it is a stronger proof of presence than the tap is.
    if (graceTimer.current) {
      clearTimeout(graceTimer.current);
      graceTimer.current = null;
      setPrompting(false);
    }
    scheduleNext();
  }, [scheduleNext]);

  const confirmPresence = useCallback(() => {
    clearTimeout(graceTimer.current);
    graceTimer.current = null;
    setPrompting(false);
    scheduleNext();
  }, [scheduleNext]);

  // Ignored while locked, so a caller cannot turn an assignment's focus mode
  // off by asking twice.
  const setFocus = useCallback(
    next => {
      if (locked) return;
      userChoseRef.current = true;
      setFocusOn(next);
    },
    [locked],
  );

  return {
    focusOn,
    locked,
    prompting,
    setFocus,
    onPlaybackChange,
    onPresenceSignal,
    confirmPresence,
  };
};

export default useFocusSession;
