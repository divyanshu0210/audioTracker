import {
  BottomSheetView,
  BottomSheetVirtualizedList,
} from '@gorhom/bottom-sheet';
import React from 'react';
import {ActivityIndicator, SafeAreaView, StyleSheet} from 'react-native';
import {Text} from 'react-native-gesture-handler';
import {useAppState} from '../../contexts/AppStateContext';
import {ItemTypes, ScreenTypes} from '../../contexts/constants';
import BaseItem from '../../StackScreens/BaseItem';
import BaseMediaListComponent from '../../StackScreens/BaseMediaListComponent';

const NotesListComponent = ({
  notes,
  loading,
  loadingMore,
  loadMoreData,
  loadInitialData,
  useSpecial = false,
  showMenu = true,
  screen,
}) => {
  const {notesList, mainNotesList} = useAppState();

  const renderNoteItem = ({item}) => {
    return <BaseItem item={item} type={ItemTypes.NOTE} screen={showMenu} />;
  };

  return (
    <SafeAreaView style={styles.container}>
      {!useSpecial ? (
        <BaseMediaListComponent
          mediaList={notes?notes:(screen === ScreenTypes.MAIN ? mainNotesList : notesList)}
          emptyText={'No notes found'}
          onRefresh={loadInitialData}
          loading={loading}
          type={ItemTypes.NOTE}
          onEndReached={loadMoreData}
          loadingMore={loadingMore}
        />
      ) : (
        <BottomSheetView>
          <BottomSheetVirtualizedList
            data={notesList}
            keyExtractor={item => item.rowid.toString()}
            renderItem={renderNoteItem}
            getItemCount={notesList => notesList.length}
            getItem={(notesList, index) => notesList[index]}
            onEndReached={loadMoreData}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              loading ? (
                <ActivityIndicator size="small" color="#007AFF" />
              ) : null
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>No notes found</Text>
            }
          />
        </BottomSheetView>
      )}
    </SafeAreaView>
  );
};

export default NotesListComponent;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexGrow: 1,
    backgroundColor: '#fff',
  },
  emptyText: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
    textAlign: 'center',
    marginTop: 20,
    color: '#888',
  },
});
