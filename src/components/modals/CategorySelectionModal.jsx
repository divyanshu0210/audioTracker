import React, {useEffect, useState} from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {
  addItemToCategory,
  checkItemInCategory,
  getAllCategories,
} from '../../categories/catDB';
import {bulkAddToCategory, describeFailures} from '../../StackScreens/bulkActions';
import {Picker} from '@react-native-picker/picker';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useAppState} from '../../contexts/AppStateContext';
import { useSelectionStore } from '../../stores/useSelectionStore';
import { useShallow } from 'zustand/react/shallow';

const CategorySelectionModal = () => {
  const [categoriesLocal, setCategoriesLocal] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [alreadyAddedCategories, setAlreadyAddedCategories] = useState([]);
const {
  categories,
  setCategories,
  activeItem,
  addToCategoryModalVisible,
  setAddToCategoryModalVisible,
  setCreateCategoryModalVisible,
  categoryModalBulkItems,
  setCategoryModalBulkItems,
} = useSelectionStore(
  useShallow(state => ({
    categories: state.categories,
    setCategories: state.setCategories,
    activeItem: state.activeItem,
    addToCategoryModalVisible:
      state.addToCategoryModalVisible,
    setAddToCategoryModalVisible:
      state.setAddToCategoryModalVisible,
    setCreateCategoryModalVisible:
      state.setCreateCategoryModalVisible,
    categoryModalBulkItems: state.categoryModalBulkItems,
    setCategoryModalBulkItems: state.setCategoryModalBulkItems,
  })),
);
  const isBulk = Array.isArray(categoryModalBulkItems) && categoryModalBulkItems.length > 0;
  const sourceId = activeItem?.sourceId;
  const sourceType = activeItem?.sourceType;

  // Load categories when the modal opens, and again whenever `categories`
  // changes in the store (e.g. a category created via the "+ Create" button
  // while this modal is open) — see loadCategories for how the 0-categories
  // infinite-loop this used to cause is avoided.
  useEffect(() => {
    if (!addToCategoryModalVisible) {
      // reset state when modal closes
      setCategoriesLocal([]);
      setSelectedCategory(null);
      setAlreadyAddedCategories([]);
      return;
    }
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addToCategoryModalVisible, categories]);

  const onClose = () => {
    setAddToCategoryModalVisible(false);
    setCategoryModalBulkItems(null);
  };

  const onAddSuccess = () => {
    console.log(
      `${sourceType} Item ${sourceId} added to category successfully!`,
    );
  };

  const loadCategories = async () => {
    try {
      setLoading(true);
      // always ensure categories are fresh
      let cats = categories;
      if (!cats || cats.length === 0) {
        cats = await getAllCategories();
        // Only write to the store when the fetch actually found something.
        // Calling setCategories([]) here every time would hand the store a
        // brand-new (but still empty) array reference on every run, which —
        // since this effect depends on `categories` — would re-trigger this
        // same effect forever whenever there are genuinely 0 categories.
        if (cats.length > 0) {
          setCategories(cats);
        }
      }

      // filter out unwanted categories
      cats = cats.filter(cat => !/\([^\s@)]+@[^\s@)]+\)/.test(cat.name));
      setCategoriesLocal(cats);

      if (isBulk) {
        // "Already added" only makes sense per single item — skip it for a
        // mixed batch and just default to the first category.
        setAlreadyAddedCategories([]);
        if (cats.length > 0) setSelectedCategory(cats[0].id);
        return;
      }

      // Check which categories already contain this item
      const checks = await Promise.all(
        cats.map(cat => checkItemInCategory(cat.id, sourceId, sourceType)),
      );

      const addedCats = cats.filter((_, index) => checks[index]);
      setAlreadyAddedCategories(addedCats.map(c => c.id));

      // Set first non-added category as selected by default
      const firstNonAdded = cats.find(cat => !addedCats.includes(cat.id));
      if (firstNonAdded) {
        setSelectedCategory(firstNonAdded.id);
      } else if (cats.length > 0) {
        setSelectedCategory(cats[0].id);
      }
    } catch (error) {
      console.error('Failed to load categories:', error);
      Alert.alert('Error', 'Failed to load categories. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCategoryBulk = async () => {
    setLoading(true);
    try {
      const {succeeded, failed} = await bulkAddToCategory(
        categoryModalBulkItems,
        selectedCategory,
      );
      const category = categoriesLocal.find(c => c.id === selectedCategory);
      Alert.alert(
        failed.length ? 'Partially Added' : 'Success',
        failed.length
          ? `Added ${succeeded} item(s) to "${category?.name}".\n\n${describeFailures(failed)}`
          : `Added ${succeeded} item(s) to "${category?.name}".`,
      );
      onClose();
    } catch (error) {
      console.error('Failed to bulk add to category:', error);
      Alert.alert('Error', 'Failed to add items to category. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCategory = async () => {
    if (!selectedCategory) return;
    if (isBulk) return handleAddToCategoryBulk();

    // Check if already in this category
    if (alreadyAddedCategories.includes(selectedCategory)) {
      const category = categoriesLocal.find(c => c.id === selectedCategory);
      Alert.alert(
        'Already Added',
        `This item is already in the "${category.name}" category.`,
        [{text: 'OK'}],
      );
      return;
    }

    setLoading(true);
    try {
      await addItemToCategory(selectedCategory, sourceId, sourceType);
      setAlreadyAddedCategories(prev => [...prev, selectedCategory]);
      onAddSuccess?.();
      Alert.alert('Success', 'Item added to category successfully!');
      onClose();
    } catch (error) {
      console.error('Failed to add to category:', error);
      Alert.alert('Error', 'Failed to add item to category. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderPickerItem = category => {
    const isAdded = alreadyAddedCategories.includes(category.id);
    return (
      <Picker.Item
        key={category.id}
        label={isAdded ? `${category.name} ✓` : category.name}
        value={category.id}
        color={isAdded ? '#888' : '#000'}
      />
    );
  };

  return (
    <Modal
      visible={addToCategoryModalVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.closeIcon}
            onPress={onClose}
            disabled={loading}>
            <Ionicons name="close" size={24} color="black" />
          </TouchableOpacity>

          <Text style={styles.modalTitle}>
            {isBulk
              ? `Add ${categoryModalBulkItems.length} Items to Category`
              : 'Add to Category'}
          </Text>
          {loading ? (
            <ActivityIndicator size="large" style={styles.loader} />
          ) : (
            <>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={selectedCategory}
                  onValueChange={itemValue => setSelectedCategory(itemValue)}
                  style={styles.picker}>
                  {categoriesLocal.map(category => renderPickerItem(category))}
                </Picker>
              </View>

              <View style={styles.statusNote}>
                {alreadyAddedCategories.includes(selectedCategory) && (
                  <Text style={styles.statusText}>
                    *The file is Already in this category
                  </Text>
                )}
              </View>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.createButton]}
                  onPress={() => setCreateCategoryModalVisible(true)}>
                  <Text style={styles.actionButtonText}>+ Create</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    styles.addButton,
                    alreadyAddedCategories.includes(selectedCategory) && {
                      backgroundColor: '#A8DAB5',
                    },
                  ]}
                  onPress={handleAddToCategory}
                  disabled={loading || !selectedCategory}>
                  <Text style={styles.actionButtonText}>
                    {loading ? 'Adding...' : 'Add to Selected Category'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};
const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    borderRadius: 10,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
    color: '#333',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    marginBottom: 5,
    overflow: 'hidden',
  },
  picker: {
    width: '100%',
  },
  statusNote: {
    marginBottom: 10,
    alignItems: 'center',
  },
  statusText: {
    color: '#f00',
    fontSize: 10,
    fontStyle: 'italic',
  },
  loader: {
    marginVertical: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  actionButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: '#007AFF',
  },
  addButton: {
    backgroundColor: '#34C759',
    flex: 2,
  },
  closeIcon: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1,
  },
});

export default CategorySelectionModal;
