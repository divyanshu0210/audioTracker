import React, {useCallback, useEffect} from 'react';
import {Dimensions, StyleSheet, Text, View, unstable_batchedUpdates} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {fetchNotes} from '../database/R';
import NotesListComponent from './notesListing/NotesListComponent';
import {ScreenTypes} from '../contexts/constants';
import {useSelectionStore} from '../stores/useSelectionStore';
import useLoadingStore from '../stores/useLoadingStore';
import {useNotesStore} from '../stores/useNotesStore';

const ItemNotesScreen = ({route}) => {
  const setLoadingState = useLoadingStore(state => state.setLoadingState);
  const setNotesList = useNotesStore(state => state.setNotesList);

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
