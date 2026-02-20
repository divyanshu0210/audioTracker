import React from 'react';
import {View, StyleSheet} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import Foundation from 'react-native-vector-icons/Foundation';
import Entypo from 'react-native-vector-icons/Entypo'

export const getFileIcon = (input, size = 22, boxSize = 44) => {
  const type = input?.toLowerCase() || '';

  let IconComponent = MaterialCommunityIcons;
  let iconName = 'file-outline';
  let bgColor = '#E5E7EB'; // default gray
  let iconColor = '#374151';

  // Excel
  if (type.includes('excel') || type.includes('spreadsheet')) {
    IconComponent = MaterialCommunityIcons;
    iconName = 'file-excel';
    bgColor = '#E6F4EA';
    iconColor = '#1E7D34';
  }

  // PowerPoint
  else if (type.includes('presentation') || type.includes('powerpoint')) {
    IconComponent = MaterialCommunityIcons;
    iconName = 'microsoft-powerpoint';
    bgColor = '#FCE8E6';
    iconColor = '#D93025';
  }

  // Word
  else if (type.includes('word')) {
    IconComponent = FontAwesome;
    iconName = 'file-word-o';
    bgColor = '#E8F0FE';
    iconColor = '#1A73E8';
  }

  // PDF
  else if (type === 'application/pdf') {
    IconComponent = FontAwesome;
    iconName = 'file-pdf-o';
    bgColor = '#FDECEC';
    iconColor = '#C5221F';
  }

  // Archive
  else if (type.includes('zip') || type.includes('rar')) {
    IconComponent = FontAwesome;
    iconName = 'file-zip-o';
    bgColor = '#FFF4E5';
    iconColor = '#F9A825';
  }

  // Code
  else if (
    type.includes('json') ||
    type.includes('javascript') ||
    type.includes('html') ||
    type.includes('xml')
  ) {
    IconComponent = FontAwesome;
    iconName = 'file-code-o';
    bgColor = '#F3E8FF';
    iconColor = '#7E22CE';
  }

  // Image
  else if (type.startsWith('image/')) {
    IconComponent = FontAwesome;
    iconName = 'image';
    bgColor = '#E0F2FE';
    iconColor = '#0284C7';
  }

  // Video
  else if (type.startsWith('video/')) {
    IconComponent = MaterialCommunityIcons;
    iconName = 'video';
    bgColor = '#EDE9FE';
    iconColor = '#6D28D9';
  }

  // Audio
  else if (type.startsWith('audio/')) {
    IconComponent = Foundation;
    iconName = 'music';
    bgColor = '#FEF3C7';
    iconColor = '#D97706';
  }

  // Folder (Google Drive)
  else if (type === 'application/vnd.google-apps.folder') {
    IconComponent = FontAwesome;
    iconName = 'folder-o';
    bgColor = '#FFF8E1';
    iconColor = '#F4B400';
  }

  // ────────────────────────────────────────────────
  // YouTube (video, playlist, shorts, etc.)
  // ────────────────────────────────────────────────
  else if (type.startsWith('youtube_')) {
    IconComponent = FontAwesome; // or Entypo if you prefer
    iconName = 'youtube-play';
    bgColor = '#FFEEEE'; // light red tint
    iconColor = '#FF0000'; // classic YouTube red
  }

  // ────────────────────────────────────────────────
  // Google Drive (file, folder, doc, sheet, etc.)
  // ────────────────────────────────────────────────
  else if (type.startsWith('drive_')) {
    IconComponent = Entypo;
    iconName = 'google-drive';
    bgColor = '#FFF8E1'; // light yellow/orange tint
    iconColor = '#F4B400'; // Drive yellow-orange
  }

  // ────────────────────────────────────────────────
  // Device / local files
  // ────────────────────────────────────────────────
  else if (type.startsWith('device_')) {
    IconComponent = FontAwesome;
    iconName = 'mobile'; // or 'mobile-phone' if you prefer
    bgColor = '#E6F4EA'; // soft green tint
    iconColor = '#1E7D34'; // green
  }

  // ────────────────────────────────────────────────
  // Notebook (if you want a special case)
  // ────────────────────────────────────────────────
  else if (type === 'notebook') {
    IconComponent = MaterialCommunityIcons;
    iconName = 'notebook-outline'; // nice notebook icon
    bgColor = '#E8F0FE';
    iconColor = '#1A73E8'; // blue-ish
  }

  return (
    <View
      style={[
        styles.container,
        {
          width: boxSize,
          height: boxSize,
          borderRadius: boxSize * 0.28, // keeps rounded proportionally
          backgroundColor: bgColor,
        },
      ]}
    >
      <IconComponent name={iconName} size={size} color={iconColor} />
    </View>
  );
};
const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',

    // subtle shadow (modern look)
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
  },
});
