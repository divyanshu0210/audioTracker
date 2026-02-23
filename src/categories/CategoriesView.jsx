import React, {useCallback} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useAppState} from '../contexts/AppStateContext';
import {getAllCategories} from './catDB';
import AppHeader from '../components/headers/AppHeader';
import {ItemTypes} from '../contexts/constants';
import BaseMediaListComponent from '../StackScreens/BaseMediaListComponent';

export default function CategoriesView({mode = 'full'}) {
  const navigation = useNavigation();
  const {categories, setCategories, setCreateCategoryModalVisible} =
    useAppState();

  const isPreview = mode === 'preview';

  const fetch = async () => {
    try {
      const cats = await getAllCategories();
      setCategories(cats);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };
  // Load categories when focused and empty
  useFocusEffect(
    useCallback(() => {
      if (categories?.length) return;

      fetch();
    }, [categories, setCategories]),
  );

  const personalCategories =
    categories?.filter(cat => !/\([^\s@)]+@[^\s@)]+\)/.test(cat.name)) ?? [];

  // ── What to show ──
  const displayedCategories = isPreview
    ? personalCategories.slice(0, 3)
    : personalCategories;

  const emptyText = isPreview
    ? 'No categories yet. Create one to organize your media & notes.'
    : 'No categories yet. Tap + to create one!';

  // ── Footer (ONLY handles "X more") ──
  const renderListFooter = () => {
    if (!isPreview) return null;
    const extra = personalCategories.length - displayedCategories.length;
    if (extra > 0) {
      return (
        <View style={styles.moreCategoriesContainer}>
          <Text style={styles.moreCategoriesText}>{extra} more</Text>
        </View>
      );
    }
    return null;
  };

  // ── Header row (used in both modes, but styled/positioned differently) ──
  const renderHeaderRow = () => (
    <>
      <AppHeader
        title="Your Categories"
        titleStyle={isPreview && {fontSize: 20}}
        headerStyle={
          isPreview && {
            paddingVertical: 0,
            borderBottomWidth: 0,
          }
        }
        showBack={!isPreview}
        rightComponent={
          <>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <TouchableOpacity
                onPress={() => setCreateCategoryModalVisible(true)}
                style={{marginRight: 6}}>
                <Ionicons name="add" size={30} color="#000" />
              </TouchableOpacity>
              {isPreview && (
                <TouchableOpacity
                  onPress={() => navigation.navigate('CategoriesView')}>
                  <Text style={styles.viewAll}>View All</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        }
        enableSearch={!isPreview}
        searchParams={{
          initialSearchActive: true,
          mode: 'category',
        }}
      />
    </>
  );

  return (
    <View style={styles.container}>
      {renderHeaderRow()}
      <BaseMediaListComponent
        mediaList={displayedCategories}
        emptyText={emptyText}
        onRefresh={!isPreview ? fetch : null}
        type={ItemTypes.CATEGORY}
        loading={false}
        listFooterComponent={renderListFooter()}
        useSections={!isPreview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  moreCategoriesContainer: {
    paddingHorizontal: 8,
  },
  moreCategoriesText: {
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
  },
  viewAll: {
    color: '#2196F3',
    fontWeight: '500',
    fontSize: 14,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#E3F2FD',
  },
});
