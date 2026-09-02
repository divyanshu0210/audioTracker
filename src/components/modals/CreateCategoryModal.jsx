// CreateCategoryModal.js
import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import ColorPallete from '../ColorPallete';
import {
  addCategory,
  HIDDEN_CATEGORY_TAGS,
  updateCategory,
} from '../../categories/catDB';
import { useAppState } from '../../contexts/AppStateContext';
import { useSelectionStore } from '../../stores/useSelectionStore';
import { useShallow } from 'zustand/react/shallow';

// getAllCategories hides any name containing "@" or one of
// HIDDEN_CATEGORY_TAGS (see its WHERE clause) — that's deliberate, it's how
// the mentor/mentee categories created from menteeKey/mentorKey, and the
// category holding imported notes, stay out of the normal category lists.
// A user-typed name that trips those same filters would save fine and then
// never appear anywhere, leaving an invisible row that still holds the name
// (addCategory reuses an existing row's id on a name match, so even
// re-creating it later silently returns the hidden one). So this guards the
// user-typed path only — addCategory itself must keep accepting them.

const getCategoryNameError = name => {
  if (name.includes('@')) {
    return 'Category names cannot contain "@".';
  }
  // The other half of HIDDEN_CATEGORY_TAGS: getAllCategories hides names
  // carrying one, so a user-made category using the same tag would be saved
  // and then be invisible everywhere — and, for the shared-notes tag, would
  // quietly badge its notes as having come from someone else.
  const hiddenTag = HIDDEN_CATEGORY_TAGS.find(tag => name.includes(tag));
  if (hiddenTag) {
    return `Category names cannot contain "${hiddenTag}".`;
  }
  return null;
};

// editingCategory ({id, name, color}) switches this into rename mode —
// used by CategoriesView's manage mode via GlobalModals. null means "create".
const CreateCategoryModal = ({ visible, onClose, onCategoryCreated, editingCategory, onCategoryUpdated }) => {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedColor, setSelectedColor] = useState('#007AFF');
  const [addingCategory, setAddingCategory] = useState(false);
const {setSelectedCategory, categories} = useSelectionStore(
  useShallow(state => ({
    setSelectedCategory: state.setSelectedCategory,
    categories: state.categories,
  })),
);
  const isEditing = !!editingCategory;

  // Reset on every open — prefill when editing, blank when creating.
  // This modal stays mounted globally (GlobalModals), so without this a
  // name left over from a cancelled or duplicate-rejected attempt would
  // still be sitting in the input the next time it's opened.
  useEffect(() => {
    if (!visible) return;
    if (editingCategory) {
      setNewCategoryName(editingCategory.name);
      setSelectedColor(editingCategory.color || '#007AFF');
    } else {
      setNewCategoryName('');
      setSelectedColor('#007AFF');
    }
  }, [visible, editingCategory]);

  const handleCreateCategory = async () => {
    const trimmedName = newCategoryName.trim();
    if (!trimmedName) {
      Alert.alert('Error', 'Please enter a category name');
      return;
    }

    // Reject names that getAllCategories filters out — the category would be
    // saved and then be invisible everywhere (see getCategoryNameError).
    const nameError = getCategoryNameError(trimmedName);
    if (nameError) {
      Alert.alert('Invalid Name', nameError);
      return;
    }

    // addCategory itself silently reuses an existing row's id on a name
    // collision (see catDB.js) rather than erroring — which would otherwise
    // leave a duplicate {id, name, color} entry sitting in the categories
    // store array once onCategoryCreated prepends it. Catch it here instead,
    // with a real message, before it ever reaches the DB call. Case-
    // insensitive since "Work" and "work" would collide there too.
    const duplicate = categories.find(
      c =>
        c.id !== editingCategory?.id &&
        c.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );
    if (duplicate) {
      Alert.alert(
        'Category Already Exists',
        `A category named "${duplicate.name}" already exists.`,
      );
      return;
    }

    setAddingCategory(true);
    try {
      if (isEditing) {
        await updateCategory(editingCategory.id, {
          name: trimmedName,
          color: selectedColor,
        });
        onCategoryUpdated?.({ id: editingCategory.id, name: trimmedName, color: selectedColor });
      } else {
        const newCategoryId = await addCategory(trimmedName, selectedColor);
        onCategoryCreated?.({ id: newCategoryId, name: trimmedName, color: selectedColor });
      }
      setNewCategoryName('');
      setSelectedColor('#007AFF');
      onClose();
    } catch (error) {
      console.error(`Failed to ${isEditing ? 'update' : 'create'} category:`, error);
      Alert.alert('Error', `Failed to ${isEditing ? 'update' : 'create'} category. Please try again.`);
    } finally {
      setAddingCategory(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <TouchableOpacity style={styles.closeIcon} onPress={onClose} disabled={addingCategory}>
            <Ionicons name="close" size={24} color="black" />
          </TouchableOpacity>

          <Text style={styles.modalTitle}>
            {isEditing ? 'Edit Category' : 'Create New Category'}
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Category Name"
            placeholderTextColor={'#888'}
            value={newCategoryName}
            onChangeText={setNewCategoryName}
            autoFocus
          />
          <View style={{marginBottom:30}}>

          <ColorPallete color={selectedColor} onColorChange={setSelectedColor} />
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              disabled={addingCategory}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <View style={{flex:1}}></View>
            <TouchableOpacity
              style={[styles.button, styles.createButton]}
              onPress={handleCreateCategory}
              disabled={addingCategory || !newCategoryName.trim()}
            >
              {addingCategory ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.buttonText}>{isEditing ? 'Save' : 'Create'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: '#000000aa',
    justifyContent: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
  },
  closeIcon: {
    alignSelf: 'flex-end',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 30,
    color:'#333'
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
    color:'#000'
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  button: {
    padding: 10,
    borderRadius: 6,
    minWidth: 80,
    alignItems: 'center',
    marginLeft: 10,
  },
  cancelButton: {
    backgroundColor: '#777',
  },
  createButton: {
    backgroundColor: '#007AFF',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});

export default CreateCategoryModal;
