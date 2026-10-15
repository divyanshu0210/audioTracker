// VersePanel.jsx
//
// What was recognised, under the player.
//
// Two states, because the two moments want different things. While a verse is
// being recited and explained, what is wanted is the verse itself - the
// transliteration, large enough to follow along with. Afterwards, the
// translation and the Devanagari, and those only when asked for: a translation
// permanently occupying a third of the screen under a video is a worse deal
// than it sounds.
//
// The history list is the part that turns out to matter most. A recognised
// verse is stamped with the position it was heard at, so a lecture nobody
// indexed acquires a table of contents as it plays - and every entry is a seek.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useShallow} from 'zustand/react/shallow';

import useVerseStore from './useVerseStore';
import {fetchPurport, mayHavePurport} from './purport';

// The panel takes what is left of the screen below the player, and no more.
//
// Nothing here has a fixed height, and the earlier attempt to give it one was
// working around the wrong problem. Heights were fractions of the window,
// guessed so the panel would fit under a player whose own height animates -
// which meant they were wrong at both ends: too short on a tall phone with an
// audio-only player, still too tall when the video was full size.
//
// Now it simply shrinks. The wrapper in BacePlayer is flexShrink, this is
// flexShrink, and the scrolling body inside is too, so the whole thing sizes to
// its content until there is no more room and then scrolls. A short verse gets
// a short panel; a long one with a translation gets everything down to the
// bottom of the screen.
//
// The header stays outside the scrolling area, so dismiss and expand can never
// scroll out of reach.
const {height: SCREEN} = Dimensions.get('window');

// The one thing still capped. The debug block is a diagnostic, not the point of
// the panel, and left to itself it will happily push the verse off the top.
const MAX_DEBUG = Math.min(130, Math.round(SCREEN * 0.16));
const PANEL_SETTINGS_KEY = 'verse-panel-settings-v1';

/**
 * Whether a line is actually in Devanagari.
 *
 * The corpus field is called `devanagari`, but it holds whatever script the
 * source printed - and Caitanya-caritamrta is printed in Bengali. So every CC
 * verse carried a Bengali block, which is not what anyone reading along wants
 * under a Sanskrit panel.
 *
 * Counted rather than tested for presence, because a CC line typically has one
 * stray Devanagari codepoint among seventy Bengali ones - a plain
 * `/[ऀ-ॿ]/.test()` says yes to every one of them.
 */
const isDevanagari = line => {
  const devanagari = (line.match(/[ऀ-ॿ]/g) || []).length;
  const other = (line.match(/[ঀ-৿]/g) || []).length;
  return devanagari > other;
};

const formatPosition = seconds => {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
};

