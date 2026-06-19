import React, {useEffect, useState} from 'react';
import { StyleSheet, Text, View} from 'react-native';
import RNFS from 'react-native-fs';
import {DownloadButton} from '../components/buttons/Download';
import BaseMenu from '../components/menu/BaseMenu';
import {ItemTypes} from '../contexts/constants';
import {useAppState} from '../contexts/AppStateContext';
import {getFileIcon} from '../contexts/fileIconHelper';
import { useMediaStore } from '../stores/useMediaStore';

const DriveItem = ({item, screen}) => {
  const [fileExists, setFileExists] = useState(false);

  // Read file_path from the store so it stays fresh after a download completes,
  // even when the parent component holds a stale local copy of the item.
  const filePath = useMediaStore(state => {
    const found =
      state.driveLinksList.find(f => f.source_id === item.source_id) ||
      state.data.find(f => f.source_id === item.source_id);
    return found?.file_path ?? item.file_path ?? null;
  });

  const isFolder = item?.mimeType === 'application/vnd.google-apps.folder';
  const isVideo = item?.mimeType?.startsWith('video/');

  useEffect(() => {
    let mounted = true;
    const checkFile = async () => {
      if (!filePath) {
        if (mounted) setFileExists(false);
        return;
      }
      const exists = await RNFS.exists(filePath);
      if (mounted) setFileExists(exists);
    };
    checkFile();
    return () => {
      mounted = false;
    };
  }, [filePath]);

  return (
    <View style={styles.row}>
      <View style={styles.iconWrapper}>{getFileIcon(item.mimeType)}</View>

      <View style={styles.textContainer}>
        <Text
          style={[styles.title, isFolder && styles.folderTitle]}
          numberOfLines={1} >
          {item.title ? item.title : 'Google Drive Folder'}
        </Text>

        {!isFolder && item?.source && (
          <Text style={styles.meta} numberOfLines={1}>
            {item.source}
          </Text>
        )}
      </View>

      <View style={styles.actionWrapper}>
        {isFolder ? (
          <BaseMenu item={item} screen={screen} type={ItemTypes.DRIVE} />
        ) : fileExists ? (
          <BaseMenu item={item} screen={screen} type={ItemTypes.DRIVE} />
        ) : (
          <DownloadButton file={item} />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight:10,
  },

  textContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: 15,
  },

  actionWrapper: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },

  folderTitle: {
    fontWeight: '600',
  },

  meta: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
});


export default DriveItem;
