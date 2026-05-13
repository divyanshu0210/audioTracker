// screens/ItemNotesScreen.js
import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {fetchNotes} from '../database/R';
import NotesListComponent from './notesListing/NotesListComponent';
import {ScreenTypes} from '../contexts/constants';
import {useSelectionStore} from '../stores/useSelectionStore';
import useLoadingStore from '../stores/useLoadingStore';

const ItemNotesScreen = ({route}) => {
  const activeItem = useSelectionStore(state => state.activeItem);
  const [notes, setNotes] = useState([]); // ← LOCAL STATE
  const setLoadingState = useLoadingStore(state => state.setLoadingState);

  // Get item from route params or context
  const item = route?.params?.item || activeItem;
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
  }, [sourceId, sourceType]);

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
      console.log(`✅ Fetched ${fetchedNotes.length} notes`);
      setNotes(fetchedNotes); // ← Set LOCAL state, not context
    } catch (error) {
      console.error('Error loading notes for item:', error);
    } finally {
      setLoadingState('itemNotes', false);
    }
  };

  const {height: SCREEN_HEIGHT} = Dimensions.get('window');

  const containerStyle = showheader
    ? {height: SCREEN_HEIGHT * 0.7, backgroundColor: '#fff'}
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
          notes={notes}
          screen={ScreenTypes.IN}
          loadInitialData={loadNotesForItem}
        />
      </View>
    </View>
  );
};

export default ItemNotesScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    height: 200,
  },
  title: {
    textAlign: 'center',
    marginTop: 10,
    // marginVertical: 10,
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
