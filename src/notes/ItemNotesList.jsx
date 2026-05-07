// screens/ItemNotesScreen.js
import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Dimensions, StyleSheet, Text, View} from 'react-native';
import {fetchNotes} from '../database/R';
import NotesListComponent from './notesListing/NotesListComponent';
import {useAppState} from '../contexts/AppStateContext';
import {ScreenTypes} from '../contexts/constants';

const ItemNotesScreen = ({route}) => {
  const {activeItem} = useAppState();
  const [notes, setNotes] = useState([]); // ← LOCAL STATE
  const [loading, setLoading] = useState(false);
  
  // Get item from route params or context
  const item = route?.params?.item || activeItem;
  
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
    setLoading(true);

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
      setLoading(false);
    }
  };

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.70;

return (
  <View style={{ height: SHEET_HEIGHT, backgroundColor: '#fff' }}>
    <Text style={styles.title}>Notes for this Item</Text>
    <View style={{ flex: 1 }}>
       {loading ? (
        <ActivityIndicator
          size="small"
          color="#0000ff"
          style={{marginTop: 20}}
        />
      ) : (
      <NotesListComponent
        notes={notes}
        loading={loading}
        screen={ScreenTypes.IN}
      />
    )}
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
    marginVertical: 10,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
});