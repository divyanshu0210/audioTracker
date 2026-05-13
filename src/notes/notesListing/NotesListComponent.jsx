import React from 'react';
import {SafeAreaView, StyleSheet} from 'react-native';
import {ItemTypes, ScreenTypes} from '../../contexts/constants';
import BaseMediaListComponent from '../../StackScreens/BaseMediaListComponent';
import {useNotesStore} from '../../stores/useNotesStore';
import {useShallow} from 'zustand/react/shallow';
import useLoadingStore from '../../stores/useLoadingStore';

const NotesListComponent = ({
  notes,
  loadMoreData,
  loadInitialData,
  screen,
}) => {
  const isMainScreen = screen === ScreenTypes.MAIN;
  const {storedNotes} = useNotesStore(
    useShallow(state => ({
      storedNotes: isMainScreen ? state.mainNotesList : state.notesList,
    })),
  );

  const {loading, loadingMore} = useLoadingStore(
    useShallow(state => ({
      loading: isMainScreen
        ? state.loadingStates.mainNotes
        : state.loadingStates.itemNotes,
      loadingMore: isMainScreen ? state.loadingStates.mainMoreNotes : false,
    })),
  );

  // Determine data source
  const dataSource = notes || storedNotes || [];
  console.log(
    'Rendering NotesListComponent with notes count:',
    dataSource.length,
  );

  return (
    <SafeAreaView style={styles.container}>
      <BaseMediaListComponent
        mediaList={dataSource}
        emptyText="No notes found"
        onRefresh={loadInitialData}
        loading={loading}
        type={ItemTypes.NOTE}
        onEndReached={loadMoreData}
        loadingMore={loadingMore}
      />
    </SafeAreaView>
  );
};

export default React.memo(NotesListComponent);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