const VersePanel = ({
  onSeek,
  playbackStarted = true,
  isPaused = false,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showTextSettings, setShowTextSettings] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const [panelTheme, setPanelTheme] = useState('dark');
  const [panelSettingsReady, setPanelSettingsReady] = useState(false);
  const isLightPanel = panelTheme === 'light';

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(PANEL_SETTINGS_KEY)
      .then(raw => {
        if (!active || !raw) return;
        try {
          const saved = JSON.parse(raw);
          if (saved.theme === 'light' || saved.theme === 'dark') {
            setPanelTheme(saved.theme);
          }
          if (Number.isFinite(saved.fontScale)) {
            setFontScale(Math.min(1.3, Math.max(0.8, saved.fontScale)));
          }
        } catch (_) {
          // Ignore malformed settings and keep the defaults.
        }
      })
      .finally(() => {
        if (active) setPanelSettingsReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!panelSettingsReady) return;
    AsyncStorage.setItem(
      PANEL_SETTINGS_KEY,
      JSON.stringify({theme: panelTheme, fontScale}),
    ).catch(() => {});
  }, [fontScale, panelSettingsReady, panelTheme]);
  const [showHistory, setShowHistory] = useState(false);
  const [songScript, setSongScript] = useState('devanagari');
  const [viewedHistoryKey, setViewedHistoryKey] = useState(null);
  const [acknowledgedNewestKey, setAcknowledgedNewestKey] = useState(null);

  // The purport is fetched rather than bundled - see purport.js - so it has
  // three states the panel has to tell apart: not asked for, fetching, and
  // fetched-but-empty. The last is ordinary; plenty of verses have no purport.
  const [purport, setPurport] = useState(null);
  const [purportState, setPurportState] = useState('idle');

  // One subscription rather than several: this sits under a player that is
  // already re-rendering on progress, and should not add to that.
  const {
    enabled, started, listening, unavailable, detectedCurrent, history, followLine, expected,
    debug, heardCount, lastHeard, lastConfidence, candidates, why,
  } = useVerseStore(
    useShallow(state => ({
      enabled: state.enabled,
      started: state.started,
      expected: state.expected,
      followLine: state.followLine,
      listening: state.listening,
      unavailable: state.unavailable,
      lastConfidence: state.lastConfidence,
      why: state.why,
      detectedCurrent: state.current,
      history: state.history,
      debug: state.debug,
      heardCount: state.heardCount,
      lastHeard: state.lastHeard,
      candidates: state.candidates,
    })),
  );

  const rate = useVerseStore(state => state.rate);
  const showFromHistory = useVerseStore(state => state.showFromHistory);

  // Keep an older entry on screen when new recognition results arrive. The
  // store's current record can continue advancing in the background; this is
  // only a display selection until the user taps the New button.
  const current = useMemo(
    () =>
      viewedHistoryKey
        ? history.find(entry => entry.key === viewedHistoryKey) || detectedCurrent
        : detectedCurrent,
    [detectedCurrent, history, viewedHistoryKey],
  );

  useEffect(() => {
    if (
      viewedHistoryKey &&
      !history.some(entry => entry.key === viewedHistoryKey)
    ) {
      setViewedHistoryKey(null);
    }
  }, [history, viewedHistoryKey]);

  const currentId = current?.id;

  // Bringing the marked line into view.
  //
  // Without this the marker is only useful for songs short enough to fit,
  // and the songs worth following are the long ones - Bhaja Bhakata Vatsala
  // is thirty-five lines, and the panel shows about eight.
  const bodyRef = useRef(null);
  // line index -> its offset inside the scroll content, filled in by onLayout.
  const lineTops = useRef([]);
  // When the person last dragged the panel themselves.
  const draggedAt = useRef(0);

  useEffect(() => {
    lineTops.current = [];
    setSongScript('devanagari');
  }, [currentId]);

  useEffect(() => {
    if (followLine === null || followLine === undefined) return;
    const y = lineTops.current[followLine];
    if (y === undefined) return;
    // Somebody who has just scrolled is reading something, quite possibly the
    // translation further down. Yanking them back to the marker every few
    // seconds would make the panel unusable for the one thing people do with
    // it by hand, so the follower yields for a while after any drag.
    if (Date.now() - draggedAt.current < 8000) return;
    // A little above the line rather than flush to the top, so there is
    // somewhere for the eye to have come from.
    bodyRef.current?.scrollTo({y: Math.max(0, y - 28), animated: true});
  }, [followLine, currentId]);

  // A new verse is a new purport. Cleared rather than left showing, because the
  // one thing worse than no purport is the previous verse's.
  useEffect(() => {
    setPurport(null);
    setPurportState('idle');
  }, [currentId]);

  const loadPurport = useCallback(async () => {
    if (!currentId) return;
    setPurportState('loading');
    try {
      const text = await fetchPurport(currentId);
      setPurport(text);
      setPurportState('done');
    } catch (err) {
      setPurportState('failed');
    }
  }, [currentId]);

  /**
   * Read a verse again, without disturbing what is playing.
   *
   * The two halves of a history row do different things on purpose. Wanting to
   * re-read a verse is far more common than wanting to hear it again, and
   * having every tap jump the audio made the list dangerous to browse - one
   * mis-tap and the lecture was somewhere else.
   *
   * Going back to a verse at all is the strongest evidence the match was right,
   * and it costs nobody anything to give. See feedback.js.
   */
  const handleShow = useCallback(
    entry => {
      // Show the one that was asked for, not whichever was matched last.
      showFromHistory(entry);
      setViewedHistoryKey(entry.key || null);
      setShowHistory(false);
    },
    [showFromHistory],
  );

  /** The timestamp, which is the part that moves the audio. */
  const handleJump = useCallback(
    entry => {
      handleShow(entry);
      onSeek?.(entry.at);
    },
    [handleShow, onSeek],
  );

  // Keep the table of contents in media-time order. Detection order is not
  // playback order after somebody seeks back and hears another verse.
  const recent = useMemo(
    () =>
      history
        .map((entry, index) => ({entry, index}))
        .sort(
          (a, b) =>
            (b.entry.at || 0) - (a.entry.at || 0) ||
            (b.entry.heardAt || 0) - (a.entry.heardAt || 0) ||
            b.index - a.index,
        )
        .map(({entry}) => entry),
    [history],
  );

  const currentHistoryIndex = useMemo(
    () => recent.findIndex(entry => entry.key === current?.key),
    [recent, current?.key],
  );

  const navigateHistory = useCallback(
    direction => {
      if (currentHistoryIndex < 0) return;
      const target = recent[currentHistoryIndex + direction];
      if (target) handleShow(target);
    },
    [currentHistoryIndex, handleShow, recent],
  );

  const newestEntry = recent[0];
  useEffect(() => {
    // When following the newest entry normally, it is already seen. Keep the
    // marker unchanged while an older entry is pinned so a later detection can
    // surface the New button.
    if (
      !viewedHistoryKey &&
      newestEntry?.key &&
      newestEntry.key !== acknowledgedNewestKey
    ) {
      setAcknowledgedNewestKey(newestEntry.key);
    }
  }, [acknowledgedNewestKey, newestEntry?.key, viewedHistoryKey]);

  const hasNewerEntry =
    !!viewedHistoryKey &&
    !!newestEntry &&
    newestEntry.key !== acknowledgedNewestKey;

  const showNewestEntry = useCallback(() => {
    if (!newestEntry) return;
    setViewedHistoryKey(null);
    setAcknowledgedNewestKey(newestEntry.key);
    showFromHistory(newestEntry);
  }, [newestEntry, showFromHistory]);

  // Line index -> the name of the prayer starting there.
  //
  // Only the pranama mantras have these. They are one sequence recited in one
  // order, so the corpus holds them as one record rather than seventeen - see
  // combine_prayers in songbook.py - and without their names it would be sixty
  // lines of undifferentiated Sanskrit.
  //
  // The names are not lines of the record and are not drawn as lines. Nothing
  // sings them, so they are not in the phonetic stream, and the marker can
  // never come to rest on one.
  //
  // Up here with the other hooks, and reading `current` defensively, because
  // there are three early returns below this point - no panel, no recogniser,
  // nothing matched yet - and a hook underneath any of them runs on some
  // renders and not others. React counts hooks per render and fails the whole
  // tree when the count changes.
  const sectionAt = useMemo(() => {
    const byLine = {};
    for (const section of current?.sections || []) byLine[section.at] = section.title;
    return byLine;
  }, [current]);

  /**
   * What the recogniser is actually producing.
   *
   * The only view that tells three very different failures apart when the panel
   * stays empty: nothing reaching the recogniser (the count stays at zero), the
   * recogniser returning nonsense (the text is gibberish), or the matcher
   * refusing something reasonable (the text looks right, the candidates are
   * close but under threshold).
   */
  const debugBlock = debug ? (
    <ScrollView
      style={styles.debug}
      contentContainerStyle={styles.debugContent}
      nestedScrollEnabled
      persistentScrollbar>
      {/* conf is the number to watch when tuning MIN_CONFIDENCE: compare what
          a real recitation scores against what the commentary between verses
          scores, and put the threshold between them. */}
      <Text style={styles.debugMeta}>
        {heardCount} heard · {listening ? 'live' : 'idle'} · conf{' '}
        {lastConfidence ? lastConfidence.toFixed(2) : '—'}
      </Text>
      <Text style={styles.debugText} numberOfLines={3}>
        {lastHeard || '(nothing yet)'}
      </Text>

      {/* Why nothing is on screen. The candidates below clear the display
          gates only, so one can look unanswerable there and still be refused -
          this is the line that says which gate did it. */}
      {!!why && (
        <Text style={styles.debugWhy} numberOfLines={2}>
          {why}
        </Text>
      )}
      {candidates.length > 0 ? (
        candidates.map(c => (
          <Text key={c.ref} style={styles.debugText}>
            {c.runChars}ch {Math.round((c.solidRatio || 0) * 100)}% s
            {Math.round(c.score || 0)} {c.ref}
          </Text>
        ))
      ) : (
        <Text style={styles.debugText}>(no candidates)</Text>
      )}

    </ScrollView>
  ) : null;

  /**
   * Everything heard so far, newest first.
   *
   * Held as an element rather than written where it is used, because both
   * states need it. Dismissing a verse leaves the panel with nothing on screen
   * and the list is still worth reaching - it is the table of contents for the
   * whole recording, and the thing somebody dismissed was one line of it.
   */
  const historyList = (
      <ScrollView
        style={styles.historyList}
        nestedScrollEnabled
        persistentScrollbar>
        {/* What the recording is called, before anything has been heard.
            
            It sits in the list rather than on screen as a match, and it is
            labelled rather than timed, because it is not a moment in the
            recording - it is a thing known about the whole of it. Everything
            below it was actually heard, and has a time to prove it. */}
        {!!expected && (
          <View style={[styles.historyRow, styles.expectedRow]}>
            <Text style={styles.expectedTag}>title</Text>
            <Text style={styles.historyRef} numberOfLines={1}>
              {expected.ref}
            </Text>
          </View>
        )}
        {recent.map((entry, i) => (
          <View
            key={entry.key || `${entry.id}-${entry.heardAt}-${i}`}
            style={styles.historyRow}>
            {/* Two targets, not one. The time moves the lecture; the verse
                only brings it back on screen. */}
            <TouchableOpacity
              onPress={() => handleJump(entry)}
              hitSlop={{top: 8, bottom: 8, left: 6, right: 6}}
              accessibilityRole="button"
              accessibilityLabel={`Play from ${formatPosition(entry.at)}`}>
              <Text style={styles.historyTime}>
                {formatPosition(entry.at)}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.historyRefBtn}
              onPress={() => handleShow(entry)}
              accessibilityRole="button"
              accessibilityLabel={`Show ${entry.ref}`}>
              <Text style={styles.historyRef} numberOfLines={1}>
                {entry.kind === 'song' ? entry.title || entry.ref : entry.ref}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
  );

  // Recognition can already be warming up in the background. Keep its
  // preparation state out of the layout until playback has actually produced
  // a clock update; real failures remain visible so the user can act on them.
  if (!playbackStarted && !current && !unavailable) return null;
  if (!enabled && !current && !unavailable) return null;

  const errorBanner = unavailable ? (
    <View style={styles.errorNotice}>
      <Icon name="info-outline" size={16} color={C.muted} />
      <Text style={styles.quietText} numberOfLines={2}>
        {unavailable}
      </Text>
    </View>
  ) : null;

  if (!current && unavailable) {
    return (
      <View style={[styles.container, styles.quiet]}>
        {errorBanner}
        {debugBlock}
      </View>
    );
  }

  // Listening, but nothing recognised yet. Deliberately not blank: somebody
  // switched this on and is owed evidence that it is running, and a whole
  // lecture can pass before the first verse.
  // Nothing on screen: either nothing has been heard yet, or the last thing
  // was dismissed. The history outlives both, so it stays reachable - losing a
  // recording's whole table of contents by closing one verse is not a thing
  // anybody means to do.
  if (!current) {
    if (showHistory && (recent.length > 0 || expected)) {
      return (
        <View style={styles.container}>
          {errorBanner}
          <View style={styles.header}>
            {/* Only "heard" if something was. Opened before anything has
                matched, the single row in this list is the recording's own
                name, which nobody heard. */}
            <Text style={styles.ref}>
              {recent.length > 0 ? 'Heard so far' : 'This recording'}
            </Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => setShowHistory(false)}
                style={styles.iconBtn}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                accessibilityRole="button"
                accessibilityLabel="Close the list">
                <Icon name="close" size={18} color={C.muted} />
              </TouchableOpacity>
            </View>
          </View>
          {historyList}
          {debugBlock}
        </View>
      );
    }

    return (
      <View style={[styles.container, styles.quiet]}>
        {errorBanner}
        {listening ? (
          <>
            <View style={styles.pulse} />
            <Text style={styles.quietText}>
              {expected
                ? `Listening for ${expected.ref}`
                : 'Listening — verses and songs will appear here'}
            </Text>
          </>
        ) : started && isPaused ? (
          <>
            <Icon name="pause-circle-outline" size={16} color={C.muted} />
            <Text style={styles.quietText}>
              Paused — listening resumes when playback continues
            </Text>
          </>
        ) : (
          <>
            <ActivityIndicator size="small" color={C.muted} />
            <Text style={styles.quietText}>Starting to listen…</Text>
          </>
        )}

        {/* The way back to what was already heard. Without it, dismissing a
            verse strands the list until the next one happens to match.

            Also the way *in*, before anything has been heard at all, when the
            recording's name has already said which song this is. That case
            used to be unreachable: the list held something worth seeing from
            the first second and nothing offered to open it. */}
        {(recent.length > 0 || !!expected) && (
          <TouchableOpacity
            onPress={() => setShowHistory(true)}
            style={styles.quietHistory}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            accessibilityRole="button"
            accessibilityLabel={
              recent.length > 0
                ? `${recent.length} verses heard so far`
                : `Expecting ${expected.ref}`
            }>
            <Icon name="list" size={16} color={C.body} />
            {recent.length > 0 && (
              <Text style={styles.count}>{recent.length}</Text>
            )}
          </TouchableOpacity>
        )}

        {debugBlock}
      </View>
    );
  }

  const isSong = current.kind === 'song';

  // Corpus records may store one script string or an array of script lines.
  // Normalize both shapes before filtering so older/generated shards cannot
  // make the panel call .filter on a string.
  const devanagari = Array.isArray(current.devanagari)
    ? current.devanagari
    : current.devanagari
    ? String(current.devanagari).split(/\r?\n/)
    : [];
  const script = devanagari.filter(isDevanagari);
  const showDevanagari = !isSong || songScript === 'devanagari';
  const showLatin = !isSong || songScript === 'latin';

  return (
    <View style={styles.panelRoot}>
      {errorBanner && <View style={styles.externalStatus}>{errorBanner}</View>}
      {started && isPaused && (
        <View style={styles.externalStatus}>
          <View style={styles.pausedNotice}>
            <Icon name="pause-circle-outline" size={15} color={C.muted} />
            <Text style={styles.pausedNoticeText}>
              Paused — listening resumes when playback continues
            </Text>
          </View>
        </View>
      )}
      <View
        style={[
          styles.container,
          expanded && styles.containerExpanded,
          isLightPanel && styles.lightContainer,
        ]}>
      <View style={styles.header}>
        {listening && <View style={styles.pulse} />}

        <Text style={[styles.ref, isLightPanel && styles.lightText]} numberOfLines={1}>
          {isSong ? current.title || current.ref : current.ref}
        </Text>

        {/* Where it came from. A verse from the title is only what the
            recording is *about*; one the lecturer named is a statement; one
            matched from the sound is the only kind that can be wrong. */}
        <Text style={[styles.source, isLightPanel && styles.lightMutedText]}>
          {current.source === 'title'
            ? 'from title'
            : current.source === 'cited'
            ? 'cited'
            : 'heard'}
        </Text>

        <View style={styles.headerActions}>
          {hasNewerEntry && (
            <TouchableOpacity
              onPress={showNewestEntry}
              style={styles.newVerseButton}
              hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}
              accessibilityRole="button"
              accessibilityLabel="Show newly detected verse">
              <Icon name="auto-awesome" size={13} color="#fff" />
              <Text style={styles.newVerseText}>New</Text>
            </TouchableOpacity>
          )}

          {recent.length > 1 && currentHistoryIndex >= 0 && (
            <View style={styles.historyNav}>
              <TouchableOpacity
                onPress={() => navigateHistory(-1)}
                disabled={currentHistoryIndex <= 0}
                style={[styles.iconBtn, styles.historyArrow]}
                hitSlop={{top: 10, bottom: 10, left: 8, right: 8}}
                accessibilityRole="button"
                accessibilityLabel="Show newer verse">
                <Icon
                  name="chevron-left"
                  size={18}
                  color={
                    currentHistoryIndex <= 0
                      ? C.faint
                      : C.body
                  }
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowHistory(v => !v)}
                style={styles.historyListControl}
                hitSlop={{top: 8, bottom: 8, left: 6, right: 6}}
                accessibilityRole="button"
                accessibilityLabel={`${currentHistoryIndex + 1} of ${recent.length} verses; open history`}>
                <Text style={styles.historyListPosition}>
                  {currentHistoryIndex + 1}/{recent.length}
                </Text>
                <Icon name="list" size={15} color={C.body} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigateHistory(1)}
                disabled={currentHistoryIndex >= recent.length - 1}
                style={[styles.iconBtn, styles.historyArrow]}
                hitSlop={{top: 10, bottom: 10, left: 8, right: 8}}
                accessibilityRole="button"
                accessibilityLabel="Show older verse">
                <Icon
                  name="chevron-right"
                  size={18}
                  color={
                    currentHistoryIndex >= recent.length - 1
                      ? C.faint
                      : C.body
                  }
                />
              </TouchableOpacity>
            </View>
          )}

          {isSong && script.length > 0 && current.lines?.length > 0 && (
            <TouchableOpacity
              onPress={() =>
                setSongScript(mode =>
                  mode === 'devanagari' ? 'latin' : 'devanagari',
                )
              }
              style={styles.scriptToggle}
              accessibilityRole="button"
              accessibilityLabel="Switch song script"
              accessibilityHint={
                songScript === 'devanagari'
                  ? 'Show the Latin transliteration'
                  : 'Show the Devanagari text'
              }>
              <Text style={styles.scriptToggleText}>
                {songScript === 'devanagari' ? 'En' : 'Hi'}
              </Text>
            </TouchableOpacity>
          )}

        </View>
      </View>

      {showHistory ? (
        historyList
      ) : (
        <ScrollView
          ref={bodyRef}
          style={styles.body}
          nestedScrollEnabled
          onScrollBeginDrag={() => {
            draggedAt.current = Date.now();
          }}
          persistentScrollbar>
          {/* Devanagari above, transliteration below, the way the printed
              editions set it - and the way anyone who reads the script expects
              to find it. It used to be hidden behind the expand control, which
              made the script the verse is actually written in the one thing you
              had to ask for.

              Songs are the exception rather than an oversight: most of kksongs
              carries no Devanagari at all, and a bhajan is sung from the
              transliteration anyway. Absent, this renders nothing and the
              transliteration simply sits at the top. */}
          {script.length > 0 && (
            <View>
              {showDevanagari && (
                <View style={styles.devanagariBlock}>
                  {script.map((line, i) =>
                    isSong ? (
                      <React.Fragment key={i}>
                        {!!sectionAt[i] && (
                          <Text style={[styles.prayerName, isLightPanel && styles.lightMutedText]}>{sectionAt[i]}</Text>
                        )}
                        <View
                          onLayout={e => {
                            lineTops.current[i] = e.nativeEvent.layout.y;
                          }}
                          style={[styles.lineRow, i === followLine && styles.lineRowHere]}>
                          <Text
                            style={[
                              styles.devanagari,
                              isLightPanel && styles.lightText,
                              {fontSize: 14 * fontScale, lineHeight: 22 * fontScale},
                              i === followLine && styles.lineHere,
                            ]}>
                            {line}
                          </Text>
                        </View>
                      </React.Fragment>
                    ) : (
                      <Text
                        key={i}
                        style={[
                          styles.devanagari,
                          isLightPanel && styles.lightText,
                          {fontSize: 14 * fontScale, lineHeight: 22 * fontScale},
                        ]}>
                        {line}
                      </Text>
                    ),
                  )}
                </View>
              )}
            </View>
          )}

          {/* The line being sung, marked while it is known.

              A bhajan runs for minutes and the panel used to show all of it at
              once with no indication of where in it anybody was - which for a
              song, unlike a verse, is most of the question. The bar is drawn on
              every line and only coloured on one, so nothing moves when the
              place changes; the text shifting sideways under a marker that
              appears and disappears is worse than no marker.

              followLine is null whenever the place is not known, which includes
              every verse - so this renders exactly as it did before for them. */}
          {showLatin && current.lines?.map((line, i) => (
            <React.Fragment key={i}>
              {!!sectionAt[i] && (
                <Text style={[styles.prayerName, isLightPanel && styles.lightMutedText]}>{sectionAt[i]}</Text>
              )}
              <View
                onLayout={e => {
                  lineTops.current[i] = e.nativeEvent.layout.y;
                }}
                style={[styles.lineRow, i === followLine && styles.lineRowHere]}>
                <Text
                  style={[
                    styles.line,
                    isLightPanel && styles.lightText,
                    {fontSize: 12.5 * fontScale, lineHeight: 19 * fontScale},
                    i === followLine && styles.lineHere,
                  ]}>
                  {line}
                </Text>
              </View>
            </React.Fragment>
          ))}

          {expanded && (
            <>
              {!!current.translation && (
                <View style={styles.section}>
                  <Text style={[styles.sectionLabel, isLightPanel && styles.lightMutedText]}>Translation</Text>
                  <Text
                    style={[
                      styles.translation,
                      isLightPanel && styles.lightBodyText,
                      {fontSize: 12 * fontScale, lineHeight: 18 * fontScale},
                    ]}>
                    {current.translation}
                  </Text>
                  {/* Only where the translation is not Prabhupada's - see the
                      note in tools/verse-corpus/sources/sbCompletion.js. */}
                  {!!current.translator && (
                    <Text style={[styles.translator, isLightPanel && styles.lightMutedText]}>{current.translator}</Text>
                  )}
                </View>
              )}

              {/* Fetched on the tap, not with the verse. A purport is five
                  hundred to fifteen hundred words and nobody reads one while a
                  lecture is playing - so it costs a tap, and the bundled
                  corpus stays small enough to ship. */}
              {mayHavePurport(current.id) && (
                <View style={styles.section}>
                  <Text style={[styles.sectionLabel, isLightPanel && styles.lightMutedText]}>Purport</Text>

                  {purportState === 'idle' && (
                    <TouchableOpacity
                      onPress={loadPurport}
                      style={styles.purportAction}
                      accessibilityRole="button">
                      <Icon name="menu-book" size={14} color={C.accent} />
                      <Text style={styles.purportActionText}>
                        Read Srila Prabhupada's purport
                      </Text>
                    </TouchableOpacity>
                  )}

                  {purportState === 'loading' && (
                    <View style={styles.purportAction}>
                      <ActivityIndicator size="small" color={C.muted} />
                      <Text style={styles.purportActionText}>Opening..</Text>
                    </View>
                  )}

                  {purportState === 'failed' && (
                    <TouchableOpacity
                      onPress={loadPurport}
                      style={styles.purportAction}
                      accessibilityRole="button">
                      <Icon name="refresh" size={14} color={C.muted} />
                      <Text style={styles.purportActionText}>
                        Could not fetch it — tap to try again
                      </Text>
                    </TouchableOpacity>
                  )}

                  {purportState === 'done' &&
                    (purport ? (
                      <Text
                        style={[
                          styles.purport,
                          isLightPanel && styles.lightBodyText,
                          {fontSize: 12 * fontScale, lineHeight: 19 * fontScale},
                        ]}>
                        {purport}
                      </Text>
                    ) : (
                      <Text style={styles.purportActionText}>
                        No purport for this verse.
                      </Text>
                    ))}
                </View>
              )}

              {current.alsoIn?.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Also found at</Text>
                  <Text style={styles.alsoIn}>{current.alsoIn.join(' · ')}</Text>
                </View>
              )}

              {isSong && (current.author || current.bookName) && (
                <Text style={styles.attribution}>
                  {[current.author, current.bookName].filter(Boolean).join(' · ')}
                </Text>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* Under the verse rather than up in the header, and labelled.

          Both controls used to be icons in the header row, beside the history
          and the dismiss, where they said nothing about themselves: a bare
          chevron does not read as "translation", and two bare thumbs do not
          say what is being judged. The header now carries only what the panel
          *is* - the reference, where it came from, and how to get rid of it.

          Here is where the eye arrives, having just read the verse, and both
          questions belong at that moment: do you want more of this, and was it
          the right one. */}
      {!showHistory && (
        <View style={styles.footer}>
          <TouchableOpacity
            onPress={() => setExpanded(v => !v)}
            style={styles.footerAction}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            accessibilityRole="button">
            <Icon
              name={expanded ? 'expand-less' : 'expand-more'}
              size={16}
              color={isLightPanel ? '#475569' : C.body}
            />
           
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setShowTextSettings(value => !value)}
            style={[styles.footerAction, styles.textSizeIcon]}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            accessibilityRole="button"
            accessibilityLabel="Adjust verse text size"
            accessibilityState={{expanded: showTextSettings}}>
            <Icon
              name="settings"
              size={16}
              color={isLightPanel ? '#475569' : C.body}
            />
          </TouchableOpacity>

          {showTextSettings && (
            <View style={[styles.textSizeControls, styles.textSizeFloating]}>
              <TouchableOpacity
                onPress={() => setPanelTheme(value => value === 'dark' ? 'light' : 'dark')}
                style={styles.textSizeButton}
                accessibilityRole="button"
                accessibilityLabel="Switch verse panel theme">
                <Icon
                  name={isLightPanel ? 'dark-mode' : 'light-mode'}
                  size={14}
                  color={isLightPanel ? '#475569' : C.body}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFontScale(value => Math.max(0.8, value - 0.1))}
                style={styles.textSizeButton}
                accessibilityRole="button"
                accessibilityLabel="Decrease verse text size">
                <Text style={[styles.textSizeButtonText, isLightPanel && styles.lightBodyText]}>A−</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFontScale(value => Math.min(1.3, value + 0.1))}
                style={styles.textSizeButton}
                accessibilityRole="button"
                accessibilityLabel="Increase verse text size">
                <Text style={[styles.textSizeButtonText, isLightPanel && styles.lightBodyText]}>A+</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Only for something matched from the sound. A verse named in the
              title, or a citation read out loud, was not a judgement the
              matcher made - asking about those would collect answers that no
              threshold controls.

              Asked once. Having answered, what is left is a record of what was
              said rather than a control to keep fiddling with. */}
          {current.source === 'heard' && (
            <View style={styles.rateGroup}>
              {current.rated ? (
                <>
                  <Icon
                    name={current.rated === 'right' ? 'thumb-up' : 'thumb-down'}
                    size={13}
                    color={C.faint}
                  />
                  <Text style={styles.rateThanks}>Thanks</Text>
                </>
              ) : (
                <>
                  <Text style={styles.rateLabel}>Right verse?</Text>
                  <TouchableOpacity
                    onPress={() => rate('right')}
                    style={styles.rateBtn}
                    hitSlop={{top: 10, bottom: 10, left: 6, right: 6}}
                    accessibilityRole="button"
                    accessibilityLabel="Yes, this is the right verse">
                    <Icon name="thumb-up-off-alt" size={15} color={C.muted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => rate('wrong')}
                    style={styles.rateBtn}
                    hitSlop={{top: 10, bottom: 10, left: 6, right: 6}}
                    accessibilityRole="button"
                    accessibilityLabel="No, this is the wrong verse">
                    <Icon name="thumb-down-off-alt" size={15} color={C.muted} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>
      )}

      {debugBlock}
      </View>
    </View>
  );
};

// The player's own palette, named.
//
// Slate, matching the dark chrome around it rather than trying to stand apart
// from it. Two alternatives were tried in place and both were worse: warm
// ink-and-saffron read as a different app under a video, and a deep teal that
// looked right in the abstract did not survive being on the screen. Matching
// the player turns out to be the point rather than the compromise.
//
// Named because the values repeat - `faint` alone is on five things - and a
// panel whose colours are scattered hex is one where changing the label grey
// means finding all five.
const C = {
  surface: '#1e293b',
  border: '#334155',
  heading: '#f8fafc',
  script: '#f1f5f9',
  verse: '#e2e8f0',
  body: '#cbd5e1',
  muted: '#94a3b8',
  faint: '#64748b',
  live: '#4ade80',
  accent: '#38bdf8',
};

const styles = StyleSheet.create({
  panelRoot: {
    flexShrink: 1,
  },
  container: {
    backgroundColor: C.surface,
    // Shrinks into whatever room is left below the player; see the note at the
    // top of the file.
    flexShrink: 1,
    borderRadius: 8,
    marginHorizontal: 10,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  containerExpanded: {
    // Let short expanded content keep its natural height, but bound long
    // translations/purports so the body can scroll within the viewport.
    maxHeight: Math.round(SCREEN * 0.65),
  },
  lightContainer: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderWidth: StyleSheet.hairlineWidth,
  },
  lightText: {
    color: '#1e293b',
  },
  lightBodyText: {
    color: '#334155',
  },
  lightMutedText: {
    color: '#64748b',
  },
  quiet: {
    // Wraps so the debug block sits under the line rather than beside it.
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  quietText: {
    color: C.muted,
    fontSize: 12,
    flexShrink: 1,
  },
  externalStatus: {
    marginHorizontal: 10,
    marginTop: 8,
  },
  pausedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
    // paddingHorizontal: 2,
  },
  pausedNoticeText: {
    fontSize: 11,
  },
  errorNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    // marginBottom: 8,
  },
  // A filled dot rather than a spinner: this is on for a whole lecture, and
  // something that spins for an hour reads as "stuck", not "working".
  pulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.live,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ref: {
    color: C.heading,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  source: {
    color: C.faint,
    fontSize: 11,
  },
  footer: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  footerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  textSizeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 4,
  },
  textSizeIcon: {
    position: 'absolute',
    right: 0,
  },
  textSizeFloating: {
    position: 'absolute',
    right: 26,
    bottom: 0,
    marginLeft: 0,
  },
  textSizeButton: {
    minWidth: 26,
    paddingHorizontal: 5,
    paddingVertical: 2,
    alignItems: 'center',
    borderRadius: 4,
    backgroundColor: 'rgba(148, 163, 184, 0.16)',
  },
  textSizeButtonText: {
    color: C.body,
    fontSize: 11,
    fontWeight: '600',
  },
  footerLabel: {
    color: C.body,
    fontSize: 11,
  },
  rateGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    // Pushed to the far end, so the question is never mistaken for a caption
    // on the control beside it.
    marginLeft: 'auto',
  },
  rateLabel: {
    color: C.faint,
    fontSize: 11,
  },
  rateThanks: {
    color: C.faint,
    fontSize: 11,
  },
  rateBtn: {
    paddingHorizontal: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    // Holds the right edge of the header. This briefly lived on the rating
    // group instead, back when the thumbs sat up here and took the end of the
    // row - and when they moved down to the footer they took the alignment
    // with them, leaving the list and the dismiss bunched against the source
    // label in the middle of the row.
    marginLeft: 'auto',
    gap: 4,
  },
  historyNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginRight: 4,
  },
  historyArrow: {
    minWidth: 26,
    paddingHorizontal: 5,
    justifyContent: 'center',
  },
  historyListControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(148, 163, 184, 0.14)',
  },
  historyListPosition: {
    color: C.body,
    fontSize: 11,
    fontWeight: '600',
    minWidth: 26,
    textAlign: 'center',
  },
  newVerseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: '#7c3aed',
  },
  newVerseText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  iconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  count: {
    color: C.body,
    fontSize: 11,
    marginLeft: 2,
  },
  body: {
    marginTop: 6,
    // The expanded container supplies a maximum only when needed; otherwise
    // this keeps the panel at its natural content height.
    flexShrink: 1,
  },
  // The verse itself, and the one size that matters: a lecturer recites
  // faster than this can be read, so more of it on screen at once beats a
  // larger face. The line height stays generous relative to the size -
  // diacritics sit above and below these letters and crowd at a tight leading.
  prayerName: {
    color: C.faint,
    fontSize: 10.5,
    letterSpacing: 0.4,
    marginTop: 9,
    marginBottom: 2,
  },
  lineRow: {
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
    paddingLeft: 6,
  },
  lineRowHere: {
    borderLeftColor: C.accent,
    backgroundColor: 'rgba(56, 189, 248, 0.10)',
  },
  line: {
    color: C.verse,
    fontSize: 12.5,
    lineHeight: 19,
    fontStyle: 'italic',
  },
  lineHere: {
    color: C.heading,
    fontStyle: 'normal',
  },
  section: {
    marginTop: 10,
  },
  sectionLabel: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  scriptToggle: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(148, 163, 184, 0.16)',
    marginRight: 2,
  },
  scriptToggleText: {
    color: C.accent,
    fontSize: 11,
  },
  devanagariBlock: {
    marginBottom: 6,
  },
  devanagari: {
    color: C.script,
    // Larger than the transliteration even after shrinking, because the matras
    // and conjuncts stop being distinguishable before Latin text does.
    fontSize: 14,
    lineHeight: 22,
  },
  translation: {
    color: C.body,
    fontSize: 12,
    lineHeight: 18,
  },
  purportAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  purportActionText: {
    color: C.muted,
    fontSize: 12,
  },
  purport: {
    color: C.body,
    fontSize: 12,
    lineHeight: 19,
  },
  translator: {
    color: C.faint,
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 5,
  },
  alsoIn: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  attribution: {
    color: C.faint,
    fontSize: 11,
    marginTop: 8,
  },
  historyList: {
    marginTop: 6,
    flexShrink: 1,
  },
  expectedRow: {
    // Set apart from the heard entries, because it is a different kind of
    // claim: this one is what the file is called, not what anybody sang.
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingBottom: 6,
    marginBottom: 2,
  },
  expectedTag: {
    color: C.faint,
    fontSize: 9.5,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    width: 42,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  quietHistory: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: 'auto',
  },
  historyRefBtn: {
    flexShrink: 1,
    // Takes the rest of the row, so re-reading a verse is the easy tap and the
    // one that moves the audio is the deliberate one.
    flexGrow: 1,
    paddingVertical: 2,
  },
  historyTime: {
    color: C.accent,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    minWidth: 46,
  },
  historyRef: {
    color: C.verse,
    fontSize: 12,
    flexShrink: 1,
  },
  debug: {
    // Full width so it drops onto its own line inside the wrapping quiet row.
    width: '100%',
    maxHeight: MAX_DEBUG,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  debugContent: {
    paddingTop: 6,
    // Room to scroll the last candidate clear of the panel's bottom edge.
    paddingBottom: 4,
  },
  debugMeta: {
    color: C.accent,
    fontSize: 10,
    marginBottom: 2,
  },
  debugWhy: {
    color: C.accent,
    fontSize: 9,
    lineHeight: 13,
    fontFamily: 'monospace',
  },
  debugText: {
    color: C.muted,
    fontSize: 9,
    lineHeight: 13,
    fontFamily: 'monospace',
  },
});

// The player updates its clock and layout frequently. The panel has its own
// store subscription, so those parent renders do not need to rebuild the
// panel when its three inputs are unchanged.
export default React.memo(
  VersePanel,
  (previous, next) =>
    previous.onSeek === next.onSeek &&
    previous.playbackStarted === next.playbackStarted &&
    previous.isPaused === next.isPaused,
);
