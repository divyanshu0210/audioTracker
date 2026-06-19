import React, {useEffect} from 'react';
import {ActivityIndicator, Alert, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import RNFS from 'react-native-fs';
import CircularProgress from 'react-native-circular-progress-indicator';
import {DRIVE_API_KEY} from '@env';
import {useMediaStore} from '../../stores/useMediaStore';
import {useShallow} from 'zustand/react/shallow';
import useDownloadStore from '../../stores/useDownloadStore';
import {
  enqueueDownload,
  cancelDownload,
} from '../../backgroundService/backgroundDownloadService';

const getLocalFilePath = (sourceId, fileName) => {
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const sanitizedSourceId = sourceId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${RNFS.ExternalDirectoryPath}/${sanitizedSourceId}_${sanitizedFileName}`;
};

export const DownloadButton = ({file}) => {
  const {setDriveLinksList, setData} = useMediaStore(
    useShallow(state => ({
      setDriveLinksList: state.setDriveLinksList,
      setData: state.setData,
    })),
  );

  const download = useDownloadStore(state => state.downloads[file.source_id]);
  const removeDownload = useDownloadStore(state => state.removeDownload);

  const status = download?.status;
  const progress = download?.progress;
  const isActive = status === 'queued' || status === 'downloading';

  // When the background service marks this file done, update the media lists
  // and clear the entry from the download store.
  useEffect(() => {
    if (status !== 'done') return;
    const localPath = download.localPath;

    setData(prev =>
      prev.map(f =>
        f.source_id === file.source_id ? {...f, file_path: localPath} : f,
      ),
    );
    setDriveLinksList(prev =>
      prev.map(f =>
        f.source_id === file.source_id ? {...f, file_path: localPath} : f,
      ),
    );

    Alert.alert('Download complete', `${file.title} saved.`);
    removeDownload(file.source_id);
  }, [status]);

  const handleDownload = async () => {
    const localPath = getLocalFilePath(file.source_id, file.title);

    if (await RNFS.exists(localPath) && localPath === file.file_path) {
      Alert.alert('Already downloaded', 'File is already saved locally.');
      return;
    }

    const url = `https://www.googleapis.com/drive/v3/files/${file.source_id}?alt=media&key=${DRIVE_API_KEY}`;
    await enqueueDownload({
      id: file.id,
      sourceId: file.source_id,
      title: file.title,
      url,
      localPath,
    });
  };

  const handleCancel = () => {
    cancelDownload(file.source_id);
  };

  return (
    <TouchableOpacity
      onPress={isActive ? handleCancel : handleDownload}
      style={{width: 30, height: 30, alignItems: 'center', justifyContent: 'center'}}>
      {isActive ? (
        progress === null || progress === 0 ? (
          <ActivityIndicator size="small" />
        ) : (
          <View style={{width: 30, height: 30, justifyContent: 'center', alignItems: 'center'}}>
            <CircularProgress
              value={progress}
              radius={15}
              duration={100}
              progressValueColor="transparent"
              activeStrokeColor="#2196F3"
              inActiveStrokeColor="#e0e0e0"
              inActiveStrokeWidth={4}
              activeStrokeWidth={4}
              maxValue={100}
            />
            <Ionicons
              name="close"
              size={22}
              color="#000"
              style={{position: 'absolute'}}
            />
          </View>
        )
      ) : (
        <Ionicons name="cloud-download" size={24} color="black" />
      )}
    </TouchableOpacity>
  );
};
