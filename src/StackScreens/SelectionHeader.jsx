// SelectionHeader.js
import React, {useCallback, useMemo} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Fontisto from 'react-native-vector-icons/Fontisto';
import {useSelectionStore} from '../stores/useSelectionStore';
import {useShallow} from 'zustand/react/shallow';
import {navigationRef} from '../handlers/navigationRef';

const SelectionHeader = ({type, allItemsInThisList}) => {
  const {selectedItems, setSelectedItems, setSelectionMode, selectionMode} =
    useSelectionStore(
      useShallow(state => ({
        selectedItems: state.selectedItems,
        setSelectedItems: state.setSelectedItems,
        setSelectionMode: state.setSelectionMode,
        selectionMode: state.selectionMode,
      })),
    );

  const selectedItemsOfThisType = useMemo(
    () => selectedItems.filter(i => i.type === type),
    [selectedItems, type],
  );

  const isAllSelected = useMemo(
    () => selectedItemsOfThisType.length === allItemsInThisList.length,
    [selectedItemsOfThisType, allItemsInThisList],
  );

  const cancelSelection = useCallback(() => {
    setSelectedItems([]);
    setSelectionMode(false);
  }, [setSelectedItems, setSelectionMode]);

  const handleForward = useCallback(() => {
    console.log('Selected Items:', selectedItems);
    navigationRef.navigate('AssignScreen', {selectedItems});
  }, [selectedItems]);

  const handleSelectAll = useCallback(() => {
    if (isAllSelected) {
      // Unselect only items belonging to this list type
      setSelectedItems(prev => prev.filter(i => i.type !== type));
    } else {
      // Add missing items of this list type
      const newItems = allItemsInThisList.filter(
        ai => !selectedItems.some(si => si.id === ai.id && si.type === ai.type),
      );

      setSelectedItems(prev => [...prev, ...newItems]);
    }
  }, [
    isAllSelected,
    setSelectedItems,
    type,
    allItemsInThisList,
    selectedItems,
  ]);
  if (!selectionMode) return null;
  return (
    <View style={styles.selectionHeader}>
      <View style={styles.leftSection}>
        <Text style={styles.headerTitle}>{selectedItems.length}</Text>

        <TouchableOpacity onPress={handleSelectAll}>
          <Text style={styles.headerButton}>
            {isAllSelected ? 'Unselect All' : 'Select All'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.rightSection}>
        <TouchableOpacity onPress={handleForward}>
          <Fontisto name="share-a" size={23} color="#007AFF" />
        </TouchableOpacity>

        <TouchableOpacity onPress={cancelSelection} style={styles.iconButton}>
          <Ionicons name="close-circle-outline" size={26} color="#007AFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default React.memo(SelectionHeader);

const styles = StyleSheet.create({
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
