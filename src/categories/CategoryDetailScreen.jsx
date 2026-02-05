import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  View,
  Text,
} from 'react-native';
import {createMaterialTopTabNavigator} from '@react-navigation/material-top-tabs';
import useDbStore from '../database/dbStore';
import {useAppState} from '../contexts/AppStateContext';
import MainYouTubeView from '../StackScreens/MainYouTubeView';
import DeviceFilesView from '../StackScreens/DeviceFilesView';
import DriveFilesView from '../StackScreens/DriveFilesView';
import React, {useCallback, useEffect, useState} from 'react';
import {
  fetchNotebooksInCategory,
  fetchNotesInCategory,
  getDeviceFilesInCategory,
  getFileItemsInCategory,
  getYouTubeItemsInCategory,
} from './catDB';
import NotesListComponent from '../notes/notesListing/NotesListComponent';
import NotebookScreen from '../StackScreens/NoteBook/NoteBookScreen';
import {useFocusEffect} from '@react-navigation/core';
import AllNotesScreen from '../notes/AllNotesList';
import CategoryList from './CategoryList';

const Tab = createMaterialTopTabNavigator();

const CategoryDetailScreen = ({navigation, route}) => {
  const {item} = route.params;
  // const {notesList,setMainNotesList} = useAppState();
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // const [categoryItems, setCategoryItems] = React.useState({
  //   youtube: [],
  //   file: [],
  //   device_file: [],
  // });

  const {
    setDriveLinksList,
    setItems,
    setDeviceFiles,
    setMainNotesList,
    setNotebooks,
    setSelectedCategory,
  } = useAppState();

  useFocusEffect(
    useCallback(() => {
      return () => {
        setSelectedCategory(null);
      };
    }, []),
  );

  const emailMatch =  item.name.match(/\(([^)]+)\)/);
  const hasEmail = !!emailMatch;
  const displayName = hasEmail
    ? item.name.replace(/\s*\([^)]+\)/, '')
    : item.name;
  const email = hasEmail ? emailMatch[1] : null;

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={{flexDirection: 'column'}}>
          <Text style={{marginRight: 8, color: '#000', fontSize: 20}}>
            {displayName || 'Files'}{' '}
          </Text>  
          <Text style={{marginRight: 8, color: '#777', fontSize: 12}}>
            {email || ''}
          </Text>
        </View>
      ),
    });
  }, [navigation]);

  // Function to load category data
  const loadCategoryData = React.useCallback(() => {
    setLoading(true);
    getYouTubeItemsInCategory(item.id)
      .then(data => {
        console.log('YouTube Items:', data);
        setItems(data);
      })
      .catch(error => console.error('Error loading YouTube items:', error));

    getFileItemsInCategory(item.id)
      .then(data => {
        console.log('File Items:', data);
        setDriveLinksList(data);
      })
      .catch(error => console.error('Error loading File items:', error));

    getDeviceFilesInCategory(item.id)
      .then(data => {
        console.log('Device Files:', data);
        setDeviceFiles(data);
      })
      .catch(error => console.error('Error loading Device Files:', error));

    fetchNotebooksInCategory(item.id, setNotebooks);

    fetchNotesInCategory(item.id)
      .then(data => {
        console.log('Notes:', data);
        setMainNotesList(data);
      })
      .catch(error => console.error('Error loading Notes:', error));
    setLoading(false);
  }, [item.id]);

  React.useEffect(() => {
    const loadData = async () => {
      setDriveLinksList([]);
      setItems([]);
      setDeviceFiles([]);
      setMainNotesList([]);
      setNotebooks([]);
      loadCategoryData();
    };
    loadData();
  }, [loadCategoryData]);

  // Refresh function (called on pull-to-refresh or button press)
  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await loadCategoryData();
    setRefreshing(false);
  }, [loadCategoryData]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: '#000',
          tabBarIndicatorStyle: {backgroundColor: '#000'},
          tabBarStyle: {
            backgroundColor: '#f0f0f0',
            marginBottom: 5,
            borderRadius: 10,
          },
          tabBarLabelStyle: {
            fontWeight: 'bold',
            fontSize: 12,
            marginHorizontal: -15,
          },
        }}>
        <Tab.Screen name="YouTube">
          {() => <MainYouTubeView loading={loading} onRefresh={onRefresh} />}
        </Tab.Screen>
        <Tab.Screen name="Device">
          {() => <DeviceFilesView loading={loading} onRefresh={onRefresh} />}
        </Tab.Screen>
        <Tab.Screen name="Drive">
          {() => <DriveFilesView loading={loading} onRefresh={onRefresh} />}
        </Tab.Screen>
        <Tab.Screen name="Notebooks">
          {() => <NotebookScreen loading={loading} onRefresh={onRefresh} />}
        </Tab.Screen>
        <Tab.Screen name="Notes">{() => <AllNotesScreen />}</Tab.Screen>
      </Tab.Navigator>
    </SafeAreaView>
  );
};

export default CategoryDetailScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 10,
  },
});
