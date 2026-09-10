import React, {useEffect, useState} from 'react';
import { StyleSheet, Text, View} from 'react-native';
import RNFS from 'react-native-fs';
import {useShallow} from 'zustand/react/shallow';
import {DownloadProgressIndicator} from '../components/buttons/DownloadProgressIndicator';
import BaseMenu from '../components/menu/BaseMenu';
import {AssignmentSubtitle} from '../appMentor/AssignmentStatusStrip';
import {ItemTypes} from '../contexts/constants';
import {useAppState} from '../contexts/AppStateContext';
import {DownloadedBadge, getFileIcon} from '../contexts/fileIconHelper';
import { useMediaStore } from '../stores/useMediaStore';
import useDownloadStore from '../stores/useDownloadStore';
import {cancelDownload} from '../backgroundService/backgroundDownloadService';

const DriveItem = ({item, screen}) => {
  const [fileExists, setFileExists] = useState(false);

  const {setDriveLinksList, setData} = useMediaStore(
    useShallow(state => ({
      setDriveLinksList: state.setDriveLinksList,
      setData: state.setData,
    })),
  );

  const download = useDownloadStore(state => state.downloads[item.source_id]);
  const removeDownload = useDownloadStore(state => state.removeDownload);
  const isDownloading =
    download?.status === 'queued' || download?.status === 'downloading';

  // The row owns the "download finished" sync, not the menu entry that starts
  // it. react-native-material-menu keeps its children in a Modal that renders
  // nothing while closed, so the menu is almost never mounted at the moment a
  // download completes — the same reason IskconItem carries this too.
  useEffect(() => {
    if (download?.status !== 'done') return;
    const localPath = download.localPath;

    setData(prev =>
      prev.map(f =>
        f.source_id === item.source_id ? {...f, file_path: localPath} : f,
      ),
    );
    setDriveLinksList(prev =>
      prev.map(f =>
        f.source_id === item.source_id ? {...f, file_path: localPath} : f,
      ),
    );

    removeDownload(item.source_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [download?.status]);

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
      <View style={styles.iconWrapper}>
        {getFileIcon(item.mimeType)}
        {!isFolder && fileExists && <DownloadedBadge />}
      </View>

      <View style={styles.textContainer}>
        <Text
          style={[styles.title, isFolder && styles.folderTitle]}
          numberOfLines={1} >
          {item.title ? item.title : 'Google Drive Folder'}
        </Text>

        <AssignmentSubtitle sourceId={item.source_id} isContainer={isFolder} />

        {!isFolder && item?.source && (
          <Text style={styles.meta} numberOfLines={1}>
            {item.source}
          </Text>
        )}
      </View>

      {/* The menu is the row's permanent action now that a Drive file plays
          without being downloaded — Download moved inside it. Progress sits
          beside the menu rather than replacing it, so everything else the menu
          offers stays reachable while bytes are coming down. */}
      <View style={styles.actionWrapper}>
        {!isFolder && isDownloading && (
          <DownloadProgressIndicator
            progress={download.progress}
            onCancel={() => cancelDownload(item.source_id)}
          />
        )}
        <BaseMenu item={item} screen={screen} type={ItemTypes.DRIVE} />
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
    position: 'relative',
  },

  textContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: 15,
  },

  actionWrapper: {
    // minWidth, not width: the row grows by the progress ring while a download
    // runs and settles back afterwards.
    minWidth: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
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


// Memoized like IskconItem. BaseItem re-renders on selection, on a store
// change and on every assignment update; without this the whole row visual
// was rebuilt each time, for every row on screen.
export default React.memo(DriveItem);
