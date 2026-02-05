
import {DRIVE_API_KEY } from '@env';
import React, { useEffect, useState } from "react";
import { View, TextInput, Button, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import axios from "axios";


const GDriveFolderOverview = ({route}) => {
  const [driveLink, setDriveLink] = useState("");
  const [folderName, setFolderName] = useState(null);
  const [fileTree, setFileTree] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(()=>{
    console.log(route)
    folderId = route.params.driveLink;
if(folderId)
{
  
  setDriveLink(convertToDriveLink(folderId));
  // fetchFileInfo();
}
  },[])

  const convertToDriveLink = (folderId) => {
    if (!folderId || !/^[-\w]{25,}$/.test(folderId)) {
      return null; // Return null if the folderId is invalid
    }
    return `https://drive.google.com/drive/folders/${folderId}`;
  };

  const extractFileId = (input) => {
 
    const match = input.match(/[-\w]{25,}/);
    return match ? match[0] : null;
  };
  const buildTree = (paths) => {
    const tree = {};
    paths.forEach(path => {
      const parts = path.split("/");
      let current = tree;
      for (const part of parts) {
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }
    });
    return tree;
  };

  const fetchFolderContents = async (folderId, apiKey, path = "") => {
    try {
      const response = await axios.get(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType)&key=${apiKey}`
      );
      
      let files = [];
      for (const file of response.data.files) {
        const filePath = path ? `${path}/${file.name}` : file.name;
        if (file.mimeType === "application/vnd.google-apps.folder") {
          const nestedFiles = await fetchFolderContents(file.id, apiKey, filePath);
          files = [...files, ...nestedFiles];
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
      setError("Invalid Google Drive link");
      setLoading(false);
      return;
    }

    try {
      
      // Fetch file/folder metadata
      const metadataResponse = await axios.get(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType&key=${DRIVE_API_KEY}`
      );
      const { name, mimeType } = metadataResponse.data;
      
      if (mimeType === "application/vnd.google-apps.folder") {
        setFolderName(name);
        const files = await fetchFolderContents(fileId, DRIVE_API_KEY);
        setFileTree(buildTree(files));
      } else {
        setFolderName(null);
        setFileTree({ [name]: {} });
      }
    } catch (err) {
      setError("Failed to fetch file/folder information. Check your API key or link.");
    }
    setLoading(false);
  };

  const renderTree = (tree, depth = 0) => {
    return Object.keys(tree).map((key, index) => (
      <View key={index} style={{ marginLeft: depth * 10 }}>
        <Text style={styles.result}>{key}</Text>
        {renderTree(tree[key], depth + 1)}
      </View>
    ));
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Enter Google Drive link"
        value={driveLink}
        onChangeText={setDriveLink}
      />
      <Button title="Get Info" onPress={fetchFileInfo} />
      {loading && <ActivityIndicator size="large" color="#0000ff" style={styles.loader} />}
      {folderName && <Text style={styles.result}>Folder: {folderName}</Text>}
      {fileTree && <ScrollView style={styles.scrollView}>{renderTree(fileTree)}</ScrollView>}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>

    
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  input: {
    width: "100%",
    padding: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    marginBottom: 10,
  },
  scrollView: {
    marginTop: 10,
    width: "100%",
  },
  result: {
    fontSize: 16,
    fontWeight: "bold",
  },
  error: {
    color: "red",
    marginTop: 10,
  },
  loader: {
    marginTop: 20,
  },
});

export default GDriveFolderOverview;
