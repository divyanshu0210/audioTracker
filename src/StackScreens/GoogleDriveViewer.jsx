import {DRIVE_API_KEY} from '@env';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import axios from 'axios';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useAppState} from '../contexts/AppStateContext';
import {insertOrUpdateFile, insertOrUpdateFolder} from '../database/C';
import {getItemsByParent} from '../database/R';
import BaseMediaListComponent from './BaseMediaListComponent';
import {ItemTypes, ScreenTypes} from '../contexts/constants';

const fetchDriveItems = async (driveId, setData, setLoading) => {
  if (!driveId) {
    console.error('Error', 'Invalid Drive ID');
    return;
  }
  console.log('parent_id', driveId);
  setLoading?.(true);
  try {
    // checkStoredData(fileId)
    console.log('checking in database');
    const storedFiles = await getItemsByParent(driveId);
    console.log(storedFiles);
    if (storedFiles.length > 0) {
      // setData(storedFiles);
      setData(storedFiles);
      setLoading?.(false);
      console.log('Got files in database');
      return;
    } else {
      console.log('not got in DB , fetching using API');

      const response = await axios.get(
        `https://www.googleapis.com/drive/v3/files?q='${driveId}'+in+parents&key=${DRIVE_API_KEY}&fields=files(id,name,mimeType)`,
      );
      const formattedData = response.data.files.map(file => ({
        driveId: file.id, // Renaming id to driveId
        name: file.name,
        mimeType: file.mimeType,
        out_show: 0,
        in_show: 1,
      }));

      setData(formattedData);
      console.log('fetching done');

      //store new data into database
      storeInDB(response.data.files, driveId);
    }
  } catch (error) {
    Alert.alert('Error', 'Failed to fetch Google Drive data.');
    console.log('Failed to fetch Google Drive data.', error);
  } finally {
    setLoading?.(false);
  }
};

const storeInDB = async (files, driveId) => {
  console.log('storing in database', files);
  try {
    for (const item of files) {
      try {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          await insertOrUpdateFolder(item.id, item.name, driveId, null, 1);
        } else {
          await insertOrUpdateFile(
            item.id,
            item.name,
            driveId,
            item.mimeType,
            null,
            null,
            1,
          );
        }
        console.log(`✅ Successfully stored: ${item.name}`);
      } catch (error) {
        console.error(`❌ Error storing ${item.name}:`, error);
      }
    }
    console.log('✅ All items processed');
  } catch (error) {
    console.error('❌ Error in storeInDB:', error);
  }
};

const GoogleDriveViewer = () => {
  const navigation = useNavigation();
  const route = useRoute();

  const {driveInfo, folderStack: passedStack} = route.params || {};
  const [loading, setLoading] = useState(false);
  const breadcrumbListRef = useRef(null);
  const {data, setData, folderStack, setFolderStack} = useAppState();

  useFocusEffect(
    React.useCallback(() => {
      const onBeforeRemove = e => {
        if (folderStack.length > 0) {
          handleBackPress();
        }
      };
      const unsubscribe = navigation.addListener(
        'beforeRemove',
        onBeforeRemove,
      );
      return () => unsubscribe();
    }, [navigation, folderStack]),
  );

  useFocusEffect(
    useCallback(() => {
      if (driveInfo.driveId) {
        fetchDriveItems(driveInfo.driveId, setData, setLoading);
        if (passedStack) {
          setFolderStack(passedStack);
        }
      } else {
        Alert.alert('Invalid URL', 'Please enter a valid Google Drive link.');
      }
    }, [driveInfo, passedStack]),
  );

  useEffect(() => {
    if (folderStack.length > 0) {
      console.log(folderStack);
      setTimeout(
        () => breadcrumbListRef.current?.scrollToEnd({animated: true}),
        10,
      );
    }
  }, [folderStack]);

  const handleBreadcrumbPress = index => {
    if (index !== folderStack.length - 1) {
      const newStack = folderStack.slice(0, index + 1);
      setFolderStack(newStack);
      fetchDriveItems(
        newStack[newStack.length - 1].driveId,
        setData,
        setLoading,
      );
    }
  };

  const handleBackPress = () => {
    const newStack = [...folderStack];
    newStack.pop();
    setFolderStack(newStack);
  };

  return (
    <SafeAreaView style={styles.container}>
      {folderStack.length > 0 && (
        <View style={styles.breadcrumbsContainer}>
          <TouchableOpacity
            onPress={() => {
              //  handleBackPress();
              navigation.goBack();
            }}
            style={styles.iconButton}>
            <MaterialIcons name="arrow-back" size={24} color="gray" />
          </TouchableOpacity>
          <FlatList
            ref={breadcrumbListRef}
            horizontal
            data={folderStack}
            keyExtractor={item => item.driveId}
            renderItem={({item, index}) => (
              <TouchableOpacity onPress={() => handleBreadcrumbPress(index)}>
                <Text style={styles.breadcrumbs}>
                  {index > 0 ? ' / ' : ''}
                  {item.name}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#0000ff" style={styles.loader} />
      ) : (
        <BaseMediaListComponent
          mediaList={data}
          emptyText={'No items in this folder.'}
          onRefresh={() => {}}
          loading={loading}
          type={ItemTypes.DRIVE}
          screen={ScreenTypes.IN}
        />
      )}
    </SafeAreaView>
  );
};

export default GoogleDriveViewer;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  loader: {
    marginTop: 20,
  },
  breadcrumbsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderColor: '#e0e0e0',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 1,
  },
  iconButton: {
    padding: 4,
    paddingRight: 10,
  },
  breadcrumbs: {
    fontSize: 16,
    fontWeight: '500',
    color: '#555',
    paddingHorizontal: 4,
  },
});
