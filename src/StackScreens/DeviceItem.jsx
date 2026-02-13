// components/DeviceFileItem.js
import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import Foundation from 'react-native-vector-icons/Foundation';
import {getMediaType, getPlaceholderForMimeType} from '../music/utils';
import {ItemTypes} from '../contexts/constants';
import {getFileIcon} from '../contexts/fileIconHelper';

const DeviceItem = ({item}) => {
  const mediaType = getMediaType(item.mimeType);

  return (
    <View style={styles.audioItem}>
      {getFileIcon(item.mimeType)}

      <View style={styles.itemDetails}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        {item.source && <Text style={styles.channelText}>{item.source}</Text>}
      </View>

      {/* {item.file_path && <BaseMenu item={item} screen="out" type={ItemTypes.DEVICE}/>} */}
    </View>
  );
};

export default DeviceItem;

const styles = StyleSheet.create({
  audioItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontWeight: '500',
    fontSize: 14,
    color: '#222',
  },
  channelText: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },
});
