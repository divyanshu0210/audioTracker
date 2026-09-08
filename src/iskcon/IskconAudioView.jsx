// IskconAudioView.jsx
//
// Tab screen for audio.iskcondesiretree.com. Like every other Home tab it owns
// no data: HomeTabs loads the list into useMediaStore.iskconFiles and reloads
// it when the selected category changes. All this does is decide how those
// rows are grouped.
//
// The list means one of two things, and HomeTabs' loader picks which:
//
//   no category selected → the site's own ROOT listing (its default
//     "categories"), with pinned folders above it. Tapping a folder leaves the
//     Home tabs and pushes IskconFolderViewer (mirrors how Drive items open
//     GoogleDriveViewer); tapping a file plays it. Only folders are ever
//     pinned here — a file that was put in a category belongs under that
//     category, not on top of the browse tree.
//
//   a category selected → only that category's audio files, grouped by date
//     like every other category-filtered list. The site's root folders are the
//     browse entry point, not category content, so they are out of the way.
//
// Rows go through IskconList → BaseMediaListComponent → BaseItem, so a
// long-press on a file opens selection and its Assign / Add-to-Category
// actions. Either one files the file into a category, and it shows up here
// once that category is selected.

import React, {useCallback, useEffect, useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

import IskconList from './IskconList';
import {navigationRef} from '../handlers/navigationRef';
import useIskconPinsStore from '../stores/useIskconPinsStore';
import {useMediaStore} from '../stores/useMediaStore';
import useLoadingStore from '../stores/useLoadingStore';
import {groupItemsByDate} from '../StackScreens/utils/grouppByDate';
import {ScreenTypes} from '../contexts/constants';

const IskconAudioView = ({categoryId, onRefresh}) => {
  const entries = useMediaStore(state => state.iskconFiles);
  const error = useMediaStore(state => state.iskconError);
  const loading = useLoadingStore(state => state.loadingStates.iskcon);

  const pinnedFolders = useIskconPinsStore(state => state.pinnedFolders);
  const loadPins = useIskconPinsStore(state => state.loadPins);

  useEffect(() => {
    loadPins();
  }, [loadPins]);

  const onFolderPress = useCallback(folder => {
    navigationRef.navigate('IskconFolderViewer', {folder});
  }, []);

  const sections = useMemo(() => {
    if (categoryId) return groupItemsByDate(entries);

    // Browse mode. Pinned folders may live anywhere in the tree, so they
    // surface here at the outermost screen, reachable in one tap regardless of
    // depth. Drop any root folder that's also pinned so it isn't shown twice.
    const pinnedPaths = new Set(pinnedFolders.map(f => f.encodedPath));
    const rest = entries.filter(
      e => !(e.kind === 'folder' && pinnedPaths.has(e.encodedPath)),
    );

    if (!pinnedFolders.length) {
      return rest.length ? [{title: 'All', data: rest}] : [];
    }

    return [
      {
        title: 'Pinned',
        data: pinnedFolders.map(f => ({
          kind: 'folder',
          source_id: f.encodedPath,
          ...f,
        })),
      },
      ...(rest.length ? [{title: 'All', data: rest}] : []),
    ];
  }, [categoryId, entries, pinnedFolders]);

  // With nothing pinned there is only ever the one group, and a lone "All"
  // header says nothing the list doesn't.
  const showSectionHeaders = categoryId ? true : sections.length > 1;

  return (
    <View style={styles.container}>
      <IskconList
        loading={loading}
        error={error}
        sections={sections}
        onRetry={onRefresh}
        onFolderPress={onFolderPress}
        // Carries weight beyond styling: MAIN is what marks this as a Home tab
        // showing the selected category, which is how the menu's "Remove" and
        // a bulk delete know they may unlink from it. Browsing the site's tree
        // is not that, so it stays IN and neither touches a category.
        screen={categoryId ? ScreenTypes.MAIN : ScreenTypes.IN}
        showSectionHeaders={showSectionHeaders}
        emptyText={
          categoryId
            ? 'No audio from IDT in this category yet.'
            : 'Nothing to show.'
        }
      />
    </View>
  );
};

export default IskconAudioView;

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
});
