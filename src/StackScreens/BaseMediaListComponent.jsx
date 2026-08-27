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
  onRefresh,
  onEndReached,
  loading,
  loadingMore,
  type = null,
  screen = ScreenTypes.MAIN,
  useSections = true,
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
          onFolderPress={screen===ScreenTypes.IN && type===ItemTypes.DRIVE? onFolderPress : undefined}
        />
      );
    },
    [type, screen],
  );

  const sections = useMemo(() => groupItemsByDate(mediaList), [mediaList]);

  const allItemsInThisList = useMemo(
    () =>
      mediaList.map(item => ({
        id: getItemId(item),
        type,
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
