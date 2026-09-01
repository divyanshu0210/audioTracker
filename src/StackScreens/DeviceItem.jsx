// components/DeviceFileItem.js
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {
  getFileIcon,
  MissingFileChip,
  SharedLinkChip,
} from '../contexts/fileIconHelper';
import {useMediaStore} from '../stores/useMediaStore';

const DeviceItem = ({item}) => {
  // Joined onto the row by getChildrenByParent. Only device files ever have
  // one — every other type builds its link from its own source_id and needs
  // nothing uploaded — so it is simply absent on the iskcon rows that also
  // render through this component.
  const hasSharedLink = !!item?.drive_file_id;

  // Presence is read off validDeviceFiles rather than asking the filesystem
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

  return (
    <View style={styles.audioItem}>
      {getFileIcon(item.mimeType)}

      <View style={styles.itemDetails}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          {/* The link wins when there is one, even for a file whose bytes are
              gone: a Drive copy means the file is recoverable and shareable,
              which is the useful thing to say about it. Tapping the row
              prompts to download it back. The exclamation is kept for the
              case with nothing behind it — missing and no copy to fetch. */}
          {hasSharedLink ? (
            <SharedLinkChip />
          ) : (
            isMissing && <MissingFileChip />
          )}
        </View>
      </View>
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

});
