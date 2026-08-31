// SelectionHeader.js
import React, {useCallback, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Fontisto from 'react-native-vector-icons/Fontisto';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useSelectionStore} from '../stores/useSelectionStore';
import {useShallow} from 'zustand/react/shallow';
import {navigationRef} from '../handlers/navigationRef';
import {ItemTypes} from '../contexts/constants';
import {
  bulkMoveNotesToNotebook,
  bulkShareNotesAsFile,
  bulkShareNotesAsPdf,
  describeFailures,
  getMovableNotes,
  MAX_PDF_SHARE_COUNT,
} from './bulkActions';
import BulkDeleteConfirmModal from './BulkDeleteConfirmModal';
import SelectNotebookModal from '../components/modals/SelectNotebookModal';
import ShareNotesSheet from '../components/modals/ShareNotesSheet';

const SelectionHeader = ({type, screen, allItemsInThisList}) => {
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [moveVisible, setMoveVisible] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);
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

  const selectedNotes = useMemo(
    () => selectedItems.filter(i => i.type === ItemTypes.NOTE),
    [selectedItems],
  );

  const selectedItemsOfThisType = useMemo(
    () => selectedItems.filter(i => i.type === type),
    [selectedItems, type],
  );

  // Only notebook notes can change notebook — see isMovableNote. A selection
  // straight out of "Select All" in All Notes routinely mixes in notes that
  // belong to a drive/youtube item, so the button appears as long as at least
  // one note can move and the rest are reported as skipped afterwards.
  const movableNotes = useMemo(
    () => getMovableNotes(selectedItems),
    [selectedItems],
  );

  // The "Current" badge only means something when every movable note starts
  // in the same notebook; for a mixed-notebook selection there is no single
  // current notebook to mark, so none is passed.
  const currentNotebookId = useMemo(() => {
    if (!movableNotes.length) return undefined;
    const first = String(movableNotes[0].source_id);
    return movableNotes.every(n => String(n.source_id) === first)
      ? first
      : undefined;
  }, [movableNotes]);

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

  const handleMoveToNotebook = useCallback(
    async notebook => {
      setBusy(true);
      try {
        const {succeeded, failed, skipped} = await bulkMoveNotesToNotebook(
          selectedItems,
          notebook,
        );
        setSelectedItems([]);
        setSelectionMode(false);
        if (failed.length) {
          Alert.alert(
            'Some notes failed to move',
            `Moved ${succeeded} of ${succeeded + failed.length} notes.\n\n${describeFailures(failed)}`,
          );
        } else {
          const skippedNote = skipped
            ? ` (${skipped} skipped — only notebook notes can be moved)`
            : '';
          ToastAndroid.show(
            `Moved ${succeeded} note(s)${skippedNote}`,
            ToastAndroid.SHORT,
          );
        }
      } catch (error) {
        console.error('Bulk move failed:', error);
        Alert.alert('Move failed', 'Something went wrong moving the selected notes.');
      } finally {
        setBusy(false);
      }
    },
    [selectedItems, setSelectedItems, setSelectionMode],
  );

  const handleShareAsPdf = useCallback(async () => {
    const notes = selectedNotes;
    if (!notes.length) return;
    setShareVisible(false);
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
  }, [selectedNotes]);

  // Shares the whole selection as one .atnote bundle another audioTracker can
  // import. Unlike the PDF path there's no count limit — see
  // bulkShareNotesAsFile.
  const handleShareAsNoteFile = useCallback(async () => {
    const notes = selectedNotes;
    if (!notes.length) return;
    setShareVisible(false);
    setBusy(true);
    try {
      const {succeeded, failed} = await bulkShareNotesAsFile(notes);
      if (failed.length) {
        Alert.alert(
          'Some notes failed',
          `Shared ${succeeded} of ${notes.length} notes.

${describeFailures(failed)}`,
        );
      }
    } catch (error) {
      // Cancelling the share sheet rejects here — same as handleShareAsPdf.
      console.log('Share as note file cancelled or failed:', error);
    } finally {
      setBusy(false);
    }
  }, [selectedNotes]);

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
          {/* One entry point for both export formats — the sheet picks
              between them. Distinct from the Fontisto share-a below, which
              forwards the selection to a mentor rather than exporting it. */}
          {type === ItemTypes.NOTE && (
            <TouchableOpacity
              onPress={() => setShareVisible(true)}
              disabled={busy}>
              {busy ? (
                <ActivityIndicator size="small" color="#007AFF" />
              ) : (
                <MaterialIcons name="ios-share" size={22} color="#007AFF" />
              )}
            </TouchableOpacity>
          )}

          {type === ItemTypes.NOTE && movableNotes.length > 0 && (
            <TouchableOpacity onPress={() => setMoveVisible(true)} disabled={busy}>
              <MaterialIcons name="drive-file-move-outline" size={22} color="#007AFF" />
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

      <ShareNotesSheet
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        noteCount={selectedNotes.length}
        onShareAsPdf={handleShareAsPdf}
        onShareAsCopy={handleShareAsNoteFile}
        // PDF generation is sequential and native, so a large batch is slow
        // and can choke the receiving app — the limit lives here now instead
        // of in an Alert fired after the user already chose PDF.
        pdfDisabled={selectedNotes.length > MAX_PDF_SHARE_COUNT}
        pdfDescription={
          selectedNotes.length > MAX_PDF_SHARE_COUNT
            ? `Up to ${MAX_PDF_SHARE_COUNT} notes at a time`
            : undefined
        }
      />

      <SelectNotebookModal
        visible={moveVisible}
        onClose={() => setMoveVisible(false)}
        onSelect={handleMoveToNotebook}
        selectedNotebookId={currentNotebookId}
      />

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
