/**
 * @format
 *
 * The attention-check clock, and what interrupting it does.
 *
 * Most of these are about one idea: a window that restarts rather than carrying
 * its remainder makes the interruption free. Pause and resume, or let a short
 * clip end, and the next check is pushed out again - worth far more to someone
 * avoiding the checks than missing a single one is.
 */

jest.mock('../src/music/useFocusModeStore', () => ({
  __esModule: true,
  default: {getState: () => ({isAssigned: () => false})},
  // Not an assignment, and the person's default is on - so focus mode is on and
  // unlocked, which is the state the clock actually runs in.
  resolveFocusMode: jest.fn(async () => ({on: true, locked: false})),
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {useFocusSession, CHECK_GRACE_MS} from '../src/music/useFocusSession';

const MINUTE = 60 * 1000;
// useFocusSession draws each window from [3min, 7min). Math.random is pinned
// per test, so "the window" below always means exactly this.
const WINDOW_AT = fraction => 3 * MINUTE + fraction * (7 * MINUTE - 3 * MINUTE);

/** Render the hook and hand back a live view of what it returned. */
const mountSession = onMissedCheck => {
  const api = {current: null};
  const Probe = ({sourceId}) => {
    api.current = useFocusSession({sourceId, duration: 3600, onMissedCheck});
    return null;
  };
  let tree;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<Probe sourceId="lecture-1" />);
  });
  return {
    api,
    // Advancing a playlist: same hook, different item.
    playNext: id =>
      ReactTestRenderer.act(() => tree.update(<Probe sourceId={id} />)),
    unmount: () => ReactTestRenderer.act(() => tree.unmount()),
  };
};

const advance = ms => ReactTestRenderer.act(() => jest.advanceTimersByTime(ms));

describe('attention check scheduling', () => {
  let missed;
  let session;

  beforeEach(async () => {
    jest.useFakeTimers();
    // Date.now has to move with the fake clock: the remainder is worked out
    // from wall-clock readings, not from the timer that was cancelled.
    jest.setSystemTime(new Date('2026-09-19T10:00:00Z'));
    jest.spyOn(Math, 'random').mockReturnValue(0.5); // a 5 minute window
    missed = jest.fn();
    session = mountSession(missed);
    // Let the async focus-mode resolution settle before anything is asserted.
    await ReactTestRenderer.act(async () => {});
  });

  afterEach(() => {
    session.unmount();
    Math.random.mockRestore();
    jest.useRealTimers();
  });

  const play = () => ReactTestRenderer.act(() => session.api.current.onPlaybackChange(false));
  const pause = () => ReactTestRenderer.act(() => session.api.current.onPlaybackChange(true));

  it('does not prompt until playback starts', () => {
    advance(WINDOW_AT(0.5) + 1000);
    expect(session.api.current.prompting).toBe(false);
  });

  it('prompts once the window elapses while playing', () => {
    play();
    advance(WINDOW_AT(0.5) - 1000);
    expect(session.api.current.prompting).toBe(false);
    advance(2000);
    expect(session.api.current.prompting).toBe(true);
  });

  it('pauses playback when the prompt goes unanswered', () => {
    play();
    advance(WINDOW_AT(0.5));
    advance(CHECK_GRACE_MS);
    expect(missed).toHaveBeenCalledTimes(1);
    expect(session.api.current.prompting).toBe(false);
  });

  it('carries the remainder across a pause instead of redrawing', () => {
    play();
    advance(4 * MINUTE); // 1 minute left of a 5 minute window
    pause();
    advance(30 * MINUTE); // paused: the clock must not run
    expect(session.api.current.prompting).toBe(false);

    play();
    advance(59 * 1000);
    expect(session.api.current.prompting).toBe(false);
    advance(2000);
    expect(session.api.current.prompting).toBe(true);
  });

  it('cannot be pushed away by pausing over and over', () => {
    // The exploit this was written for. Ten pause/resume cycles of 30s each
    // come to the 5 minute window, so the check still lands - where a redraw
    // would have started another 3-7 minutes every single time.
    play();
    for (let i = 0; i < 9; i++) {
      advance(30 * 1000);
      pause();
      play();
    }
    expect(session.api.current.prompting).toBe(false);
    advance(30 * 1000);
    expect(session.api.current.prompting).toBe(true);
  });

  it('never fires the instant playback resumes', () => {
    play();
    advance(WINDOW_AT(0.5) - 500); // half a second left
    pause();
    play();
    // Without the floor this would prompt within 500ms of pressing play.
    advance(5000);
    expect(session.api.current.prompting).toBe(false);
    advance(RESUME_FLOOR);
    expect(session.api.current.prompting).toBe(true);
  });

  it('carries the window across a track change', () => {
    // Attention is a fact about the person, not the file. Four minutes into a
    // five minute window, the next clip inherits the last minute of it.
    play();
    advance(4 * MINUTE);
    session.playNext('lecture-2');
    play();

    advance(59 * 1000);
    expect(session.api.current.prompting).toBe(false);
    advance(2000);
    expect(session.api.current.prompting).toBe(true);
  });

  it('still checks someone working through a queue of short clips', () => {
    // The hole this closed. Redrawing per item meant a 3-7 minute window
    // restarted on every advance, and nothing 90 seconds long could ever reach
    // it - so a queue of short clips was never checked at all.
    play();

    // Three 90-second clips: 4.5 minutes watched, still inside the window.
    for (let i = 2; i <= 4; i++) {
      advance(90 * 1000);
      expect(session.api.current.prompting).toBe(false);
      session.playNext(`clip-${i}`);
      play();
    }

    // Half a minute into the fourth, the accumulated five minutes is up.
    advance(30 * 1000);
    expect(session.api.current.prompting).toBe(true);
  });

  it('draws a fresh window after the check is answered', () => {
    play();
    advance(WINDOW_AT(0.5));
    expect(session.api.current.prompting).toBe(true);

    ReactTestRenderer.act(() => session.api.current.confirmPresence());
    expect(session.api.current.prompting).toBe(false);

    advance(WINDOW_AT(0.5) - 1000);
    expect(session.api.current.prompting).toBe(false);
    advance(2000);
    expect(session.api.current.prompting).toBe(true);
    expect(missed).not.toHaveBeenCalled();
  });

  it('treats typing a note as an answer, mid-prompt', () => {
    play();
    advance(WINDOW_AT(0.5));
    expect(session.api.current.prompting).toBe(true);

    ReactTestRenderer.act(() => session.api.current.onPresenceSignal());
    expect(session.api.current.prompting).toBe(false);

    // And the grace timer is gone with it, rather than still running to pause
    // a lecture the person is demonstrably sat writing notes about.
    advance(CHECK_GRACE_MS + 1000);
    expect(missed).not.toHaveBeenCalled();
  });

  it('pausing while the prompt is up forfeits the remainder', () => {
    // Stopping playback while being asked is itself an answer, and no watch
    // time can accrue meanwhile - so resuming gets a whole new window rather
    // than a prompt that reappears immediately.
    play();
    advance(WINDOW_AT(0.5));
    expect(session.api.current.prompting).toBe(true);

    pause();
    play();
    advance(RESUME_FLOOR + 1000);
    expect(session.api.current.prompting).toBe(false);
    expect(missed).not.toHaveBeenCalled();

    advance(WINDOW_AT(0.5));
    expect(session.api.current.prompting).toBe(true);
  });
});

// Mirrors RESUME_MIN_MS in useFocusSession; not exported, so kept in step here.
const RESUME_FLOOR = 10 * 1000;
