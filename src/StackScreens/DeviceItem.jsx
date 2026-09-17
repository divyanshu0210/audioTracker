// components/DeviceFileItem.js
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {
  getFileIcon,
  MissingFileChip,
  SharedLinkChip,
  SharedLinkLocalChip,
} from '../contexts/fileIconHelper';
import {AssignmentSubtitle} from '../appMentor/AssignmentStatusStrip';
import {useMediaStore} from '../stores/useMediaStore';
import useDownloadStore from '../stores/useDownloadStore';
import {DownloadProgressIndicator} from '../components/buttons/DownloadProgressIndicator';
import {
  cancelDownload,
  cancelUpload,
} from '../backgroundService/backgroundDownloadService';
import useShareStore from '../stores/useShareStore';

const DeviceItem = ({item}) => {
  const download = useDownloadStore(state => state.downloads[item.source_id]);
  const isDownloading =
    download?.status === 'queued' || download?.status === 'downloading';

  // An upload is the same transfer through the same queue and deserves the
  // same ring, rather than being invisible on the row while the menu was the
  // only place that said anything about it. Keyed by the items-table id, which
  // is what the share store goes by — the download side keys by source_id.
  //
  // Compared against null rather than tested for truth so that 0% still counts
  // as uploading.
  const uploadProgress = useShareStore(state =>
    item?.id != null ? state.uploading[item.id] : undefined,
  );
  const isUploading = uploadProgress != null;

  // Joined onto the row by getChildrenByParent. Only device files ever have
  // one — every other type builds its link from its own source_id and needs
  // nothing uploaded — so it is simply absent on the iskcon rows that also
  // render through this component.
  const hasSharedLink = !!item?.drive_file_id;

  // Presence is read off validDeviceIds rather than asking the filesystem
  // again: setDeviceFiles already ran exactly this check to build that list, and
  // repeating it would be a second stat per row on every render. A boolean
  // selector, so the store snapshot stays stable.
  //
  // Only device files are in that list, so the check is scoped to them — an
  // iskcon row would otherwise read as missing simply for being absent from it.
  const isDeviceFile = item?.type === 'device_file';
  const isMissing = useMediaStore(
    s =>
      isDeviceFile &&
      s.deviceFilesChecked &&
      !s.validDeviceIds[item.source_id],
  );
  const isUnplayable = isMissing && !hasSharedLink;

  return (
    <View style={styles.audioItem}>
              {getFileIcon(item.mimeType)}

      <View style={styles.itemDetails}>
        <View style={styles.titleRow}>
          <Text
            style={[styles.title, isUnplayable && styles.dimmed]}
            numberOfLines={2}>
            {item.title}
          </Text>
          {hasSharedLink ? (
            isMissing ? (
              <SharedLinkChip />
            ) : (
              <SharedLinkLocalChip />
            )
          ) : (
            isMissing && <MissingFileChip />
          )}
        </View>

        <AssignmentSubtitle sourceId={item.source_id} />
      </View>

      {/* The same ring an Iskcon or Drive row shows, in the same place — beside
          the menu BaseItem renders. A device file fetching its Drive copy is
          the same transfer through the same queue, and it used to be the only
          one of the three with nothing on screen while it ran.

          One or the other, never both: a download only happens once the local
          file is gone, and an upload needs it there to send. */}
      {isDownloading ? (
        <DownloadProgressIndicator
          progress={download.progress}
          onCancel={() => cancelDownload(item.source_id)}
        />
      ) : isUploading ? (
        <DownloadProgressIndicator
          progress={uploadProgress}
          onCancel={() =>
            cancelUpload({sourceId: item.source_id, itemId: item.id})
          }
        />
      ) : null}
    </View>
  );
};

// Memoized like IskconItem. BaseItem re-renders on selection, on a store
// change and on every assignment update; without this the whole row visual
// was rebuilt each time, for every row on screen.
export default React.memo(DeviceItem);

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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    flexShrink: 1,
    fontWeight: '500',
    fontSize: 14,
    color: '#222',
  },
  dimmed: {
    opacity: 0.45,
  },

});
