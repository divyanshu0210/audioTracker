import React from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

const DriveRequestAccessScreen = ({ route }) => {
  const { driveId, isFolder } = route.params;

  const url = isFolder
    ? `https://drive.google.com/drive/folders/${driveId}`
    : `https://drive.google.com/file/d/${driveId}/view`;

  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: url }}
        startInLoadingState
        javaScriptEnabled
        domStorageEnabled
      />
    </View>
  );
};

export default DriveRequestAccessScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
