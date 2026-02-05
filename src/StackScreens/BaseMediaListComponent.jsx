import React from 'react';
import {
  ActivityIndicator,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {groupItemsByDate} from './utils/grouppByDate';
import BaseItem from './BaseItem';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Fontisto from 'react-native-vector-icons/Fontisto';
import {useAppState} from '../contexts/AppStateContext';
import {useNavigation} from '@react-navigation/core';
import {ScreenTypes} from '../contexts/constants';
import useMentorMenteeStore from '../appMentor/useMentorMenteeStore';
import {Button} from 'react-native-share';
import NewAssignmentsBtn from '../components/buttons/NewAssignmentsBtn';

export const getItemId = item =>
  item.rowid || item.driveId || item.ytube_id || item.id.toString();

const BaseMediaListComponent = ({
  mediaList,
  emptyText,
  onRefresh,
  onEndReached,
  loading,
  loadingMore,
  type,
  screen = ScreenTypes.MAIN,
}) => {
  const {selectedItems, setSelectedItems, selectionMode, setSelectionMode} =
    useAppState();

  const navigation = useNavigation();

  const isSelected = (id, type) =>
    selectedItems.some(i => i.id === id && i.type === type);

  const toggleSelection = (id, type) => {
    setSelectedItems(prev =>
      prev.some(i => i.id === id && i.type === type)
        ? prev.filter(i => !(i.id === id && i.type === type))
        : [...prev, {id, type}],
    );
  };

  const cancelSelection = () => {
    setSelectedItems([]);
    setSelectionMode(false);
  };

  const handleForward = () => {
    console.log('Selected Items:', selectedItems);
    navigation.navigate('AssignScreen', {selectedItems});
  };

  const renderItem = ({item}) => {
    const id = getItemId(item);
    return (
      <BaseItem
        item={item}
        type={type}
        isSelected={selectionMode && isSelected(id, type)}
        onSelect={selectionMode ? toggleSelection : undefined}
        onLongPress={() => {
          if (!selectionMode) {
            setSelectedItems([{id, type}]);
            setSelectionMode(true);
          }
        }}
        screen={screen}
      />
    );
  };

  const allItems = mediaList.map(item => ({
    id: getItemId(item),
    type,
  }));

  return (
    <View style={styles.container}>
      {selectionMode && (
        <View style={styles.selectionHeader}>
          <View style={styles.leftSection}>
            <Text style={styles.headerTitle}>{selectedItems.length}</Text>
            <TouchableOpacity
              onPress={() => {
                const currentSelected = selectedItems.filter(
                  i => i.type === type,
                );
                const isAllSelected =
                  currentSelected.length === allItems.length;

                if (isAllSelected) {
                  // Unselect only items of this type
                  setSelectedItems(prev => prev.filter(i => i.type !== type));
                } else {
                  // Add missing items of this type only
                  const newItems = allItems.filter(
                    ai =>
                      !selectedItems.some(
                        si => si.id === ai.id && si.type === ai.type,
                      ),
                  );
                  setSelectedItems(prev => [...prev, ...newItems]);
                }
              }}>
              <Text style={styles.headerButton}>
                {selectedItems.filter(i => i.type === type).length ===
                allItems.length
                  ? 'Unselect All'
                  : 'Select All'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.rightSection}>
            <TouchableOpacity onPress={handleForward}>
              <Fontisto name="share-a" size={23} color="#007AFF" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={cancelSelection}
              style={styles.iconButton}>
              <Ionicons name="close-circle-outline" size={26} color="#007AFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <NewAssignmentsBtn />

      <SectionList
        sections={groupItemsByDate(mediaList)}
        keyExtractor={item => getItemId(item)}
        renderItem={renderItem}
        renderSectionHeader={({section: {title}}) => (
          <Text style={styles.sectionHeader}>{title}</Text>
        )}
        contentContainerStyle={{padding: 10}}
        ListEmptyComponent={<Text style={styles.emptyText}>{emptyText}</Text>}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator size="small" color="#007AFF" />
          ) : null
        }
        onRefresh={onRefresh}
        refreshing={loading}
        onEndReached={() => {
          onEndReached?.();
        }}
        onEndReachedThreshold={0.5}
      />
    </View>
  );
};

export default BaseMediaListComponent;

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
  selectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: '#f8f8f8',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerButton: {
    color: '#007AFF',
    fontSize: 16,
  },
  headerTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#444',
  },
  iconButton: {
    paddingHorizontal: 4,
  },
});
