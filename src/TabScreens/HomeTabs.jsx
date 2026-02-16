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
import {useAppState} from '../contexts/AppStateContext';
import useDbStore from '../database/dbStore';

const Tab = createMaterialTopTabNavigator();

const HomeTabs = () => {
  const {
    setDriveLinksList,
    setItems,
    setDeviceFiles,
    setNotebooks,
    selectedCategory,
  } = useAppState();
  const {inserting, restoreInProgress} = useDbStore();

  const [loading, setLoading] = useState(true);

  // Animated loader bar
  const translateX = useRef(new Animated.Value(-100)).current;
  useEffect(() => {
    if (inserting) {
      Animated.loop(
        Animated.timing(translateX, {
          toValue: 300,
          duration: 1200,
          useNativeDriver: true,
        }),
      ).start();
    } else {
      translateX.stopAnimation();
      translateX.setValue(-100);
    }
  }, [inserting]);

  // Data loading functions
  const loadFilesFromDB = async (loader = true) => {
    loader && setLoading(true);
    try {
      const files = selectedCategory
        ? await getCategoryData(selectedCategory, ['device_file'])
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
      const storedItems = selectedCategory
        ? await getCategoryData(selectedCategory, [
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
      const storedItems = selectedCategory
        ? await getCategoryData(selectedCategory, [
            'drive_folder',
            'drive_file',
          ])
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
      const storedItems = selectedCategory
        ? await getCategoryData(selectedCategory, ['notebook'])
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
  }, [selectedCategory]);

  // Trigger reload when selectedCategory changes
  useEffect(() => {
    if (!restoreInProgress) {
      loadAllData();
    }
  }, [selectedCategory, restoreInProgress]);

  // Tab content wrapper
  const renderTabContent = (ScreenComponent, props) => (
    <>
      {inserting && (
        <View style={styles.loaderBarContainer}>
          <Animated.View
            style={[styles.loaderSegment, {transform: [{translateX}]}]}
          />
        </View>
      )}
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
              })
            }
          </Tab.Screen>

          <Tab.Screen name="Device">
            {() =>
              renderTabContent(DeviceFilesView, {
                loading,
                onRefresh: loadFilesFromDB,
              })
            }
          </Tab.Screen>

          <Tab.Screen name="Drive">
            {() =>
              renderTabContent(DriveFilesView, {
                loading,
                onRefresh: loadDriveItemsfromDB,
              })
            }
          </Tab.Screen>

          <Tab.Screen name="Notebooks">
            {() =>
              renderTabContent(NotebookScreen, {
                loading,
                onRefresh: loadNotebooks,
              })
            }
          </Tab.Screen>

          <Tab.Screen name={selectedCategory ? `Notes` : 'All Notes'}>
            {() => renderTabContent(AllNotesScreen, {})}
          </Tab.Screen>
        </Tab.Navigator>
      </View>
    </Provider>
  );
};

export default HomeTabs;

const styles = StyleSheet.create({
  loaderBarContainer: {
    height: 2,
    backgroundColor: '#e0e0e0',
    overflow: 'hidden',
    marginBottom: 5,
    borderRadius: 2,
  },
  loaderSegment: {
    height: 4,
    width: 100,
    backgroundColor: '#007aff',
    borderRadius: 2,
  },
});
