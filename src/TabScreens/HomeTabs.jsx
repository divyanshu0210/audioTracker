import React, {useEffect, useRef, useCallback, useState} from 'react';
import {Animated, StyleSheet, View} from 'react-native';
import {createMaterialTopTabNavigator} from '@react-navigation/material-top-tabs';
import {Provider} from 'react-native-paper';
import {getCategoryData} from '../categories/catDB';
import {fetchNotebooks, getChildrenByParent} from '../database/R';
import AllNotesScreen from '../notes/AllNotesList';
import DeviceFilesView from '../StackScreens/DeviceFilesView';
import DriveFilesView from '../StackScreens/DriveFilesView';
import MainYouTubeView from '../StackScreens/MainYouTubeView';
import NotebookScreen from '../StackScreens/NoteBook/NoteBookScreen';
import useDbStore from '../database/dbStore';
import {useFocusEffect} from '@react-navigation/core';
import {LoadingBar} from '../components/LoadingBar';
import useRestoreStore from '../backupRestore/restoreStore';
import {useMediaStore} from '../stores/useMediaStore';
import {useShallow} from 'zustand/react/shallow';
import {useSelectionStore} from '../stores/useSelectionStore';
import {useNotesStore} from '../stores/useNotesStore';

const Tab = createMaterialTopTabNavigator();

const HomeTabs = ({categoryId}) => {
  // Actions
  const setDriveLinksList = useMediaStore(state => state.setDriveLinksList);
  const setItems = useMediaStore(state => state.setItems);
  const setDeviceFiles = useMediaStore(state => state.setDeviceFiles);
  const setNotebooks = useNotesStore(state => state.setNotebooks);

  //States
  const {driveLinksList, items, validDeviceFiles, deviceFiles} = useMediaStore(
    useShallow(state => ({
      driveLinksList: state.driveLinksList,
      items: state.items,
      validDeviceFiles: state.validDeviceFiles,
      deviceFiles: state.deviceFiles,
    })),
  );
  const notebooks = useNotesStore(state => state.notebooks);
  const homeReloadKey = useSelectionStore(state => state.homeReloadKey);

  const inserting = useDbStore(state => state.inserting);
  const isRestoring = useRestoreStore(state => state.isRestoring);

  const [loading, setLoading] = useState(true);

  // Data loading functions
  const loadFilesFromDB = async (loader = true) => {
    loader && setLoading(true);
    try {
      const files = categoryId
        ? await getCategoryData(categoryId, ['device_file'])
        : await getChildrenByParent(null, 'device_file');
      setDeviceFiles(files || []);
    } catch (err) {
      console.error('Error loading files from DB:', err);
    } finally {
      loader && setLoading(false);
    }
  };

  const loadMainYTFromDB = async (loader = true) => {
    loader && setLoading(true);
    try {
      const storedItems = categoryId
        ? await getCategoryData(categoryId, [
            'youtube_video',
            'youtube_playlist',
          ])
        : await getChildrenByParent(null, [
            'youtube_playlist',
            'youtube_video',
          ]);

      setItems(storedItems || []);
    } catch (error) {
      console.error('Error loading folders from DB:', error);
    } finally {
      loader && setLoading(false);
    }
  };

  const loadDriveItemsfromDB = async (loader = true) => {
    loader && setLoading(true);
    try {
      const storedItems = categoryId
        ? await getCategoryData(categoryId, ['drive_folder', 'drive_file'])
        : await getChildrenByParent(null, ['drive_folder', 'drive_file']);

      setDriveLinksList(storedItems || []);
      console.log('Drive items loaded from DB:', storedItems);
    } catch (error) {
      console.error('Error loading folders from DB:', error);
    } finally {
      loader && setLoading(false);
    }
  };

  const loadNotebooks = async (loader = true) => {
    loader && setLoading(true);
    try {
      const storedItems = categoryId
        ? await getCategoryData(categoryId, ['notebook'])
        : await fetchNotebooks(setNotebooks);
      setNotebooks(storedItems || []);
    } catch (error) {
      console.error('Error fetching notebooks:', error);
    } finally {
      loader && setLoading(false);
    }
  };

  const loadAllData = useCallback(async () => {
    setLoading(true);
    setDriveLinksList([]);
    setItems([]);
    setDeviceFiles([]);
    setNotebooks([]);
    try {
      await Promise.all([
        loadMainYTFromDB(false),
        loadDriveItemsfromDB(false),
        loadFilesFromDB(false),
        loadNotebooks(false),
      ]);
    } catch (err) {
      console.error('Failed to load data', err);
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  useEffect(() => {
    if (!isRestoring) {
      loadAllData();
    }
  }, [categoryId, isRestoring, homeReloadKey]);

  // Tab content wrapper
  const renderTabContent = (ScreenComponent, props) => (
    <>
      <LoadingBar isInserting={inserting} />
      <ScreenComponent {...props} />
    </>
  );

  return (
    <Provider>
      <View style={{flex: 1}}>
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
            {() =>
              renderTabContent(MainYouTubeView, {
                loading,
                onRefresh: loadMainYTFromDB,
                data: items,
              })
            }
          </Tab.Screen>

          <Tab.Screen name="Device">
            {() =>
              renderTabContent(DeviceFilesView, {
                loading,
                onRefresh: loadFilesFromDB,
                data: validDeviceFiles,
              })
            }
          </Tab.Screen>

          <Tab.Screen name="Drive">
            {() =>
              renderTabContent(DriveFilesView, {
                loading,
                onRefresh: loadDriveItemsfromDB,
                data: driveLinksList,
              })
            }
          </Tab.Screen>

          <Tab.Screen name="Notebooks">
            {() =>
              renderTabContent(NotebookScreen, {
                loading,
                onRefresh: loadNotebooks,
                data: notebooks,
              })
            }
          </Tab.Screen>

          <Tab.Screen name={categoryId ? `Notes` : 'All Notes'}>
            {
              () => renderTabContent(AllNotesScreen, {categoryId})
              // renderTabContent(AllNotesScreen, {categoryId, key: homeReloadKey+categoryId})
            }
          </Tab.Screen>
        </Tab.Navigator>
      </View>
    </Provider>
  );
};

export default HomeTabs;
