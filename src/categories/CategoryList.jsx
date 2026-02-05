import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import sharedStyles from './sharedStyles';

const CategoryList = ({
  categories,
  onPress,
  onLongPress,
  isSelectMode,
  selectedCategories,
  showEmail,
  listFooterComponent,
}) => {
  const renderCategory = ({ item }) => {
    const emailMatch = showEmail && item.name.match(/\(([^)]+)\)/);
    const hasEmail = !!emailMatch;
    const displayName = hasEmail ? item.name.replace(/\s*\([^)]+\)/, '') : item.name;
    const email = hasEmail ? emailMatch[1] : null;

    return (
      <TouchableOpacity
        style={[
          sharedStyles.categoryItem,
          isSelectMode && selectedCategories?.includes(item.id) && sharedStyles.selectedItem,
        ]}
        onPress={() => onPress(item)}
        onLongPress={() => onLongPress?.(item.id)}
      >
        <View style={[sharedStyles.colorBar, { backgroundColor: item?.color || '#ccc' }]} />
        <View style={sharedStyles.categoryContent}>
          <Text style={sharedStyles.categoryName}>{displayName}</Text>
          {email && <Text style={sharedStyles.categoryEmail}>{email}</Text>}
        </View>
        {isSelectMode && (
          <View
            style={[
              sharedStyles.checkbox,
              selectedCategories?.includes(item.id) && sharedStyles.checkboxSelected,
            ]}
          >
            {selectedCategories?.includes(item.id) && (
              <Text style={sharedStyles.checkmark}>✓</Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <FlatList
      data={categories}
      keyExtractor={item => item.id.toString()}
      renderItem={renderCategory}
      contentContainerStyle={sharedStyles.categoryList}
      scrollEnabled={false}
      ListFooterComponent={listFooterComponent}
      extraData={[isSelectMode, selectedCategories]}
    />
  );
};

export default CategoryList;