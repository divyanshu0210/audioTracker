import {YOUTUBE_API_KEY} from '@env';
import {useNavigation, useRoute} from '@react-navigation/native';
import axios from 'axios';
import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useAppState} from '../contexts/AppStateContext';
import {getItemBySourceId, upsertItem, upsertYoutubeMeta} from '../database/C';
import {getChildrenByParent} from '../database/R';
import BaseMediaListComponent from './BaseMediaListComponent';
import {ItemTypes, ScreenTypes} from '../contexts/constants';
import AppHeader from '../components/headers/AppHeader';

export default function PlaylistView() {
  const navigation = useNavigation();
  const route = useRoute();
  const {playListId, playListInfo} = route.params;
  const {videos, setVideos} = useAppState();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false); // NEW state for refresh button

  useEffect(() => {
    if (!playListId) return;
    let isMounted = true; // Prevent state updates if component unmounts
    fetchVideos();
    return () => {
      isMounted = false; // Cleanup function to prevent memory leaks
    };
  }, [playListId]);

  // Usage in your main fetchVideos function
  const fetchVideos = async () => {
    if (!playListId) return;

    setLoading(true);
    try {
      let videosFromDB = await getVideosFromDB(playListId);
      if (videosFromDB.length > 0) {
        setVideos(videosFromDB);

        setLoading(false);
        return;
      }

      const videosFromAPI = await fetchAndStoreVideos(playListId);
      setVideos(videosFromAPI);
    } catch (error) {
      console.error('Error fetching playlist videos:', error);
      Alert.alert('Error', 'Failed to load playlist videos. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getVideosFromDB = async playListId => {
    if (!playListId) return [];

    console.log('Checking in database...');
    const item = await getItemBySourceId(playListId, 'youtube_playlist');
    if (!item) {
      console.log('Playlist not found in DB:', playListId);
      return [];
    }
    const storedFiles =
      (await getChildrenByParent(item.id, 'youtube_video')) || [];
    // const storedFiles = (await loadVideosFromDB(item.id)) || [];

    if (storedFiles.length > 0) {
      console.log('Videos found in database:', storedFiles.length);
      return storedFiles;
    }

    return [];
  };

  const fetchAndStoreVideos = async playListId => {
    if (!playListId) return [];

    console.log('Fetching from YouTube API...');
    const fetchedVideos = await fetchAllVideos(playListId);
    if (!fetchedVideos || fetchedVideos.length === 0) {
      return [];
    }
    const playlist = await getItemBySourceId(playListId, 'youtube_playlist');
    if (!playlist) {
      console.error('❌ Cannot insert videos: Playlist not found locally.');
      return [];
    }

    const storedItems = await Promise.all(
      fetchedVideos.map(async video => {
        try {
          const savedItem = await upsertItem({
            source_id: video.source_id,
            type: 'youtube_video',
            title: video.title,
            parent_id: playlist.id,
            in_show: 1,
          });

          // Optional but recommended
          const fullItem = await upsertYoutubeMeta({
            item_id: savedItem.id,
            channel_title: video.channelTitle,
            thumbnail: video.thumbnail ?? null,
          });
          return fullItem;
        } catch (err) {
          console.error(
            `Failed to store video ${video.title || video.source_id}:`,
            err,
          );
          return null; // or continue without it — your choice
        }
      }),
    );
    const successfullyStored = storedItems.filter(Boolean);
    console.log(`🟢 Successfully stored ${successfullyStored.length} videos`);
    return successfullyStored;
  };

  // Fetch videos from YouTube API
  const fetchAllVideos = async (playlistId, retries = 3, delay = 1000) => {
    try {
      let videos = [];
      let nextPageToken = null;
      const baseUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=50&key=${YOUTUBE_API_KEY}`;

      while (true) {
        const url = nextPageToken
          ? `${baseUrl}&pageToken=${nextPageToken}`
          : baseUrl;
        let response;

        for (let attempt = 1; attempt <= retries; attempt++) {
          try {
            response = await axios.get(url);
            break; // Exit retry loop if successful
          } catch (err) {
            console.warn(`Attempt ${attempt} failed. Retrying...`);
            if (attempt === retries) throw err; // Throw error if all retries fail
            await new Promise(res => setTimeout(res, delay * attempt)); // Exponential backoff
          }
        }

        if (!response?.data?.items) break;

        videos = videos.concat(
          response.data.items.map(item => ({
            source_id: item.contentDetails.videoId,
            title: item.snippet.title,
            channelTitle: item.snippet.channelTitle,
            thumbnail: `https://img.youtube.com/vi/${item.contentDetails.videoId}/mqdefault.jpg`,
            type: 'youtube_video',
            parent_id: playlistId,
          })),
        );

        nextPageToken = response.data.nextPageToken || null;
        if (!nextPageToken) break;
      }

      return videos;
    } catch (error) {
      console.error('Error fetching playlist videos:', error);
      Alert.alert(
        'Error',
        'Failed to load playlist videos. Please try again later.',
      );
      return null;
    }
  };

  const refreshVideos = async () => {
    if (!playListId) return;

    setRefreshing(true);
    try {
      console.log('Refreshing videos from API...');
      const videosFromAPI = await fetchAndStoreVideos(playListId);
      setVideos(videosFromAPI);
    } catch (error) {
      console.error('Error refreshing videos:', error);
      Alert.alert(
        'Error',
        'Failed to refresh playlist videos. Please try again.',
      );
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={{flex: 1}}>
      <AppHeader
        title={playListInfo.title}
        enableSearch
        searchParams={{
          initialSearchActive: true,
          mode: 'items',
          sourceId: playListInfo.id,
          initialActiveFilters:['youtube_video','youtube_playlist']
        }}
        rightComponent={
          refreshing ? (
            <ActivityIndicator size="small" />
          ) : (
            <TouchableOpacity
              onPress={refreshVideos}
              disabled={loading || refreshing}
              style={{padding: 8}}>
              <MaterialIcons name="refresh" size={24} color="#000" />
            </TouchableOpacity>
          )
        }
      />

      {loading ? (
        <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <BaseMediaListComponent
          mediaList={videos}
          emptyText={'No videos in this playlist.'}
          onRefresh={fetchVideos}
          loading={loading}
          type={ItemTypes.YOUTUBE}
          screen={ScreenTypes.IN}
        />
      )}
    </View>
  );
}
