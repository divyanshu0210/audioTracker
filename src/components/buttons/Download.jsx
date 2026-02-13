import React, {useRef, useState} from 'react';
import {Alert, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import RNFS from 'react-native-fs';
import CircularProgress from 'react-native-circular-progress-indicator';
import {DRIVE_API_KEY} from '@env';
import {updateFilePath, updateItemFields} from '../../database/U';
import { useAppState } from '../../contexts/AppStateContext';

export const DownloadButton = ({file}) => {
  const [downloadingFileId, setDownloadingFileId] = useState(null);
  const [progress, setProgress] = useState(0);
  const {setDriveLinksList, setData} = useAppState();
  const currentDownloadJobId = useRef(null);

  const getLocalFilePath = (sourceId, fileName) => {
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const sanitizedSourceId = sourceId.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${RNFS.ExternalDirectoryPath}/${sanitizedSourceId}_${sanitizedFileName}`;
  };

  const isFileDownloaded = async filePath => {
    return await RNFS.exists(filePath);
  };

  const onDownloadComplete = (file, localPath) => {
    setData(prevData =>
      prevData.map(f =>
        f.source_id === file.source_id ? {...f, file_path: localPath} : f,
      ),
    );
    setDriveLinksList(prevData =>
      prevData.map(f =>
        f.source_id === file.source_id ? {...f, file_path: localPath} : f,
      ),
    );
  };

  const handleDownload = async file => {
    const localPath = getLocalFilePath(file.source_id, file.title);
    try {
      setDownloadingFileId(file.source_id);
      setProgress(0);

      const isDownloaded = await isFileDownloaded(localPath);
      if (isDownloaded && localPath === file.file_path) {
        Alert.alert('Already downloaded', `File is already at: ${localPath}`);
        return;
      }

      const url = `https://www.googleapis.com/drive/v3/files/${file.source_id}?alt=media&key=${DRIVE_API_KEY}`;

      const downloadOptions = {
        fromUrl: url,
        toFile: localPath,
        progressDivider: 1,
        begin: res => {
          currentDownloadJobId.current = res.jobId;
          console.log('Download started:', res);
        },
        progress: res => {
          const percent = Math.round(
            (res.bytesWritten / res.contentLength) * 100,
          );
          setProgress(percent);
        },
      };

      const result = await RNFS.downloadFile(downloadOptions).promise;
      currentDownloadJobId.current = null;

      if (result.statusCode === 200) {
        await updateItemFields(file.id, {file_path: localPath});
        onDownloadComplete(file, localPath);
        Alert.alert('Download Complete', `File saved to: ${localPath}`);
      }
    } catch (error) {
      // console.error('Download failed or cancelled:', error);
      if (await RNFS.exists(localPath)) {
        await RNFS.unlink(localPath);
        console.log('Partial file deleted');
      }
    } finally {
      setDownloadingFileId(null);
      setProgress(0);
    }
  };

  const handleCancelDownload = () => {
    setDownloadingFileId(null);
    if (currentDownloadJobId.current !== null) {
      RNFS.stopDownload(currentDownloadJobId.current);
      currentDownloadJobId.current = null;
      setProgress(0);
      Alert.alert('Download canceled');
    }
  };

  const isDownloading = downloadingFileId === file.source_id;

  return (
    <TouchableOpacity
      onPress={
        isDownloading ? handleCancelDownload : () => handleDownload(file)
      }
      style={{
        width: 30,
        height: 30,

        alignItems: 'center',
        justifyContent: 'center',
        // backgroundColor: '#000',
      }}>
      {isDownloading ? (
        <View
          style={{
            width: 30,
            height: 30,
            justifyContent: 'center',
            alignItems: 'center',
          }}>
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
            title=""
          />
          <Ionicons
            name="close"
            size={22}
            color="#000"
            style={{
              position: 'absolute',
              alignSelf: 'center',
            }}
          />
        </View>
      ) : (
        <Ionicons name="cloud-download" size={24} color="black" />
      )}
    </TouchableOpacity>
  );
};
