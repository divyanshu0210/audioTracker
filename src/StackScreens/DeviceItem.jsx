// components/DeviceFileItem.js
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Foundation from 'react-native-vector-icons/Foundation';
import { getMediaType, getPlaceholderForMimeType } from '../music/utils';
import { ItemTypes } from '../contexts/constants';

const DeviceItem = ({item}) => {
  const mediaType = getMediaType(item.mimeType);

  return (
    <View style={styles.audioItem}>
      {mediaType !== null &&
        (mediaType === 1 ? (
          <Image
            source={getPlaceholderForMimeType(item.mimeType)}
            style={styles.thumbnail}
          />
        ) : (
          <Foundation
            name="music"
            size={28}
            color="#444"
            style={styles.mediaIcon}
          />
        ))}

      <View style={styles.itemDetails}>
        <Text style={styles.title} numberOfLines={2}>
          {item.name}
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
    // paddingVertical: 10,
    // borderBottomWidth: 0.5,
    // borderBottomColor: '#ddd',
    gap: 10,
    // paddingHorizontal: 5,
  },
  thumbnail: {
    width: 100,
    height: 60,
    borderRadius: 4,
    backgroundColor: '#ccc',
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
  mediaIcon: {
    width: 40,
    height: 40,
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: '#f1f1f1',
    borderRadius: 20,
    marginRight: 10,
  },
});
