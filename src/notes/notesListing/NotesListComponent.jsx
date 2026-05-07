import React from 'react';
import {SafeAreaView, StyleSheet} from 'react-native';
import {useAppState} from '../../contexts/AppStateContext';
import {ItemTypes, ScreenTypes} from '../../contexts/constants';
import BaseMediaListComponent from '../../StackScreens/BaseMediaListComponent';

const NotesListComponent = ({
  notes,
  loading,
  loadingMore,
  loadMoreData,
  loadInitialData,
  showMenu = true,
  screen,
}) => {
  const {notesList, mainNotesList} = useAppState();

  // Determine data source
  const dataSource =
    notes || (screen === ScreenTypes.MAIN ? mainNotesList : notesList);
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
