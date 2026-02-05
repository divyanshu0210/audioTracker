import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import RNFS from 'react-native-fs';
import Foundation from 'react-native-vector-icons/Foundation';
import { DownloadButton } from '../components/buttons/Download';
import { getPlaceholderForMimeType } from '../music/utils';
import BaseMenu from '../components/menu/BaseMenu';
import { ItemTypes } from '../contexts/constants';
import { useAppState } from '../contexts/AppStateContext';

const DriveItem = ({item,screen}) => {
  const [fileExists, setFileExists] = useState(false);
  const {driveLinksList, data} = useAppState();

  const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
  const isAudio = item.mimeType?.startsWith('audio/');
  const isVideo = item.mimeType?.startsWith('video/');

  useEffect(() => {
    let mounted = true;
    const checkFile = async () => {
      if (!item.file_path) {
        if (mounted) setFileExists(false);
        return;
      }
      const exists = await RNFS.exists(item.file_path);
      if (mounted) setFileExists(exists);
    };
    checkFile();
    return () => {
      mounted = false;
    };
  }, [item.file_path,driveLinksList,data]);

  if (isFolder) {
    return (
      <View style={styles.historyItem}>
        <Text style={styles.folderText}>
          📂{' '}
          {item.name !== 'Unknown Folder' ? item.name : 'Google Drive Folder'}
        </Text>
        {/* {!useInsideContext && (
          // <ParentFolderMenu isIcon driveInfo={item} />
          // <BaseMenu  item={item} type={ItemTypes.DRIVE}/>
        )} */}
      </View>
    );
  }

  return (
    <View style={styles.historyItem}>
      {isVideo ? (
        <Image
          source={getPlaceholderForMimeType(item.mimeType)}
          style={styles.thumbnail}
        />
      ) : isAudio ? (
        <Foundation
          name="music"
          size={28}
          color="#000"
          style={styles.mediaIcon}
        />
      ) : (
        <Image
          source={getPlaceholderForMimeType(item.mimeType)}
          style={styles.thumbnail}
        />
      )}

      <View style={styles.itemDetails}>
        <Text style={styles.title} numberOfLines={2}>
          {item.name}
        </Text>
        {item.source && <Text style={styles.channelText}>{item.source}</Text>}
      </View>

      {fileExists ? (
        <BaseMenu item={item} screen={screen} type={ItemTypes.DRIVE}/>
      ) : (
        <DownloadButton file={item} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    // paddingVertical: 10,
    // paddingHorizontal: 7,
    // borderBottomWidth: 0.5,
    // borderBottomColor: '#ddd',
    gap: 10,
  },
  thumbnail: {
    width: 100,
    height: 60,
    borderRadius: 4,
    backgroundColor: '#ccc',
  },
  mediaIcon: {
    width: 60,
    height: 60,
    borderRadius: 4,
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: '#eee',
    lineHeight: 60,
  },
  itemDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontWeight: '500',
    fontSize: 14,
    color: '#222',
  },
  channelText: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },
  folderText: {
    fontWeight: '500',
    fontSize: 14,
    color: '#222',
    flex: 1,
    padding: 10,
  },
});

export default DriveItem;
