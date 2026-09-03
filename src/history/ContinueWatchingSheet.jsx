// ContinueWatchingSheet.jsx
//
// What the app offers on launch: the handful of things you were last in the
// middle of, in a sheet that is already open.
//
// The same information is on the Profile tab (HistoryComponent) and the full
// list is a screen away, but both of those have to be gone looking for. The
// common reason to open this app is to carry on with something, and that was
// the one thing the first screen never said - it opened on a library organised
// by where files came from, which is the wrong axis for "where was I".
//
// Built the way BacePlayer's queue sheet is (see PlayerQueue): a plain Modal
// with the backdrop as an absolute sibling of the sheet rather than a wrapper
// around it. The gorhom sheet this started as could not scroll the strip
// sideways at all - its own scrollable drives the sheet from a vertical offset
// and has nothing to say about a horizontal one, and its content pan gesture
// claimed the sideways drag before the strip ever saw it. A Modal brings no
// gesture of its own to compete, so an ordinary ScrollView simply works;
// PlayerQueue had already learned the wrapper half of this the same way.

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {HistoryItem} from './HistoryCard';
import {getRecentlyWatchedVideos} from '../database/R';
import useDbStore from '../database/dbStore';
import {wasExternalLaunch} from '../handlers/navigationIntent';

// Five, not the twelve the query returns. This is a prompt, not a history
// screen - past about five the list stops being "what was I doing" and starts
// being something to read. The full list is on the Profile tab for anyone who
// wants it.
const RECENT_COUNT = 5;

// Never rejects: it is started without anyone awaiting it, and a first launch
// can hit it before the history table exists. An empty shelf and a failed read
// mean the same thing here - nothing to carry on with, so no sheet.
const loadRecent = () =>
  getRecentlyWatchedVideos().catch(error => {
    console.error('Could not load what to continue watching:', error);
    return [];
  });

const ContinueWatchingSheet = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [recent, setRecent] = useState([]);

  const close = useCallback(() => setVisible(false), []);

  // Once per app launch. HomeScreen mounting again - coming back from a deep
  // link, or a sign-out and back in - is not a fresh launch, and a sheet
  // appearing mid-session for no reason the user could connect to what they
  // just did is worse than not offering it at all.
  const openedRef = useRef(false);

  // Loading and showing are two different moments, and the sheet was slow the
  // moment they were the same one.
  //
  // It used to do both as soon as the db appeared - which is during sign-in,
  // so the sheet landed on GoogleLoginScreen, over the restore prompt. Waiting
  // for the first real screen instead fixed where it appeared and put the
  // query on the critical path: Home was up and visibly waiting on a read that
  // could have been done minutes of user-time earlier.
  //
  // So it still reads the moment the db exists, into a promise nobody is
  // waiting on yet. By the time HomeScreen asks, the answer is already there
  // and expand is a setState.
  const db = useDbStore(state => state.db);
  const recentPromiseRef = useRef(null);

  useEffect(() => {
    if (!db || recentPromiseRef.current) return;
    recentPromiseRef.current = loadRecent();
  }, [db]);

  const expand = useCallback(async () => {
    if (openedRef.current) return;
    openedRef.current = true;

    // Opened by a link or a share: the user came here to see one specific
    // thing, and the handler is already navigating to it. "Where was I" is
    // the wrong question to answer over the top of that.
    if (wasExternalLaunch()) return;

    // The fallback is for the order that shouldn't happen but costs one line
    // to survive: Home up before the db is open.
    const videos = (await (recentPromiseRef.current ?? loadRecent())) ?? [];

    // Nothing watched yet - on a fresh install there is nothing to carry on
    // with, and an empty sheet in the way would be worse than none.
    if (!videos.length) return;
    setRecent(videos.slice(0, RECENT_COUNT));
    setVisible(true);
  }, []);

  // expand/close, the two methods the gorhom sheet exposed, so the ref handed
  // down from AppStateContext still means the same thing to anything holding
  // it and this stayed a drop-in swap.
  useImperativeHandle(ref, () => ({expand, close}), [expand, close]);

  // Mounted only while open, like PlayerQueue's: the cards are built eagerly
  // and a hidden Modal renders nothing anyway, so keeping it mounted would
  // rebuild the strip on every render of the app root for no reason.
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <View style={styles.overlay}>
        {/* Backdrop as an absolute sibling rather than a wrapper - wrapping
            the sheet means it has to claim the touch responder to stay open,
            which also swallows the strip's scroll gestures. */}
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={close}
        />

        <View style={styles.sheet}>
          <Text style={styles.title}>Continue watching</Text>

          {/* The same horizontal card strip as the Profile tab's Recently
              Watched - five cards read as a shelf to pick from, and the
              layout is already built and familiar. No height is set anywhere
              along the way: the cards are a fixed size, so the strip and the
              sheet hug them. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}>
            {recent.map((item, index) => (
              <HistoryItem
                key={`${item.videoId}-${index}`}
                item={item}
                showTypeBadge={false}
                // The card navigates itself; this only gets the sheet out of
                // the way first, so coming back from the player does not land
                // on it still sitting open over the library.
                onNavigate={close}
              />
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});

export default ContinueWatchingSheet;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#222',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  strip: {
    paddingHorizontal: 16,
  },
});
