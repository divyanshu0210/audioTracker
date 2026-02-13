import React, {useEffect, useState} from 'react';
import { StyleSheet, Text, View} from 'react-native';
import RNFS from 'react-native-fs';
import {DownloadButton} from '../components/buttons/Download';
import BaseMenu from '../components/menu/BaseMenu';
import {ItemTypes} from '../contexts/constants';
import {useAppState} from '../contexts/AppStateContext';
import {getFileIcon} from '../contexts/fileIconHelper';

const DriveItem = ({item, screen}) => {
  const [fileExists, setFileExists] = useState(false);
  const {driveLinksList, data} = useAppState();

  const isFolder = item?.mimeType === 'application/vnd.google-apps.folder';
  const isVideo = item?.mimeType?.startsWith('video/');

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
  }, [item.file_path, driveLinksList, data]);

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
