// BaseMediaListComponent.js
import React, {useCallback, useMemo, useRef} from 'react';
import {
  ActivityIndicator,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {groupItemsByDate} from './utils/grouppByDate';
import BaseItem from './BaseItem';
import {convertTypetoItemType, ItemTypes, ScreenTypes} from '../contexts/constants';
import NewAssignmentsBtn from '../components/buttons/NewAssignmentsBtn';
import {useSelectionStore} from '../stores/useSelectionStore';
import {useShallow} from 'zustand/react/shallow';
import SelectionHeader from './SelectionHeader';

export const getItemId = item =>
  item?.rowid || item?.source_id || item?.id?.toString();

const BaseMediaListComponent = ({
  mediaList,
  emptyText,
  listFooterComponent,
  listHeaderComponent,
  onRefresh,
  onEndReached,
  loading,
  loadingMore,
  type = null,
  screen = ScreenTypes.MAIN,
  useSections = true,
  // Which date a row is grouped under. Defaults to created_at inside
  // groupItemsByDate; the Downloads screen overrides it because the day an
  // item was added and the day its file was downloaded are different days.
  // Must agree with how the caller sorted mediaList, or the sections come
  // out interleaved.
  groupDate,
  // Swaps the per-type visual (BaseItem.typeConfigMap) for one the caller
  // supplies, while BaseItem keeps providing selection, long-press and the
  // menu. Lets a screen with its own card design join this list without
  // giving up any of that.
  itemComponent,
  onFolderPress,  
}) => {
  const renderCount = useRef(0);
  renderCount.current++;
  console.log(
    `🎯 -----------------Render BASELIST COMPONENT #${renderCount.current} ---------------------------------------`,
    type,screen
  );

  const renderItem = useCallback(
    ({item}) => {
      const subtype = item.type;
      const renderType = type ? type : convertTypetoItemType(item.type);

      return (
        <BaseItem
          type={renderType}
          item={item}
          subtype={subtype}
          screen={screen}
          itemComponent={itemComponent}
          onFolderPress={screen===ScreenTypes.IN && type===ItemTypes.DRIVE? onFolderPress : undefined}
        />
      );
    },
    [type, screen, itemComponent],
  );

  const sections = useMemo(
    () => groupItemsByDate(mediaList, groupDate),
    [mediaList, groupDate],
  );

  const allItemsInThisList = useMemo(
    () =>
      mediaList.map(item => ({
        id: getItemId(item),
        // Resolved per item exactly as renderItem does, so Select All
        // produces the same entries tapping the rows does. A mixed list
        // (Downloads) passes no type at all, and stamping null here left
        // every entry unmatchable — Select All then fed bulkDeleteItems
        // rows whose type nothing dispatches on.
        type: type ?? convertTypetoItemType(item.type),
        subtype: item.type,
        // Carried along so "Select All" produces the same shape BaseItem's
        // per-item selectionEntry does — bulk delete needs dbId/file_path,
        // bulk move needs source_type/source_id.
        dbId: item.id,
        file_path: item.file_path,
        title: item.title,
        source_type: item.source_type,
        source_id: item.source_id,
      })),
    [mediaList, type],
  );

  return (
    <View style={styles.container}>
      <SelectionHeader
        type={type}
        screen={screen}
        allItemsInThisList={allItemsInThisList}
      />

      <NewAssignmentsBtn />

      <SectionList
        sections={sections}
        keyExtractor={item => getItemId(item)}
        renderItem={renderItem}
        renderSectionHeader={({section: {title}}) =>
          useSections ? <Text style={styles.sectionHeader}>{title}</Text> : null
        }
        contentContainerStyle={{paddingVertical: 10}}
        ListEmptyComponent={loading ? null : <Text style={styles.emptyText}>{emptyText}</Text>}
        ListFooterComponent={
          loadingMore
            ? () => <ActivityIndicator size="small" color="#007AFF" />
            : listFooterComponent || null
        }
        ListHeaderComponent={listHeaderComponent || null}
        onRefresh={onRefresh}
        refreshing={loading}
        onEndReached={() => onEndReached?.()}
        onEndReachedThreshold={0.5}
        style={{flex: 1}}
      />
    </View>
  );
};

export default React.memo(BaseMediaListComponent);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#777',
    backgroundColor: 'transparent',
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginBottom: 5,
    borderRadius: 5,
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
