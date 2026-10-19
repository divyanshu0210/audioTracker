import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {continueYouTubeSearch, getYouTubeCollection} from './youtubeSearch';
import {YouTubeSearchResult} from './YouTubeSearchScreen';
import {persistYouTubeVideosForPlayback} from './youtubeItems';

export default function YouTubeCollectionScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const {collectionId, kind, title: fallbackTitle} = route.params || {};
  const requestId = useRef(0);
  const feedRefs = useRef({video: null, playlist: null});
  const [collection, setCollection] = useState(null);
  const [filter, setFilter] = useState('video');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    getYouTubeCollection(collectionId, kind)
      .then(value => {
        if (!alive || currentRequest !== requestId.current) return;
        feedRefs.current = {video: value.feed, playlist: value.playlistFeed};
        setCollection(value);
      })
      .catch(loadError => {
        if (!alive || currentRequest !== requestId.current) return;
        console.warn('Could not load YouTube page:', loadError?.message || loadError);
        setError('Could not load this YouTube page. Check your connection and try again.');
      })
      .finally(() => {
        if (alive && currentRequest === requestId.current) setLoading(false);
      });
    return () => { alive = false; };
  }, [collectionId, kind]);

  const videos = collection?.videos || [];
  const playlists = collection?.playlists || [];
  const items = filter === 'playlist' ? playlists : videos;

  const loadMore = async () => {
    if (
      loading ||
      loadingMore ||
      !feedRefs.current[filter]?.has_continuation
    ) return;
    const currentRequest = requestId.current;
    const currentFeed = feedRefs.current[filter];
    setLoadingMore(true);
    try {
      const response = await continueYouTubeSearch(currentFeed, filter);
      if (currentRequest !== requestId.current) return;
      feedRefs.current[filter] = response.feed;
      setCollection(current => ({
        ...current,
        [filter === 'playlist' ? 'playlists' : 'videos']: (() => {
          const key = filter === 'playlist' ? 'playlists' : 'videos';
          const existing = current[key] || [];
          const existingKeys = new Set(existing.map(item => item.key));
          return [...existing, ...response.items.filter(item => !existingKeys.has(item.key))];
        })(),
      }));
    } catch (loadError) {
      console.warn('Could not load more YouTube items:', loadError?.message || loadError);
    } finally {
      if (currentRequest === requestId.current) setLoadingMore(false);
    }
  };

  const openItem = async item => {
    if (item.kind === 'playlist') {
      navigation.push('YouTubeCollection', {
        collectionId: item.id,
        kind: 'playlist',
        title: item.title,
      });
      return;
    }
    if (item.kind === 'channel') {
      navigation.push('YouTubeCollection', {
        collectionId: item.id,
        kind: 'channel',
        title: item.title,
      });
      return;
    }
    const currentIndex = Math.max(0, videos.findIndex(video => video.id === item.id));
    const [persistedSelectedVideo] = await persistYouTubeVideosForPlayback([
      videos[currentIndex],
    ]);
    const persistedVideos = [...videos];
    persistedVideos[currentIndex] = persistedSelectedVideo;
    persistYouTubeVideosForPlayback(
      videos.filter((_, index) => index !== currentIndex),
    );
    navigation.navigate('BacePlayer', {
      items: persistedVideos,
      currentIndex,
    });
  };

  const pageTitle = collection?.title || fallbackTitle || 'YouTube';
  const showPlaylistFilter = kind === 'channel';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#0f0f0f" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{pageTitle}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('YouTubeSearch')} style={styles.searchButton}>
          <MaterialIcons name="search" size={24} color="#0f0f0f" />
        </TouchableOpacity>
      </View>

      {showPlaylistFilter && (
        <View style={styles.filterBar}>
          {[['video', 'Videos'], ['playlist', 'Playlists']].map(([key, label]) => (
            <TouchableOpacity
              key={key}
              onPress={() => setFilter(key)}
              style={[styles.filterChip, filter === key && styles.activeChip]}>
              <Text style={[styles.filterText, filter === key && styles.activeFilterText]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#ff0033" />
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Text style={styles.stateText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.key}
          renderItem={({item}) => (
            <YouTubeSearchResult item={item} onPress={() => openItem(item)} />
          )}
          ListEmptyComponent={
            <Text style={styles.stateText}>
              {filter === 'playlist' ? 'No playlists found.' : 'No videos found.'}
            </Text>
          }
          ListHeaderComponent={!!collection?.description && filter === 'video' ? (
            <Text style={styles.description} numberOfLines={3}>{collection.description}</Text>
          ) : null}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerLoader} color="#ff0033" /> : null}
          onEndReached={loadMore}
          onEndReachedThreshold={0.55}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#fff'},
  header: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  backButton: {width: 42, height: 44, justifyContent: 'center'},
  headerTitle: {flex: 1, fontSize: 17, fontWeight: '600', color: '#0f0f0f'},
  searchButton: {width: 42, height: 44, justifyContent: 'center', alignItems: 'center'},
  filterBar: {flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 8},
  filterChip: {paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f2f2f2'},
  activeChip: {backgroundColor: '#0f0f0f'},
  filterText: {fontSize: 13, fontWeight: '500', color: '#0f0f0f'},
  activeFilterText: {color: '#fff'},
  description: {fontSize: 13, color: '#606060', paddingHorizontal: 14, paddingVertical: 10},
  listContent: {paddingBottom: 24},
  centerState: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  stateText: {textAlign: 'center', color: '#606060', padding: 30},
  footerLoader: {paddingVertical: 18},
});
