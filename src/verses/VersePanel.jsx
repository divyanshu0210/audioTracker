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

import React, {useCallback, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useShallow} from 'zustand/react/shallow';

import useVerseStore from './useVerseStore';

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
    <View style={styles.debug}>
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
    </View>
  ) : null;

  if (!enabled) return null;

  if (unavailable) {
    return (
      <View style={[styles.container, styles.quiet]}>
        <Icon name="info-outline" size={16} color="#94a3b8" />
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
            <ActivityIndicator size="small" color="#94a3b8" />
            <Text style={styles.quietText}>Starting to listen…</Text>
          </>
        )}
        {debugBlock}
      </View>
    );
  }

  const isSong = current.kind === 'song';

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
              <Icon name="list" size={18} color="#cbd5e1" />
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
              color="#cbd5e1"
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={dismiss}
            style={styles.iconBtn}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            accessibilityRole="button"
            accessibilityLabel="Dismiss">
            <Icon name="close" size={18} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      </View>

      {showHistory ? (
        <ScrollView style={styles.historyList} nestedScrollEnabled>
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
          style={expanded ? styles.bodyExpanded : styles.body}
          nestedScrollEnabled>
          {current.lines?.map((line, i) => (
            <Text key={i} style={styles.line}>
              {line}
            </Text>
          ))}

          {expanded && (
            <>
              {current.devanagari?.length > 0 && (
                <View style={styles.section}>
                  {current.devanagari.map((line, i) => (
                    <Text key={i} style={styles.devanagari}>
                      {line}
                    </Text>
                  ))}
                </View>
              )}

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

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e293b',
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
    color: '#94a3b8',
    fontSize: 13,
    flexShrink: 1,
  },
  // A filled dot rather than a spinner: this is on for a whole lecture, and
  // something that spins for an hour reads as "stuck", not "working".
  pulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ade80',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ref: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  source: {
    color: '#64748b',
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
    color: '#cbd5e1',
    fontSize: 11,
    marginLeft: 2,
  },
  body: {
    maxHeight: 96,
    marginTop: 6,
  },
  bodyExpanded: {
    maxHeight: 260,
    marginTop: 6,
  },
  line: {
    color: '#e2e8f0',
    fontSize: 14,
    lineHeight: 21,
    fontStyle: 'italic',
  },
  section: {
    marginTop: 10,
  },
  sectionLabel: {
    color: '#64748b',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  devanagari: {
    color: '#f1f5f9',
    fontSize: 16,
    lineHeight: 26,
  },
  translation: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 20,
  },
  translator: {
    color: '#64748b',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 5,
  },
  alsoIn: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
  },
  attribution: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 8,
  },
  historyList: {
    maxHeight: 180,
    marginTop: 6,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#334155',
  },
  historyTime: {
    color: '#38bdf8',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    minWidth: 46,
  },
  historyRef: {
    color: '#e2e8f0',
    fontSize: 13,
    flexShrink: 1,
  },
  debug: {
    // Full width so it drops onto its own line inside the wrapping quiet row.
    width: '100%',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#334155',
  },
  debugMeta: {
    color: '#38bdf8',
    fontSize: 10,
    marginBottom: 2,
  },
  debugText: {
    color: '#94a3b8',
    fontSize: 10,
    lineHeight: 14,
    fontFamily: 'monospace',
  },
});

export default VersePanel;
