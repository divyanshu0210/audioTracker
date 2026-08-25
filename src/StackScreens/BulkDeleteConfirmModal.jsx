// BulkDeleteConfirmModal.jsx
//
// Confirmation dialog for SelectionHeader's bulk Delete action. Needs its own
// modal (not a plain Alert) because Alert can't render the notebook
// "also delete notes" toggle. Owns everything specific to the delete flow
// itself (the toggle, the actual bulkDeleteItems call, clearing selection
// afterward) — SelectionHeader only owns whether this is open.

import React, {useCallback, useMemo, useState} from 'react';
import {
  Alert,
  Modal,
  StyleSheet,
  Switch,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import {useSelectionStore} from '../stores/useSelectionStore';
import {useShallow} from 'zustand/react/shallow';
import {ItemTypes} from '../contexts/constants';
import {bulkDeleteItems, describeFailures} from './bulkActions';

const BulkDeleteConfirmModal = ({visible, onClose, selectedItems, screen}) => {
  const [deleteNotebookNotes, setDeleteNotebookNotes] = useState(false);
  const [busy, setBusy] = useState(false);

  const {setSelectedItems, setSelectionMode} = useSelectionStore(
    useShallow(state => ({
      setSelectedItems: state.setSelectedItems,
      setSelectionMode: state.setSelectionMode,
    })),
  );

  const hasNotebooks = useMemo(
    () => selectedItems.some(i => i.type === ItemTypes.NOTEBOOK),
    [selectedItems],
  );

  const runBulkDelete = useCallback(async () => {
    // Stays open (buttons disabled, "Deleting…") for the whole batch instead
    // of closing immediately — with file unlinks across several items this
    // can take a moment, and closing early leaves items visibly disappearing
    // from the list after the user thinks the action already finished. This
    // also means the header behind this modal stays blocked (native Modal
    // captures touches) for the full duration, not just until the tap lands.
    setBusy(true);
    try {
      const {succeeded, failed} = await bulkDeleteItems(selectedItems, {
        deleteNotebookNotes,
        screen,
      });
      setSelectedItems([]);
      setSelectionMode(false);
      if (failed.length) {
        Alert.alert(
          'Some items failed to delete',
          `Deleted ${succeeded} of ${selectedItems.length} items.\n\n${describeFailures(failed)}`,
        );
      } else {
        ToastAndroid.show(`Deleted ${succeeded} item(s)`, ToastAndroid.SHORT);
      }
    } catch (error) {
      console.error('Bulk delete failed:', error);
      Alert.alert('Delete failed', 'Something went wrong deleting the selected items.');
    } finally {
      setDeleteNotebookNotes(false);
      setBusy(false);
      onClose();
    }
  }, [selectedItems, deleteNotebookNotes, screen, setSelectedItems, setSelectionMode, onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>
            Delete {selectedItems.length} item{selectedItems.length === 1 ? '' : 's'}?
          </Text>
          <Text style={styles.modalMessage}>This can't be undone.</Text>

          {hasNotebooks && (
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>
                Also delete notes in the selected notebook(s)
              </Text>
              <Switch value={deleteNotebookNotes} onValueChange={setDeleteNotebookNotes} />
            </View>
          )}

          <View style={styles.modalButtonRow}>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton]}
              onPress={onClose}
              disabled={busy}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, styles.deleteButton]}
              onPress={runBulkDelete}
              disabled={busy}>
              <Text style={styles.deleteButtonText}>{busy ? 'Deleting…' : 'Delete'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default React.memo(BulkDeleteConfirmModal);

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    backgroundColor: 'white',
    marginHorizontal: 24,
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#222',
    marginBottom: 6,
  },
  modalMessage: {
    fontSize: 13,
    color: '#666',
    marginBottom: 14,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    marginBottom: 8,
  },
  toggleLabel: {
    flex: 1,
    fontSize: 13,
    color: '#333',
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 8,
  },
  modalButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  cancelButton: {
    backgroundColor: 'transparent',
  },
  cancelButtonText: {
    color: '#555',
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#D32F2F',
  },
  deleteButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});
