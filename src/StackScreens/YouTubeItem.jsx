import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import PlaylistThumbnail from '../components/PlaylistThumbnail';
import {ItemTypes} from '../contexts/constants';

export default function YouTubeItem({item}) {
  const isPlaylist = item.type === 'playlist';
  // const useInsideContext = item.extra === 'inside';
  // const screenType = useInsideContext ? 'in' : 'out';

  const thumbnailUri = isPlaylist
    ? {uri: item.thumbnail} || require('../assets/video-placeholder.png')
    : {uri: `https://img.youtube.com/vi/${item.ytube_id}/mqdefault.jpg`};

  return (
    <View style={styles.historyItem}>
      {isPlaylist ? (
        <PlaylistThumbnail uri={{uri: item.thumbnail}} />
      ) : (
        <Image source={thumbnailUri} style={styles.thumbnail} />
      )}

      <View style={styles.itemDetails}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        {(item.channel_title ?? item.channelTitle) && (
          <>
            <Text style={styles.channelText}>
              {item.channel_title ?? item.channelTitle}
            </Text>
            {isPlaylist && (
              <Text style={styles.viewPlaylistText}>View Full Playlist</Text>
            )}
          </>
        )}
      </View>
      {/* <BaseMenu item={item} screen={screenType} type={ItemTypes.YOUTUBE}/> */}
    </View>
  );
}

const styles = StyleSheet.create({
  historyItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  viewPlaylistText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#555',
    marginTop: 2,
  },
});
