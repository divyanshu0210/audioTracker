import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

export const CategoryItem = ({item}) => {
  return (
    <View style={styles.categoryItem}>
      <View
        style={[styles.colorBar, {backgroundColor: item?.color || '#ccc'}]}
      />
      <View style={styles.categoryContent}>
        <Text style={styles.categoryName} numberOfLines={1}>
          {item.name}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  categoryItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  colorBar: {
    width: 8,
    alignSelf: 'stretch',
  },
  categoryContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  categoryName: {
    fontWeight: '600',
    fontSize: 14,
    color: '#000',
  },
});
