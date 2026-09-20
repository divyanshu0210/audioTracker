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

import React, {useCallback, useEffect, useMemo, useState} from 'react';
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

const VersePanel = ({onSeek}) => {
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // The purport is fetched rather than bundled - see purport.js - so it has
  // three states the panel has to tell apart: not asked for, fetching, and
  // fetched-but-empty. The last is ordinary; plenty of verses have no purport.
  const [purport, setPurport] = useState(null);
  const [purportState, setPurportState] = useState('idle');

  // One subscription rather than several: this sits under a player that is
  // already re-rendering on progress, and should not add to that.
  const {
    enabled, listening, unavailable, current, history,
    debug, heardCount, lastHeard, candidates,
  } = useVerseStore(
    useShallow(state => ({
      enabled: state.enabled,
      listening: state.listening,
      unavailable: state.unavailable,
      current: state.current,
      history: state.history,
      debug: state.debug,
      heardCount: state.heardCount,
      lastHeard: state.lastHeard,
      candidates: state.candidates,
    })),
  );

  const dismiss = useVerseStore(state => state.dismiss);

  const currentId = current?.id;

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

  const handleSeek = useCallback(
    entry => {
      setShowHistory(false);
      onSeek?.(entry.at);
    },
    [onSeek],
  );

  // Newest first: the thing just heard is the thing most likely wanted.
  const recent = useMemo(() => [...history].reverse(), [history]);

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
      <Text style={styles.debugMeta}>
        {heardCount} heard · {listening ? 'live' : 'idle'}
      </Text>
      <Text style={styles.debugText} numberOfLines={3}>
        {lastHeard || '(nothing yet)'}
      </Text>
      {candidates.length > 0 ? (
        candidates.map(c => (
          <Text key={c.ref} style={styles.debugText}>
            {c.runChars}ch {Math.round((c.solidRatio || 0) * 100)}% {c.ref}
          </Text>
        ))
      ) : (
        <Text style={styles.debugText}>(no candidates)</Text>
      )}
    </ScrollView>
  ) : null;

  if (!enabled) return null;

  if (unavailable) {
    return (
      <View style={[styles.container, styles.quiet]}>
        <Icon name="info-outline" size={16} color={C.muted} />
        <Text style={styles.quietText} numberOfLines={2}>
          {unavailable}
        </Text>
        {debugBlock}
      </View>
    );
  }

  // Listening, but nothing recognised yet. Deliberately not blank: somebody
  // switched this on and is owed evidence that it is running, and a whole
  // lecture can pass before the first verse.
  if (!current) {
    return (
      <View style={[styles.container, styles.quiet]}>
        {listening ? (
          <>
            <View style={styles.pulse} />
            <Text style={styles.quietText}>
              Listening — verses and songs will appear here
            </Text>
          </>
        ) : (
          <>
            <ActivityIndicator size="small" color={C.muted} />
            <Text style={styles.quietText}>Starting to listen…</Text>
          </>
        )}
        {debugBlock}
      </View>
    );
  }

  const isSong = current.kind === 'song';

  // Empty for Caitanya-caritamrta, which is Bengali, and for the songs that
  // carry no script at all. Both then show the transliteration alone.
  const script = current.devanagari?.filter(isDevanagari) || [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {listening && <View style={styles.pulse} />}

        <Text style={styles.ref} numberOfLines={1}>
          {isSong ? current.title || current.ref : current.ref}
        </Text>

        {/* Where it came from. A verse from the title is only what the
            recording is *about*; one the lecturer named is a statement; one
            matched from the sound is the only kind that can be wrong. */}
        <Text style={styles.source}>
          {current.source === 'title'
            ? 'from title'
            : current.source === 'cited'
            ? 'cited'
            : 'heard'}
        </Text>

        <View style={styles.headerActions}>
          {recent.length > 1 && (
            <TouchableOpacity
              onPress={() => setShowHistory(v => !v)}
              style={styles.iconBtn}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
              accessibilityRole="button"
              accessibilityLabel={`${recent.length} verses heard so far`}>
              <Icon name="list" size={18} color={C.body} />
              <Text style={styles.count}>{recent.length}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => setExpanded(v => !v)}
            style={styles.iconBtn}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Show less' : 'Show translation'}>
            <Icon
              name={expanded ? 'expand-less' : 'expand-more'}
              size={20}
              color={C.body}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={dismiss}
            style={styles.iconBtn}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            accessibilityRole="button"
            accessibilityLabel="Dismiss">
            <Icon name="close" size={18} color={C.muted} />
          </TouchableOpacity>
        </View>
      </View>

      {showHistory ? (
        <ScrollView
          style={styles.historyList}
          nestedScrollEnabled
          persistentScrollbar>
          {recent.map((entry, i) => (
            <TouchableOpacity
              key={`${entry.id}-${entry.heardAt}-${i}`}
              style={styles.historyRow}
              onPress={() => handleSeek(entry)}>
              <Text style={styles.historyTime}>{formatPosition(entry.at)}</Text>
              <Text style={styles.historyRef} numberOfLines={1}>
                {entry.kind === 'song' ? entry.title || entry.ref : entry.ref}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.body}
          nestedScrollEnabled
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
            <View style={styles.devanagariBlock}>
              {script.map((line, i) => (
                <Text key={i} style={styles.devanagari}>
                  {line}
                </Text>
              ))}
            </View>
          )}

          {current.lines?.map((line, i) => (
            <Text key={i} style={styles.line}>
              {line}
            </Text>
          ))}

          {expanded && (
            <>
              {!!current.translation && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Translation</Text>
                  <Text style={styles.translation}>{current.translation}</Text>
                  {/* Only where the translation is not Prabhupada's - see the
                      note in tools/verse-corpus/sources/sbCompletion.js. */}
                  {!!current.translator && (
                    <Text style={styles.translator}>{current.translator}</Text>
                  )}
                </View>
              )}

              {/* Fetched on the tap, not with the verse. A purport is five
                  hundred to fifteen hundred words and nobody reads one while a
                  lecture is playing - so it costs a tap, and the bundled
                  corpus stays small enough to ship. */}
              {mayHavePurport(current.id) && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Purport</Text>

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
                      <Text style={styles.purportActionText}>Fetching…</Text>
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
                      <Text style={styles.purport}>{purport}</Text>
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

      {debugBlock}
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    gap: 4,
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
    // No height and no maximum: it shrinks into whatever the panel has left.
    flexShrink: 1,
  },
  // The verse itself, and the one size that matters: a lecturer recites
  // faster than this can be read, so more of it on screen at once beats a
  // larger face. The line height stays generous relative to the size -
  // diacritics sit above and below these letters and crowd at a tight leading.
  line: {
    color: C.verse,
    fontSize: 12.5,
    lineHeight: 19,
    fontStyle: 'italic',
  },
  section: {
    marginTop: 10,
  },
  sectionLabel: {
    color: C.faint,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
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
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
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
  debugText: {
    color: C.muted,
    fontSize: 9,
    lineHeight: 13,
    fontFamily: 'monospace',
  },
});

export default VersePanel;
