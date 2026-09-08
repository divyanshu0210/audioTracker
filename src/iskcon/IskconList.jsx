// IskconList.jsx
//
// Shared list shell for the ISKCON audio browser: loading / error states
// around a BaseMediaListComponent. Going through the base list (rather than a
// FlatList of its own, as this did) is what gives these rows long-press
// selection and the SelectionHeader — so an audio file can be assigned or
// added to a category here exactly like a YouTube, Drive or device item.
// The row visual is IskconItem, which BaseItem already reaches through the
// ISKCON entry in its typeConfigMap — no itemComponent override needed, the
// same way a Drive list gets DriveItem.
//
// The grouping is passed in ready-made (`sections`) because it's the site's
// own Pinned / All split, not a date grouping — a scraped entry has no
// created_at for the base list to group on.

import React from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import BaseMediaListComponent from '../StackScreens/BaseMediaListComponent';
import {ItemTypes, ScreenTypes} from '../contexts/constants';

const IskconList = ({
  loading,
  error,
  sections = [],
  onRetry,
  onFolderPress,
  screen = ScreenTypes.IN,
  // A single unlabelled group (a folder's own contents) has nothing to say in
  // a header; the root's Pinned / Files / All split does.
  showSectionHeaders = true,
  emptyText = 'This folder is empty.',
}) => {
  // Select All and the bulk actions work off the flat list, so it has to hold
  // everything the sections render.
  const mediaList = React.useMemo(
    () => sections.flatMap(s => s.data),
    [sections],
  );

  if (error) {
    return (
      <View style={styles.center}>
        <MaterialIcons name="cloud-off" size={48} color="#bbb" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <BaseMediaListComponent
      mediaList={mediaList}
      sections={sections}
      // The full-screen spinner above owns the loading state; the base list's
      // own RefreshControl must not also be left spinning.
      loading={false}
      useSections={showSectionHeaders}
      type={ItemTypes.ISKCON}
      screen={screen}
      onFolderPress={onFolderPress}
      onRefresh={onRetry}
      emptyText={emptyText}
    />
  );
};

export default IskconList;

const styles = StyleSheet.create({
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30},
  errorText: {marginTop: 12, fontSize: 14, color: '#888', textAlign: 'center'},
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#2196F3',
    borderRadius: 8,
  },
  retryText: {color: '#fff', fontWeight: '600'},
});
