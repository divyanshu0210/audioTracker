import React, {useState} from 'react';
import {
  Alert,
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  TextInput,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useAppState} from '../../contexts/AppStateContext';
import {useSelectionStore} from '../../stores/useSelectionStore';
import {useShallow} from 'zustand/react/shallow';
import {deleteCategories} from '../../categories/catDB';

const CustomDropdown = ({
  selectedValue,
  onValueChange,
  categories,
  dropdownButtonStyle,
  textStyle,
  dropdownStyle,
  itemStyle,
}) => {
  const [visible, setVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Toggled by the bottom "Manage"/"Done" button — swaps the same
  // search+list for Edit/Delete rows instead of tap-to-filter, all within
  // this one modal rather than navigating to a separate screen.
  const [manageMode, setManageMode] = useState(false);

const {setCreateCategoryModalVisible, setEditingCategory, setCategories} =
  useSelectionStore(
    useShallow(state => ({
      setCreateCategoryModalVisible: state.setCreateCategoryModalVisible,
      setEditingCategory: state.setEditingCategory,
      setCategories: state.setCategories,
    })),
  );

  // The actual displayable list — same email-pattern exclusion CategoriesView
  // uses for its own "personalCategories" — independent of the search query,
  // since this is what "Search in N categories" should count.
  const personalCategories = categories.filter(
    item => !/\([^\s@)]+@[^\s@)]+\)/.test(item.name),
  );

  const filteredCategories = personalCategories.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const closeDropdown = () => {
    setVisible(false);
    setSearchQuery('');
    setManageMode(false);
  };

  const handleEditCategory = category => {
    setEditingCategory(category);
    setCreateCategoryModalVisible(true);
    // Dropdown stays open (in manage mode) behind CreateCategoryModal —
    // categories prop refreshes on its own once the edit saves.
  };

  const handleDeleteCategory = category => {
    Alert.alert(
      'Delete Category',
      `Delete "${category.name}"? Items in it won't be deleted, just uncategorized.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCategories([category.id]);
              setCategories(prev => prev.filter(c => c.id !== category.id));
              if (selectedValue === category.id) {
                onValueChange(null);
              }
            } catch (error) {
              console.error('Failed to delete category:', error);
              Alert.alert('Error', 'Failed to delete category. Please try again.');
            }
          },
        },
      ],
    );
  };

  const renderItem = ({item}) => {
    if (manageMode) {
      return (
        <View style={[styles.item, styles.manageItemRow, itemStyle]}>
          <View style={[styles.colorStripe, {backgroundColor: item.color || '#ccc'}]} />
          <Text style={styles.manageItemName} numberOfLines={1}>
            {item.name}
          </Text>
          <TouchableOpacity
            onPress={() => handleEditCategory(item)}
            style={styles.manageItemButton}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <MaterialIcons name="edit" size={18} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleDeleteCategory(item)}
            style={styles.manageItemButton}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <MaterialIcons name="delete-outline" size={18} color="#D32F2F" />
          </TouchableOpacity>
        </View>
      );
    }

    // Whole row is the touch target here (stripe included) — previously the
    // stripe/dot sat outside the TouchableOpacity, so only the text itself
    // responded to taps, making the row feel harder to hit than it looked.
    return (
      <TouchableOpacity
        style={[styles.item, itemStyle]}
        onPress={() => {
          onValueChange(item.id);
          closeDropdown();
        }}>
        <View style={[styles.colorStripe, {backgroundColor: item.color || '#ccc'}]} />
        <Text style={styles.selectableItemText}>{item.name}</Text>
      </TouchableOpacity>
    );
  };

  const selectedLabel =
    selectedValue == null
      ? 'All'
      : categories.find(c => c.id === selectedValue)?.name;

  // "All" isn't a real category — nothing to edit/delete, so it's only
  // shown while browsing/filtering, not in manage mode.
  const listData = manageMode
    ? filteredCategories
    : [{id: null, name: 'All'}, ...filteredCategories];

  return (
    <View>
      <TouchableOpacity
        style={[styles.dropdownButton, dropdownButtonStyle]}
        onPress={() => setVisible(true)}>
        <Text style={styles.buttonText} numberOfLines={1} ellipsizeMode="tail">
          {selectedLabel}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#000" />
      </TouchableOpacity>

      <Modal
        transparent
        visible={visible}
        animationType="fade"
        onRequestClose={closeDropdown}>
        <TouchableOpacity
          activeOpacity={1}
          style={styles.overlay}
          onPress={closeDropdown}>
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.dropdown, dropdownStyle]}>
            <TextInput
              placeholder={`Search in ${personalCategories.length} ${personalCategories.length === 1 ? 'category' : 'categories'}...`}
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={styles.searchInput}
            />
            {!manageMode && searchQuery.trim() !== '' && (
              <Text style={styles.resultCount}>
                {filteredCategories.length === 0
                  ? 'No results found'
                  : `${filteredCategories.length + 1} result${filteredCategories.length + 1 === 1 ? '' : 's'} found`}
              </Text>
            )}
            <FlatList
              data={listData}
              keyExtractor={item => item.id?.toString() || 'all'}
              renderItem={renderItem}
              style={{maxHeight: 240}}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
              ListEmptyComponent={
                manageMode ? (
                  <Text style={styles.resultCount}>No categories yet.</Text>
                ) : null
              }
            />
            <View style={styles.bottomRow}>
              <TouchableOpacity
                style={[styles.addButton, styles.bottomRowButton]}
                onPress={() => {
                  setSearchQuery('');
                  setCreateCategoryModalVisible(true);
                }}>
                <Text style={styles.addButtonText}>+ Add Category</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.manageButton, styles.bottomRowButton]}
                onPress={() => setManageMode(prev => !prev)}>
                <MaterialIcons
                  name={manageMode ? 'check' : 'edit'}
                  size={16}
                  color="#555"
                />
                <Text style={styles.manageButtonText}>
                  {manageMode ? 'Done' : 'Manage'}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  dropdownButton: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: {width: 0, height: 2},
    shadowRadius: 4,
    elevation: 4,
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 80,
    maxWidth: 140,
    height: 44,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  buttonText: {
    flex: 1,
    fontSize: 14,
    color: '#000',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  dropdown: {
    backgroundColor: 'white',
    marginHorizontal: 40,
    maxHeight: '80%',
    borderRadius: 8,
    padding: 10,
    elevation: 5,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
    color: '#000',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 15,
  },
  selectableItemText: {
    flex: 1,
    color: '#000',
  },
  colorStripe: {
    width: 6,
    height: 28,
    borderRadius: 3,
  },
  manageItemRow: {
    paddingHorizontal: 10,
  },
  manageItemName: {
    flex: 1,
    fontSize: 14,
    color: '#000',
  },
  manageItemButton: {
    padding: 4,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: '#ddd',
  },
  bottomRowButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {},
  addButtonText: {
    color: '#007BFF',
    fontWeight: 'bold',
  },
  manageButton: {
    flexDirection: 'row',
    gap: 4,
    borderLeftWidth: 1,
    borderColor: '#ddd',
  },
  manageButtonText: {
    color: '#555',
    fontWeight: '600',
  },
  resultCount: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
    marginLeft: 4,
  },
});

export default CustomDropdown;
