import React, {useCallback, useEffect, useState} from 'react';
import {Dimensions, StyleSheet, Text, View, unstable_batchedUpdates} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {fetchNotes} from '../database/R';
import {fetchMenteeNotes} from '../database/menteeNotesDB';
import {
  useMenteeNotesStore,
  useMenteeNotesSync,
} from '../appMentor/menteeNotesSync';
import NotesListComponent from './notesListing/NotesListComponent';
import {ScreenTypes} from '../contexts/constants';
import {useSelectionStore} from '../stores/useSelectionStore';
import useLoadingStore from '../stores/useLoadingStore';
import {useNotesStore} from '../stores/useNotesStore';

const ItemNotesScreen = ({route, menteeId = null}) => {
  const setLoadingState = useLoadingStore(state => state.setLoadingState);
  const setNotesList = useNotesStore(state => state.setNotesList);

  // menteeId means these are a mentee's notes on the item, and NotesListScreen
  // is the only caller that passes one. A prop rather than a question this
  // component asks for itself, because the other three places it renders - the
  // player's sheet, the notebook screen, the bottom menu - are this user's own
  // notes whoever the drawer happens to have selected.
  //
  // Their notes stay in this component, never in the notesList store. That one
  // also backs the player's notes panel - BacePlayer clears it on mount - and
  // someone else's writing appearing there is what the separate table exists to
  // prevent. The day report keeps them the same way.
  const [menteeNotes, setMenteeNotes] = useState([]);

  const item = route?.params?.item || useSelectionStore.getState().activeItem;
  const showheader = route?.params?.showHeader || false;
  let sourceId = item?.source_id || item?.sourceId;
  let sourceType = item?.source_type || item?.sourceType || item?.type;

  useEffect(() => {
    if (sourceType === 'note') {
      sourceId = item?.item?.source_id;
      sourceType = item?.item?.source_type;
    }
    if (sourceId && sourceType) {
      loadNotesForItem();
    }
    // Clear on unmount so the NEXT mount starts with an empty list and never
    // flashes this item's stale notes before the new item's notes arrive.
    return () => {
      unstable_batchedUpdates(() => {
        setNotesList([]);
        setLoadingState('itemNotes', false);
      });
    };
  }, [sourceId, sourceType]);

  // BacePlayer clears the shared notesList store when it mounts. Reload when
  // this screen regains focus so the list is never left empty after going back.
  useFocusEffect(
    useCallback(() => {
      if (sourceId && sourceType) {
        loadNotesForItem();
      }
    }, [sourceId, sourceType]),
  );

  const loadNotesForItem = async () => {
    setLoadingState('itemNotes', true);
    try {
      if (menteeId) {
        // No source_type: their rows are matched on source_id alone, which is
        // already unique per item, and the type on their side is whatever their
        // device wrote it as.
        const theirs = await fetchMenteeNotes({
          menteeId,
          sourceId,
          limit: 1000,
        });
        unstable_batchedUpdates(() => {
          setMenteeNotes(theirs || []);
          setLoadingState('itemNotes', false);
        });
        return;
      }

      const fetchedNotes = await fetchNotes({
        offset: 0,
        limit: 1000,
        sortBy: 'created_at',
        sortOrder: 'DESC',
        sourceId,
        sourceType,
      });
      unstable_batchedUpdates(() => {
        setNotesList(fetchedNotes);
        setLoadingState('itemNotes', false);
      });
    } catch (error) {
      console.error('Error loading notes for item:', error);
      setLoadingState('itemNotes', false);
    }
  };

  // The rows come off the mentee's Drive through the native worker. Picking
  // them in the drawer already asked for a pass and every upload of theirs
  // announces itself; this is here for the pass that lands while this screen is
  // the one on top, which would otherwise show the list as it was.
  useMenteeNotesSync(menteeId ? {id: menteeId} : null);

  const notesSyncedAt = useMenteeNotesStore(state => state.syncedAt);
  useEffect(() => {
    if (!menteeId || !notesSyncedAt) return;
    if (sourceId && sourceType) loadNotesForItem();
  }, [notesSyncedAt, menteeId]);

  const {height: SCREEN_HEIGHT} = Dimensions.get('window');
  const detent = route?.params?.detent ?? 0.7;
  const containerStyle = showheader
    ? {height: SCREEN_HEIGHT * detent, backgroundColor: '#fff'}
    : {flex: 1, backgroundColor: '#fff'};

  return (
    <View style={containerStyle}>
      {showheader && (
        <>
          <View style={styles.dragHandle} />
          <Text style={styles.title}>All Notes</Text>
        </>
      )}
      <View style={{flex: 1}}>
        <NotesListComponent
          screen={ScreenTypes.IN}
          loadInitialData={loadNotesForItem}
          // The prop wins over the store, which is what keeps their notes out
          // of it.
          notes={menteeId ? menteeNotes : undefined}
        />
      </View>
    </View>
  );
};

export default ItemNotesScreen;

const styles = StyleSheet.create({
  title: {
    textAlign: 'center',
    marginTop: 10,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  dragHandle: {
    width: 46,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#B0B0B0',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
    opacity: 0.7,
  },
});
