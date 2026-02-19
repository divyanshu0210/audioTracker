import {useFocusEffect, useNavigation} from '@react-navigation/native';
import React, {useCallback, useMemo} from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useAppState} from '../contexts/AppStateContext';
import {getAllCategories} from './catDB';
import CategoryList from './CategoryList';
import sharedStyles from './sharedStyles';

const CategoryPreview = () => {
  const navigation = useNavigation();
  const {
    categories,
    setCategories,
    setSelectedCategory,
    setCreateCategoryModalVisible,
  } = useAppState();

  useFocusEffect(
    useCallback(() => {
      const fetchCatsIfNeeded = async () => {
        try {
          const cats = await getAllCategories();
          if (JSON.stringify(cats) !== JSON.stringify(categories)) {
            setCategories(cats);
          }
        } catch (error) {
          console.error('Failed to load categories:', error);
        }
      };

      if (!categories || categories.length === 0) {
        fetchCatsIfNeeded();
      }
    }, []),
  );

  const {assignedToYou, yourCategories} = useMemo(() => {
    const assigned = [];
    const personal = [];
    const emailRegex = /\([^\s@)]+@[^\s@)]+\)/;

    categories.forEach(cat => {
      if (emailRegex.test(cat.name)) {
        assigned.push(cat);
      } else {
        personal.push(cat);
      }
    });

    return {
      assignedToYou: assigned,
      yourCategories: personal,
    };
  }, [categories]);

  const renderSection = (title, data, showAddButton = false, viewAllRoute) => {
    const topThree = data.slice(0, 3);
    const moreCount = data.length > 3 ? data.length - 3 : 0;

    return (
      <View style={sharedStyles.sectionContainer}>
        <View style={sharedStyles.headerRow}>
          <Text style={sharedStyles.sectionTitle}>{title}</Text>
          <View style={{flex: 1}} />
          {showAddButton && (
            <TouchableOpacity
              onPress={() => setCreateCategoryModalVisible(true)}
              style={{marginRight: 10}}>
              <Ionicons name="add" size={30} color={'#222'} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => navigation.navigate(viewAllRoute)}>
            <Text style={sharedStyles.viewAll}>View All</Text>
          </TouchableOpacity>
        </View>
        <CategoryList
          categories={topThree}
          onPress={item => {
            // setSelectedCategory(item.id);
            navigation.navigate('CategoryDetailScreen', { item });
            // navigation.navigate('MainApp', {
            //   screen: 'Home',
            // });
          }}
          showEmail={title === 'Assigned to You'}
          listFooterComponent={
            moreCount > 0 ? (
              <View style={sharedStyles.moreCategoriesContainer}>
                <Text style={sharedStyles.moreCategoriesText}>
                  {moreCount} more
                </Text>
              </View>
            ) : (
              data.length === 0 && (
                <View style={sharedStyles.moreCategoriesContainer}>
                  <Text style={sharedStyles.emptyText}>
                    {showAddButton
                      ? 'No Categories!! Create one to keep media and notes organised.'
                      : 'Videos assigned by Mentors will appear here'}
                  </Text>
                </View>
              )
            )
          }
        />
      </View>
    );
  };

  return (
    <View style={[sharedStyles.container, {flexDirection: 'column', gap: 25}]}>
      {/* {renderSection('Assigned to You', assignedToYou, false, 'CategoryScreen')} */}
      {renderSection('Your Categories', yourCategories, true, 'CategoryScreen')}
    </View>
  );
};

export default CategoryPreview;
