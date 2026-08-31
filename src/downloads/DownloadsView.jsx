// DownloadsView.jsx
//
// Lists everything downloaded from elsewhere and kept on disk (drive and
// iskcon files — not device files, which are local imports; see
// getDownloadedItems). Used both as a preview strip on the
// Profile tab (mode='preview' — a horizontal card scroll like the
// Recently-Watched section, capped + "View All") and as the full screen the
// "View All" button opens (mode='full' — a 2-column card grid).

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useFocusEffect, useRoute} from '@react-navigation/native';
import RNFS from 'react-native-fs';
import ShimmerPlaceholder from 'react-native-shimmer-placeholder';

import {getDownloadedItems} from '../database/R';
import AppHeader from '../components/headers/AppHeader';
import DownloadCard from './DownloadCard';
import BaseMediaListComponent, {
  getItemId,
} from '../StackScreens/BaseMediaListComponent';
import {ScreenTypes} from '../contexts/constants';
import {navigationRef} from '../handlers/navigationRef';
import useDownloadStore from '../stores/useDownloadStore';

const PREVIEW_LIMIT = 6;
const SHIMMER_COUNT = 6;

// The list's row visual, so a download keeps looking like a download while
// BaseItem supplies the press handling, selection and menu around it. Defined
// at module scope so the reference is stable across renders.
const DownloadRow = props => <DownloadCard {...props} variant="list" embedded />;

// Group by when the file actually reached the disk, matching the sort in
// fetch(). created_at is the day the item was added, which for something
// downloaded later is a different day; updated_at is no better, since the
// trigger bumps it on any write — the player's duration update alone would
// move a months-old download into Today the first time it was played. Rows
// whose file could not be stat-ed fall back rather than landing in 1970.
const downloadDate = item => item?._mtime || item?.created_at;

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
      //
      // A row whose file is gone is dropped rather than listed as something
      // that cannot be opened. It used to be kept and sorted to the bottom on
      // mtime 0, which stopped working once rows were grouped by date.
      //
      // stat throwing is not proof of that on its own — it fails for anything
      // that goes wrong reading the file, and dropping on every failure would
      // hide a download that is really there. So absence is confirmed with
      // exists() before dropping, which costs an extra call only for rows that
      // already looked wrong; a file that is present but unreadable is kept,
      // with mtime 0 sending it to its created_at group.
      //
      // The stale file_path is left in the db either way: every screen showing a
      // download state asks the filesystem rather than trusting the column, and
      // the next download of that item overwrites it.
      const withMtime = await Promise.all(
        items.map(async item => {
          try {
            const stat = await RNFS.stat(item.file_path);
            return {...item, _mtime: new Date(stat.mtime).getTime() || 0};
          } catch {
            const there = await RNFS.exists(item.file_path).catch(() => false);
            return there ? {...item, _mtime: 0} : null;
          }
        }),
      );
      const present = withMtime.filter(Boolean);
      present.sort((a, b) => b._mtime - a._mtime);
      setDownloads(present);
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
  //
  // The store object is subscribed to directly and the shaping happens below,
  // rather than mapping inside the selector. Zustand 5 reads a selector through
  // useSyncExternalStore, which requires the snapshot to be stable between
  // calls; a selector building fresh objects returns a new array every time and
  // useShallow can't cache that, since shallow equality compares an array's
  // elements by reference and every element is new. The snapshot never settled
  // and React bailed out with "Maximum update depth exceeded". It only showed
  // while something was actually downloading — with an empty queue the selector
  // returned [], and [] is shallow-equal to [], so it cached fine.
  const downloadMap = useDownloadStore(state => state.downloads);
  const active = useMemo(
    () =>
      Object.entries(downloadMap)
        .filter(([, d]) => d.status === 'downloading' || d.status === 'queued')
        .map(([sourceId, d]) => ({
          _download: d,
          source_id: sourceId,
          title: d.title || 'Downloading…',
          type: d.type,
          mimeType: d.mimeType,
        })),
    [downloadMap],
  );

  // This list is local state read straight from the db, so nothing that changes
  // an item's file_path reaches it on its own — not a finished download, not a
  // "Remove Download" from the menu, not a bulk delete. Each of those bumps
  // downloadsVersion instead, and this re-reads.
  //
  // The version is only compared against what this screen last saw, never
  // against zero: the counter is session-wide, so mounting after any earlier
  // download would otherwise fire a second query on top of the focus effect.
  const downloadsVersion = useDownloadStore(state => state.downloadsVersion);
  const seenVersion = useRef(downloadsVersion);
  useEffect(() => {
    if (seenVersion.current === downloadsVersion) return;
    seenVersion.current = downloadsVersion;
    fetch();
  }, [downloadsVersion, fetch]);

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

  // ── Full screen ──
  //
  // Rendered through BaseMediaListComponent, so a download gets everything an
  // item gets anywhere else in the app: long-press selection, the bulk-action
  // header, and the full per-item menu. A downloads list you can only look at
  // means hunting the same file down in its own tab to act on it. The rows
  // still draw as DownloadCards (itemComponent) — only the behaviour around
  // them is shared.
  //
  // Only completed downloads go through it. An active one has no db row and no
  // local file yet, so it can't be selected, deleted, noted or categorised —
  // the only thing to do with it is cancel it. Those stay as DownloadCards in
  // the list header, keeping their progress overlay and cancel button.
  const activeHeader =
    active.length > 0 ? (
      <View style={styles.activeSection}>
        <Text style={styles.activeTitle}>
          {active.length === 1
            ? 'Downloading'
            : `Downloading (${active.length})`}
        </Text>
        {active.map(item => (
          <DownloadCard
            key={getItemId(item)}
            item={item}
            variant="list"
            download={item._download}
          />
        ))}
      </View>
    ) : null;

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
        <BaseMediaListComponent
          mediaList={downloads}
          emptyText={emptyText}
          onRefresh={fetch}
          loading={loading}
          listHeaderComponent={activeHeader}
          itemComponent={DownloadRow}
          groupDate={downloadDate}
          // No single type: the list mixes drive and iskcon rows, so
          // BaseItem resolves each row's type from the row itself.
          type={null}
          // 'in' is what makes a delete here un-download rather than remove the
          // library item, matching what DriveMenuItems does inside a folder.
          screen={ScreenTypes.IN}
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
  activeSection: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  activeTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#777',
    paddingVertical: 5,
  },
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
