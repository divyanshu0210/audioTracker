// DownloadsView.jsx
//
// Lists every item with a real local copy on disk (downloaded device / drive /
// iskcon files), across all sources. Used both as a preview strip on the
// Profile tab (mode='preview' — a horizontal card scroll like the
// Recently-Watched section, capped + "View All") and as the full screen the
// "View All" button opens (mode='full' — a 2-column card grid).

import React, {useCallback, useEffect, useState} from 'react';
import {
  BackHandler,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useFocusEffect, useRoute} from '@react-navigation/native';
import RNFS from 'react-native-fs';
import ShimmerPlaceholder from 'react-native-shimmer-placeholder';
import {useShallow} from 'zustand/react/shallow';

import {getDownloadedItems} from '../database/R';
import AppHeader from '../components/headers/AppHeader';
import DownloadCard from './DownloadCard';
import {getItemId} from '../StackScreens/BaseMediaListComponent';
import {navigationRef} from '../handlers/navigationRef';
import useDownloadStore from '../stores/useDownloadStore';

const PREVIEW_LIMIT = 6;
const SHIMMER_COUNT = 6;

// Loading placeholder shaped like DownloadCard (card or list variant).
const DownloadCardShimmer = ({variant = 'card'}) => {
  const isList = variant === 'list';
  return (
    <View style={isList ? styles.shimmerListRow : styles.shimmerCard}>
      <ShimmerPlaceholder
        style={isList ? styles.shimmerThumbList : styles.shimmerThumbCard}
        autoRun
      />
      <View style={isList ? styles.shimmerListLines : undefined}>
        <ShimmerPlaceholder style={styles.shimmerLine} autoRun />
        <ShimmerPlaceholder
          style={[styles.shimmerLine, {width: '50%'}]}
          autoRun
        />
      </View>
    </View>
  );
};

export default function DownloadsView({mode = 'full'}) {
  const isPreview = mode === 'preview';
  const [downloads, setDownloads] = useState([]);
  const [loading, setLoading] = useState(true);

  // When opened straight from the downloads notification, MainApp was never
  // mounted (see GoogleLoginScreen.navigateToMain), so "back" must build it now
  // rather than exit the app.
  const route = useRoute();
  const launchedDirectly = !isPreview && route.params?.launchedDirectly;
  const goHome = useCallback(() => {
    navigationRef.reset({index: 0, routes: [{name: 'MainApp'}]});
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!launchedDirectly) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        goHome();
        return true;
      });
      return () => sub.remove();
    }, [launchedDirectly, goHome]),
  );

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const items = await getDownloadedItems();
      // Sort by the local file's modification time (≈ when it was downloaded),
      // most recent first. created_at on the row reflects when it was first
      // seen, not downloaded, so it can't be trusted for download order.
      const withMtime = await Promise.all(
        items.map(async item => {
          let mtime = 0;
          try {
            const stat = await RNFS.stat(item.file_path);
            mtime = new Date(stat.mtime).getTime() || 0;
          } catch {
            // File missing/unreadable — sort it to the bottom.
          }
          return {...item, _mtime: mtime};
        }),
      );
      withMtime.sort((a, b) => b._mtime - a._mtime);
      setDownloads(withMtime);
    } catch (err) {
      console.error('Failed to load downloads:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetch();
    }, [fetch]),
  );

  // In-progress / queued downloads, surfaced from the live download store so
  // they show (with progress) above the already-completed files. Re-fetch the
  // completed list whenever one finishes so it moves from "active" to the DB
  // list without a manual refresh.
  const active = useDownloadStore(
    useShallow(state =>
      Object.entries(state.downloads)
        .filter(([, d]) => d.status === 'downloading' || d.status === 'queued')
        .map(([sourceId, d]) => ({
          _download: d,
          source_id: sourceId,
          title: d.title || 'Downloading…',
          type: d.type,
          mimeType: d.mimeType,
        })),
    ),
  );

  const doneCount = useDownloadStore(
    state => Object.values(state.downloads).filter(d => d.status === 'done').length,
  );
  useEffect(() => {
    if (doneCount > 0) fetch();
  }, [doneCount, fetch]);

  const emptyText = 'No downloads yet. Download a file to access it offline.';

  // Active (downloading/queued) first, then completed.
  const combined = [...active, ...downloads];

  // ── Preview: header + horizontal card strip (mirrors HistoryComponent) ──
  if (isPreview) {
    const displayed = combined.slice(0, PREVIEW_LIMIT);
    return (
      <View style={styles.previewContainer}>
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>
            Downloads
            {downloads.length > 0 && (
              <Text style={styles.countText}> ({downloads.length})</Text>
            )}
          </Text>
          {combined.length > 0 && (
            <TouchableOpacity
              onPress={() => navigationRef.navigate('DownloadsView')}>
              <Text style={styles.viewAll}>View All</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading && combined.length === 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}>
            {Array.from({length: PREVIEW_LIMIT}).map((_, i) => (
              <DownloadCardShimmer key={`shimmer-${i}`} />
            ))}
          </ScrollView>
        ) : combined.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}>
            {displayed.map(item => (
              <DownloadCard
                key={getItemId(item)}
                item={item}
                download={item._download}
              />
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.emptyText}>{emptyText}</Text>
        )}
      </View>
    );
  }

  // ── Full screen: single-column list (mirrors FullHistoryScreen) ──
  return (
    <View style={styles.container}>
      <AppHeader
        title={downloads.length ? `Downloads (${downloads.length})` : 'Downloads'}
        onBackPress={launchedDirectly ? goHome : undefined}
      />
      {loading && combined.length === 0 ? (
        <View style={styles.listContent}>
          {Array.from({length: SHIMMER_COUNT}).map((_, i) => (
            <DownloadCardShimmer key={`shimmer-${i}`} variant="list" />
          ))}
        </View>
      ) : (
        <FlatList
          data={combined}
          keyExtractor={getItemId}
          renderItem={({item}) => (
            <DownloadCard
              item={item}
              variant="list"
              download={item._download}
            />
          )}
          contentContainerStyle={styles.listContent}
          onRefresh={fetch}
          refreshing={loading}
          ListEmptyComponent={<Text style={styles.emptyText}>{emptyText}</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },

  /* ---------- Preview ---------- */
  previewContainer: {
    padding: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  countText: {
    fontSize: 16,
    // fontWeight: '500',
    color: '#000',
  },
  viewAll: {
    color: '#2196F3',
    fontWeight: '500',
    fontSize: 14,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#E3F2FD',
  },
  strip: {
    paddingRight: 8,
  },

  /* ---------- Full list ---------- */
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  /* ---------- Shimmer ---------- */
  shimmerCard: {
    width: 150,
    marginRight: 12,
  },
  shimmerThumbCard: {
    width: 150,
    height: 90,
    borderRadius: 8,
    marginBottom: 8,
  },
  shimmerListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 8,
  },
  shimmerThumbList: {
    width: 120,
    height: 70,
    borderRadius: 8,
  },
  shimmerListLines: {
    flex: 1,
    gap: 6,
  },
  shimmerLine: {
    width: '90%',
    height: 12,
    borderRadius: 4,
    marginBottom: 6,
  },

  /* ---------- Shared ---------- */
  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    paddingVertical: 40,
  },
});
