import React, {useState} from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  TextInput,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useAppState} from '../../contexts/AppStateContext';

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
  const {setCreateCategoryModalVisible} = useAppState();

  const filteredCategories = categories.filter(
    item =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !/\([^\s@)]+@[^\s@)]+\)/.test(item.name),
  );

  const renderItem = ({item}) => (
    <TouchableOpacity
      style={[styles.item, itemStyle]}
      onPress={() => {
        onValueChange(item.id);
        setVisible(false);
        setSearchQuery('');
      }}>
      <Text style={{color: '#000'}}>{item.name}</Text>
    </TouchableOpacity>
  );

  const selectedLabel =
    selectedValue == null
      ? 'All'
      : categories.find(c => c.id === selectedValue)?.name;

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
        onRequestClose={() => {
          setVisible(false);
          setSearchQuery('');
        }}>
        <TouchableOpacity
          activeOpacity={1}
          style={styles.overlay}
          onPress={() => {
            setVisible(false);
            setSearchQuery('');
          }}>
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.dropdown, dropdownStyle]}>
            <TextInput
              placeholder="Search category..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={styles.searchInput}
            />
            {searchQuery.trim() !== '' && (
              <Text style={styles.resultCount}>
                {filteredCategories.length === 0
                  ? 'No results found'
                  : `${filteredCategories.length + 1} result${filteredCategories.length + 1 === 1 ? '' : 's'} found`}
              </Text>
            )}
            <FlatList
              data={[{id: null, name: 'All'}, ...filteredCategories]}
              keyExtractor={item => item.id?.toString() || 'all'}
              renderItem={renderItem}
              style={{maxHeight: 200}}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
            />
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => {
                // setVisible(false);
                setSearchQuery('');
                setCreateCategoryModalVisible(true);
              }}>
              <Text style={styles.addButtonText}>+ Add Category</Text>
            </TouchableOpacity>
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
    paddingHorizontal: 16,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: {width: 0, height: 2},
    shadowRadius: 4,
    elevation: 4,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 120,
    maxWidth: 160,
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
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  addButton: {
    marginTop: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#ddd',
  },
  addButtonText: {
    color: '#007BFF',
    fontWeight: 'bold',
  },
  resultCount: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
    marginLeft: 4,
  },
});

export default CustomDropdown;
