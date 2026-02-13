import {DRIVE_API_KEY} from '@env';
import React, {useEffect, useState} from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import axios from 'axios';

const GDriveFolderOverview = ({route}) => {
  const [driveLink, setDriveLink] = useState('');
  const [folderName, setFolderName] = useState(null);
  const [fileTree, setFileTree] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const folderId = route?.params?.driveLink;
    if (folderId) {
      setDriveLink(convertToDriveLink(folderId));
    }
  }, []);

  const convertToDriveLink = folderId => {
    if (!folderId || !/^[-\w]{25,}$/.test(folderId)) return null;
    return `https://drive.google.com/drive/folders/${folderId}`;
  };

  const extractFileId = input => {
    const match = input?.match(/[-\w]{25,}/);
    return match ? match[0] : null;
  };

  const buildTree = paths => {
    const tree = {};
    paths.forEach(path => {
      const parts = path.split('/');
      let current = tree;
      for (const part of parts) {
        if (!current[part]) current[part] = {};
        current = current[part];
      }
    });
    return tree;
  };

  const fetchFolderContents = async (folderId, apiKey, path = '') => {
    try {
      const response = await axios.get(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType)&key=${apiKey}`,
      );

      let files = [];

      for (const file of response.data.files) {
        const filePath = path ? `${path}/${file.name}` : file.name;

        if (file.mimeType === 'application/vnd.google-apps.folder') {
          const nested = await fetchFolderContents(
            file.id,
            apiKey,
            filePath,
          );
          files = [...files, ...nested];
        } else {
          files.push(filePath);
        }
      }

      return files;
    } catch (err) {
      return [];
    }
  };

  const fetchFileInfo = async () => {
    setError(null);
    setFolderName(null);
    setFileTree(null);
    setLoading(true);

    const fileId = extractFileId(driveLink);

    if (!fileId) {
      setError('Invalid Google Drive link');
      setLoading(false);
      return;
    }

    try {
      const metadataResponse = await axios.get(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType&key=${DRIVE_API_KEY}`,
      );

      const {name, mimeType} = metadataResponse.data;

      if (mimeType === 'application/vnd.google-apps.folder') {
        setFolderName(name);
        const files = await fetchFolderContents(fileId, DRIVE_API_KEY);
        setFileTree(buildTree(files));
      } else {
        setFolderName(null);
        setFileTree({[name]: {}});
      }
    } catch (err) {
      setError('Failed to fetch information. Check API key or link.');
    }

    setLoading(false);
  };

  const renderTree = (tree, depth = 0) => {
    return Object.keys(tree).map((key, index) => (
      <View key={`${key}-${index}`} style={{marginLeft: depth * 14}}>
        <Text style={styles.treeItem}>• {key}</Text>
        {renderTree(tree[key], depth + 1)}
      </View>
    ));
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Google Drive Folder Link</Text>

        <TextInput
          style={styles.input}
          placeholder="Paste Drive folder link..."
          value={driveLink}
          onChangeText={setDriveLink}
          placeholderTextColor="#999"
        />

        <TouchableOpacity style={styles.button} onPress={fetchFileInfo}>
          <Text style={styles.buttonText}>Fetch Folder Info</Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <ActivityIndicator size="large" color="#1a73e8" style={styles.loader} />
      )}

      {folderName && (
        <View style={styles.resultCard}>
          <Text style={styles.folderTitle}>📁 {folderName}</Text>
        </View>
      )}

      {fileTree && (
        <ScrollView style={styles.treeContainer}>
          {renderTree(fileTree)}
        </ScrollView>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
    </SafeAreaView>
  );
};

export default GDriveFolderOverview;
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
    padding: 16,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 2},
  },

  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },

  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#fafafa',
  },

  button: {
    marginTop: 12,
    backgroundColor: '#1a73e8',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },

  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },

  loader: {
    marginTop: 20,
  },

  resultCard: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
  },

  folderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
  },

  treeContainer: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
  },

  treeItem: {
    fontSize: 13,
    color: '#444',
    marginVertical: 4,
  },

  error: {
    color: '#d32f2f',
    marginTop: 12,
    fontSize: 13,
  },
});
