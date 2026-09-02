import React, {useEffect} from 'react';
import {ToastAndroid, TouchableOpacity} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import RNFS from 'react-native-fs';
import {useMediaStore} from '../../stores/useMediaStore';
import {useShallow} from 'zustand/react/shallow';
import useDownloadStore from '../../stores/useDownloadStore';
import {
  enqueueDownload,
  cancelDownload,
} from '../../backgroundService/backgroundDownloadService';
import {DownloadProgressIndicator} from './DownloadProgressIndicator';

// Exported because media arriving with a shared note is downloaded from the
// same Drive endpoint and has to land on the same path this button would have
// given it — otherwise tapping Download afterwards fetches a second copy.
export const getLocalFilePath = (sourceId, fileName) => {
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

    removeDownload(file.source_id);
  }, [status]);

  const handleDownload = async () => {
    const localPath = getLocalFilePath(file.source_id, file.title);

    if (await RNFS.exists(localPath) && localPath === file.file_path) {
      ToastAndroid.show('Already downloaded', ToastAndroid.SHORT);
      return;
    }

    const url = `https://www.googleapis.com/drive/v3/files/${file.source_id}?alt=media`;
    await enqueueDownload({
      id: file.id,
      sourceId: file.source_id,
      title: file.title,
      url,
      localPath,
      type: file.type,
      mimeType: file.mimeType,
      googleAuth: true,
    });
    ToastAndroid.show(
      'Preparing download. See notification for details',
      ToastAndroid.LONG,
    );
  };

  const handleCancel = () => {
    cancelDownload(file.source_id);
  };

  if (isActive) {
    return (
      <DownloadProgressIndicator progress={progress} onCancel={handleCancel} />
    );
  }

  return (
    <TouchableOpacity
      onPress={handleDownload}
      style={{width: 30, height: 30, alignItems: 'center', justifyContent: 'center'}}>
      <Ionicons name="cloud-download" size={24} color="black" />
    </TouchableOpacity>
  );
};
