import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import PlaylistThumbnail from '../../components/PlaylistThumbnail';
import {
  addYouTubeSearchHistory,
  getYouTubeSearchHistory,
} from './youtubeSearchHistory';
import {
  continueYouTubeSearch,
  searchYouTube,
} from './youtubeSearch';
import {persistYouTubeVideosForPlayback} from './youtubeItems';

const FILTERS = [
  {key: 'all', label: 'All'},
  {key: 'video', label: 'Videos'},
  {key: 'playlist', label: 'Playlists'},
  {key: 'channel', label: 'Channels'},
];

export function YouTubeSearchResult({item, onPress}) {
  const thumbnail = item.thumbnail ? {uri: item.thumbnail} : undefined;
  const isChannel = item.kind === 'channel';

  if (isChannel) {
    return (
      <TouchableOpacity style={styles.channelResult} onPress={onPress}>
        <Image source={thumbnail} style={styles.channelAvatar} />
        <View style={styles.resultText}>
          <Text style={styles.resultTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.resultMeta} numberOfLines={2}>
            {item.subtitle || 'YouTube channel'}
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={24} color="#606060" />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.mediaResult} onPress={onPress}>
      <View style={styles.thumbnailFrame}>
        {item.kind === 'playlist' ? (
          <PlaylistThumbnail uri={thumbnail} size="search" />
        ) : (
          <View>
            <Image source={thumbnail} style={styles.videoThumbnail} />
            {!!item.duration && (
              <Text style={styles.durationBadge}>{item.duration}</Text>
            )}
          </View>
        )}
      </View>
      <View style={styles.resultText}>
        <Text style={styles.resultTitle} numberOfLines={2}>{item.title}</Text>
        {!!item.channelTitle && (
          <Text style={styles.resultMeta} numberOfLines={1}>
            {item.channelTitle}
          </Text>
        )}
        <Text style={styles.resultMeta} numberOfLines={1}>
          {item.kind === 'playlist'
            ? [item.subtitle, 'Playlist'].filter(Boolean).join(' · ')
            : [item.views, item.published].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function YouTubeSearchScreen() {
  const navigation = useNavigation();
  const inputRef = useRef(null);
  const feedRef = useRef(null);
  const requestIdRef = useRef(0);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [results, setResults] = useState([]);
  const [searchHistory, setSearchHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    getYouTubeSearchHistory().then(history => {
      if (alive) setSearchHistory(history);
    });
    return () => {
      alive = false;
    };
  }, []);

  const runSearch = useCallback(async (text, filter = activeFilter) => {
    const normalizedQuery = text.trim();
    if (!normalizedQuery) return;
    Keyboard.dismiss();
    const requestId = ++requestIdRef.current;
    setQuery(normalizedQuery);
    setSubmittedQuery(normalizedQuery);
    setLoading(true);
    setLoadingMore(false);
    setError('');
    setResults([]);
    feedRef.current = null;
    const updatedHistory = await addYouTubeSearchHistory(normalizedQuery);
    if (requestId === requestIdRef.current) setSearchHistory(updatedHistory);

    try {
      const response = await searchYouTube(normalizedQuery, filter);
      if (requestId !== requestIdRef.current) return;
      feedRef.current = response.feed;
      setResults(response.items);
    } catch (searchError) {
      if (requestId !== requestIdRef.current) return;
      console.warn('YouTube search failed:', searchError?.message || searchError);
      setError('Could not load YouTube results. Check your connection and try again.');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [activeFilter]);

  const changeFilter = filter => {
    setActiveFilter(filter);
    if (submittedQuery) runSearch(submittedQuery, filter);
  };

  const loadMore = async () => {
    if (loading || loadingMore || !feedRef.current?.has_continuation) return;
    const requestId = requestIdRef.current;
    setLoadingMore(true);
    try {
      const response = await continueYouTubeSearch(feedRef.current, activeFilter);
      if (requestId !== requestIdRef.current) return;
      feedRef.current = response.feed;
      setResults(current => {
        const existing = new Set(current.map(item => item.key));
        return [...current, ...response.items.filter(item => !existing.has(item.key))];
      });
    } catch (searchError) {
      console.warn('Could not load more YouTube results:', searchError?.message || searchError);
    } finally {
      if (requestId === requestIdRef.current) setLoadingMore(false);
    }
  };

  const openResult = async item => {
    if (item.kind === 'video') {
      const playableVideos = results.filter(result => result.kind === 'video');
      const currentIndex = Math.max(
        0,
        playableVideos.findIndex(video => video.id === item.id),
      );
      const selectedVideo = playableVideos[currentIndex];
      const [persistedSelectedVideo] = await persistYouTubeVideosForPlayback([
        selectedVideo,
      ]);
      const persistedVideos = [...playableVideos];
      persistedVideos[currentIndex] = persistedSelectedVideo;
      persistYouTubeVideosForPlayback(
        playableVideos.filter((_, index) => index !== currentIndex),
      );
      navigation.navigate('BacePlayer', {items: persistedVideos, currentIndex});
      return;
    }
    navigation.navigate('YouTubeCollection', {
      collectionId: item.id,
      kind: item.kind,
      title: item.title,
    });
  };

  const listHeader = (
    <View>
      <View style={styles.filterBar}>
        {FILTERS.map(filter => (
          <TouchableOpacity
            key={filter.key}
            onPress={() => changeFilter(filter.key)}
            style={[styles.filterChip, activeFilter === filter.key && styles.activeChip]}>
            <Text style={[styles.filterText, activeFilter === filter.key && styles.activeFilterText]}>
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {!!submittedQuery && !loading && (
        <Text style={styles.queryCaption}>Search results for “{submittedQuery}”</Text>
      )}
    </View>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
          <MaterialIcons name="arrow-back" size={24} color="#0f0f0f" />
        </TouchableOpacity>
        <View style={styles.searchInputShell}>
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => runSearch(query)}
            placeholder="Search YouTube"
            placeholderTextColor="#777"
            autoFocus
            returnKeyType="search"
            autoCorrect={false}
            style={styles.searchInput}
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery('')} style={styles.clearButton}>
              <MaterialIcons name="close" size={20} color="#606060" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Search"
          onPress={() => runSearch(query)}
          style={styles.submitButton}>
          <MaterialIcons name="search" size={24} color="#0f0f0f" />
        </TouchableOpacity>
      </View>

      {loading && !results.length ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#ff0033" />
          <Text style={styles.stateText}>Searching YouTube…</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <MaterialIcons name="wifi-off" size={32} color="#777" />
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity onPress={() => runSearch(query || submittedQuery)}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : !submittedQuery ? (
        <FlatList
          data={searchHistory}
          keyExtractor={item => item.toLocaleLowerCase()}
          renderItem={({item}) => (
            <TouchableOpacity
              style={styles.historyRow}
              onPress={() => runSearch(item)}>
              <MaterialIcons name="history" size={21} color="#777" />
              <Text style={styles.historyText} numberOfLines={1}>{item}</Text>
              <MaterialIcons name="north-west" size={18} color="#909090" />
            </TouchableOpacity>
          )}
          ListHeaderComponent={searchHistory.length ? (
            <Text style={styles.historyHeading}>Recent searches</Text>
          ) : null}
          ListEmptyComponent={
            <View style={styles.centerState}>
              <MaterialIcons name="search" size={38} color="#909090" />
              <Text style={styles.stateText}>Search videos, playlists, and channels</Text>
            </View>
          }
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.historyContent}
        />
      ) : (
        <FlatList
          data={results}
          keyExtractor={item => item.key}
          renderItem={({item}) => (
            <YouTubeSearchResult item={item} onPress={() => openResult(item)} />
          )}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            loading ? null : <Text style={styles.emptyText}>No results found.</Text>
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={styles.footerLoader} color="#ff0033" /> : null
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.55}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.resultsContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#fff'},
  topBar: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  iconButton: {width: 40, height: 44, alignItems: 'center', justifyContent: 'center'},
  searchInputShell: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: 22,
    backgroundColor: '#f2f2f2',
  },
  searchInput: {flex: 1, fontSize: 15, paddingVertical: 0, color: '#0f0f0f'},
  clearButton: {padding: 4},
  submitButton: {width: 42, height: 44, alignItems: 'center', justifyContent: 'center'},
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f2f2f2',
  },
  activeChip: {backgroundColor: '#0f0f0f'},
  filterText: {fontSize: 13, fontWeight: '500', color: '#0f0f0f'},
  activeFilterText: {color: '#fff'},
  queryCaption: {paddingHorizontal: 14, paddingVertical: 8, color: '#606060', fontSize: 13},
  historyContent: {flexGrow: 1, paddingBottom: 24},
  historyHeading: {paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8, color: '#606060', fontSize: 14, fontWeight: '600'},
  historyRow: {minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16},
  historyText: {flex: 1, color: '#202124', fontSize: 14},
  resultsContent: {paddingBottom: 24},
  mediaResult: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
  },
  thumbnailFrame: {width: 140, height: 80, justifyContent: 'center', alignItems: 'center'},
  videoThumbnail: {width: 140, height: 80, borderRadius: 8, backgroundColor: '#eee'},
  resultText: {flex: 1, justifyContent: 'center'},
  resultTitle: {fontSize: 14, lineHeight: 19, fontWeight: '500', color: '#0f0f0f'},
  resultMeta: {fontSize: 12, lineHeight: 17, color: '#606060', marginTop: 3},
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    overflow: 'hidden',
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.8)',
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  channelResult: {
    minHeight: 102,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 12,
    gap: 18,
  },
  channelAvatar: {width: 68, height: 68, borderRadius: 34, backgroundColor: '#eee'},
  centerState: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12},
  stateText: {textAlign: 'center', color: '#606060', fontSize: 14},
  retryText: {color: '#065fd4', fontWeight: '600', padding: 8},
  emptyText: {textAlign: 'center', color: '#606060', paddingVertical: 42},
  footerLoader: {paddingVertical: 18},
});
