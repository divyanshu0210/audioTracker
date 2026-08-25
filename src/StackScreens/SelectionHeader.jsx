// SelectionHeader.js
import React, {useCallback, useMemo, useState} from 'react';
import {ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Fontisto from 'react-native-vector-icons/Fontisto';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useSelectionStore} from '../stores/useSelectionStore';
import {useShallow} from 'zustand/react/shallow';
import {navigationRef} from '../handlers/navigationRef';
import {ItemTypes} from '../contexts/constants';
import {bulkShareNotesAsPdf, describeFailures, MAX_PDF_SHARE_COUNT} from './bulkActions';
import BulkDeleteConfirmModal from './BulkDeleteConfirmModal';

const SelectionHeader = ({type, screen, allItemsInThisList}) => {
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const {
    selectedItems,
    setSelectedItems,
    setSelectionMode,
    selectionMode,
    setCategoryModalBulkItems,
    setAddToCategoryModalVisible,
  } = useSelectionStore(
    useShallow(state => ({
      selectedItems: state.selectedItems,
      setSelectedItems: state.setSelectedItems,
      setSelectionMode: state.setSelectionMode,
      selectionMode: state.selectionMode,
      setCategoryModalBulkItems: state.setCategoryModalBulkItems,
      setAddToCategoryModalVisible: state.setAddToCategoryModalVisible,
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

  const openAddToCategory = useCallback(() => {
    setCategoryModalBulkItems(selectedItems);
    setAddToCategoryModalVisible(true);
  }, [selectedItems, setCategoryModalBulkItems, setAddToCategoryModalVisible]);

  const handleShareAsPdf = useCallback(async () => {
    const notes = selectedItems.filter(i => i.type === ItemTypes.NOTE);
    if (!notes.length) return;
    if (notes.length > MAX_PDF_SHARE_COUNT) {
      Alert.alert(
        'Too Many Notes Selected',
        `You can share up to ${MAX_PDF_SHARE_COUNT} notes as PDF at once. Please select fewer notes and try again.`,
      );
      return;
    }
    setBusy(true);
    try {
      const {succeeded, failed} = await bulkShareNotesAsPdf(notes);
      if (failed.length) {
        Alert.alert(
          'Some notes failed',
          `Generated ${succeeded} of ${notes.length} PDFs.\n\n${describeFailures(failed)}`,
        );
      }
    } catch (error) {
      // Share.open rejects when the user just cancels the share sheet —
      // not a real error, matches NoteMenuItems.handleExport's behavior.
      console.log('Share as PDF cancelled or failed:', error);
    } finally {
      setBusy(false);
    }
  }, [selectedItems]);

  if (!selectionMode) return null;

  return (
    <>
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
          {type === ItemTypes.NOTE && (
            <TouchableOpacity onPress={handleShareAsPdf} disabled={busy}>
              {busy ? (
                <ActivityIndicator size="small" color="#007AFF" />
              ) : (
                <MaterialIcons name="picture-as-pdf" size={22} color="#007AFF" />
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={openAddToCategory} disabled={busy}>
            <Ionicons name="pricetag-outline" size={21} color="#007AFF" />
          </TouchableOpacity>

          <TouchableOpacity onPress={handleForward} disabled={busy}>
            <Fontisto name="share-a" size={20} color="#007AFF" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setConfirmVisible(true)}
            disabled={busy}>
            <Ionicons name="trash-outline" size={22} color="#D32F2F" />
          </TouchableOpacity>

          <TouchableOpacity onPress={cancelSelection} style={styles.iconButton}>
            <Ionicons name="close-circle-outline" size={26} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </View>

      <BulkDeleteConfirmModal
        visible={confirmVisible}
        onClose={() => setConfirmVisible(false)}
        selectedItems={selectedItems}
        screen={screen}
      />
    </>
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
    gap: 14,
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
