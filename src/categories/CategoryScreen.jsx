import React, {useState, useCallback, useLayoutEffect} from 'react';
import {View, Text, TouchableOpacity, Alert} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {getAllCategories, deleteCategories} from './catDB';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useAppState} from '../contexts/AppStateContext';
import CategoryList from './CategoryList';
import sharedStyles from './sharedStyles';

export default CategoryScreen = () => {
  const {
    categories,
    setCategories,
    setSelectedCategory,
    setCreateCategoryModalVisible,
  } = useAppState();
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const navigation = useNavigation();

  const filteredCategories = categories.filter(
    cat => !/\([^\s@)]+@[^\s@)]+\)/.test(cat.name),
  );

  useFocusEffect(
    useCallback(() => {
      const fetchCatsIfNeeded = async () => {
        if (!categories || categories.length === 0) {
          try {
            const cats = await getAllCategories();
            setCategories(cats);
          } catch (error) {
            console.error('Failed to load categories:', error);
          }
        }
      };
      fetchCatsIfNeeded();
      setIsSelectMode(false);
      setSelectedCategories([]);
    }, [categories]),
  );

  useLayoutEffect(() => {
    if (!isSelectMode) {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity
            onPress={() => setCreateCategoryModalVisible(true)}
            style={{marginRight: 26}}>
            <Ionicons name="add" size={35} color={'#000'} />
          </TouchableOpacity>
        ),
      });
    } else {
      navigation.setOptions({
        headerRight: () => null,
      });
    }
  }, [navigation, isSelectMode]);

  const handleLongPress = categoryId => {
    if (!isSelectMode) {
      setIsSelectMode(true);
      setSelectedCategories([categoryId]);
    }
  };

  const toggleCategorySelection = categoryId => {
    setSelectedCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId],
    );
  };

  const handleDelete = async () => {
    if (selectedCategories.length === 0) return;

    Alert.alert(
      'Delete Categories',
      `Are you sure you want to delete ${selectedCategories.length} categories?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCategories(selectedCategories);
              const updated = categories.filter(
                cat => !selectedCategories.includes(cat.id),
              );
              setCategories(updated);
              setIsSelectMode(false);
              setSelectedCategories([]);
            } catch (error) {
              console.error('Failed to delete categories:', error);
            }
          },
        },
      ],
    );
  };

  const handlePress = item => {
    console.log('is the id null here',item)
    if (isSelectMode) {
      toggleCategorySelection(item.id);
    } else {
      // setSelectedCategory(item.id);
      navigation.navigate('CategoryDetailScreen', { item });
      // navigation.navigate('MainApp', {
      //   screen: 'Home',
      // });
    }
  };

  const cancelSelection = () => {
    setIsSelectMode(false);
    setSelectedCategories([]);
  };

  return (
    <View style={sharedStyles.container}>
      {isSelectMode && (
        <View style={sharedStyles.selectionHeader}>
          <TouchableOpacity onPress={cancelSelection}>
            <Text style={sharedStyles.headerButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={sharedStyles.headerTitle}>
            {selectedCategories.length} selected
          </Text>
          <TouchableOpacity
            onPress={handleDelete}
            disabled={selectedCategories.length === 0}>
            <Text
              style={[
                sharedStyles.headerButton,
                selectedCategories.length === 0 && sharedStyles.disabledButton,
              ]}>
              Delete
            </Text>
          </TouchableOpacity>
        </View>
      )}
      <CategoryList
        categories={filteredCategories}
        onPress={handlePress}
        onLongPress={handleLongPress}
        isSelectMode={isSelectMode}
        selectedCategories={selectedCategories}
        listFooterComponent={
          <Text style={sharedStyles.emptyText}>
            No categories yet. Create one!
          </Text>
        }
      />
    </View>
  );
};
