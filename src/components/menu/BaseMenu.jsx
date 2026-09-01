import React, {useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {Menu, MenuItem} from 'react-native-material-menu';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAppState} from '../../contexts/AppStateContext';
import CommonMenuItems from './CommonMenuItems';
import DriveMenuItems from './DriveMenuItems';
import IskconMenuItems from './IskconMenuItems';
import NBMenuItems from './NBMenuItems';
import NoteMenuItems from './NoteMenuItems';
import YTMenuItems from './YTMenuItems';
import {ItemTypes} from '../../contexts/constants';
import { useSelectionStore } from '../../stores/useSelectionStore';
import { useNotesStore } from '../../stores/useNotesStore';
import { useShallow } from 'zustand/react/shallow';
import {copyLink, getShareLink} from '../../Linking/utils/shareLink';
import useShareStore from '../../stores/useShareStore';
import {useMediaStore} from '../../stores/useMediaStore';
import {confirmAndShareDeviceFile} from '../../share/shareDeviceFile';

const BaseMenu = ({item, type, screen}) => {
  const [visible, setVisible] = useState(false);
const {setActiveItem} = useSelectionStore(
  useShallow(state => ({
    setActiveItem: state.setActiveItem,
  })),
);

const {setSelectedNote} = useNotesStore(
  useShallow(state => ({
    setSelectedNote: state.setSelectedNote,
  })),
);

  const sourceId =
    item?.rowid ||
    item?.source_id ||
    (type === 'notebook' && item?.id);

  // A device file has no link until a copy has been uploaded, so its id is
  // looked up here and handed to getShareLink; every other type builds its own
  // from source_id. Null means no link exists, and the entry simply does not
  // render — for notes and notebooks, and for an iskcon file whose remote url
  // was overwritten by a download.
  // Joined onto the item by getChildrenByParent, so it is as fresh as the
  // row itself.
  const driveCopyId = item?.drive_file_id ?? null;
  // A percentage while an upload runs, undefined otherwise. Compared against
  // null rather than tested for truth so that 0% is still "uploading".
  const uploadPercent = useShareStore(s =>
    item?.id != null ? s.uploading[item.id] : undefined,
  );
  const uploadingCopy = uploadPercent != null;
  const shareLink = getShareLink(item, driveCopyId);

  // file_path alone is not enough to know the bytes are there: a restored row
  // carries the path it had on whatever device made the backup. validDeviceFiles
  // is the list setDeviceFiles built by actually asking the filesystem.
  const isMissingDeviceFile = useMediaStore(
    s =>
      item?.type === 'device_file' &&
      s.deviceFilesChecked &&
      !s.validDeviceIds[item.source_id],
  );

  // Offered instead of Copy Link, and only for a device file that has no copy
  // yet: it uploads the file rather than just reading an id, so it asks first.
  // Never for a file whose bytes are gone — there would be nothing to upload.
  const canCreateLink =
    item?.type === 'device_file' &&
    !driveCopyId &&
    !!item?.file_path &&
    !isMissingDeviceFile;

  const hideMenu = () => setVisible(false);
  const showMenu = () => setVisible(true);

  const handleAnchorPress = () => {
    showMenu();
    setActiveItem({
      sourceId: sourceId,
      sourceType: item?.type || type,
      item:item
    });
    if (type === 'note') {
      setSelectedNote(item);
    }
  };

  const renderMenuItems = () => {
    switch (type) {
      case ItemTypes.NOTE:
        return <NoteMenuItems item={item} hideMenu={hideMenu} />;
      case ItemTypes.NOTEBOOK:
        return <NBMenuItems item={item} hideMenu={hideMenu} />;
      case ItemTypes.DEVICE:
      case ItemTypes.DRIVE:
        return (
          <DriveMenuItems item={item} screen={screen} hideMenu={hideMenu} />
        );
      case ItemTypes.YOUTUBE:
        return <YTMenuItems item={item} screen={screen} hideMenu={hideMenu} />;
      case ItemTypes.ISKCON:
        return <IskconMenuItems item={item} hideMenu={hideMenu} />;
      default:
        return null;
    }
  };

  const showAddNote = () => {
    switch (type) {
      case ItemTypes.NOTE:
      case ItemTypes.NOTEBOOK:
        return false;
      case ItemTypes.DEVICE:
      case ItemTypes.DRIVE:
        return item?.mimeType !== 'application/vnd.google-apps.folder';
      case ItemTypes.YOUTUBE:
        return item.type !== 'youtube_playlist';
      case ItemTypes.ISKCON:
        return true;
      default:
        return null;
    }
  };

  return (
    <View style={styles.row}>
      <Menu
        visible={visible}
        anchor={
          <TouchableOpacity onPress={handleAnchorPress} style={{paddingVertical:5}}>
            <MaterialCommunityIcons
              name="dots-vertical"
              size={30}
              color="#000"
            />
          </TouchableOpacity>
        }
        onRequestClose={hideMenu}
        style={styles.menuContainer}>
        <CommonMenuItems
          item={item}
          sourceId={sourceId}
          sourceType={type}
          hideMenu={hideMenu}
          screen={screen}
          showAddNote={showAddNote()}
        />
        {shareLink && (
          <MenuItem
            onPress={() => {
              hideMenu();
              copyLink(shareLink);
            }}>
            <Text style={styles.menuItemText}>Copy Link</Text>
          </MenuItem>
        )}
        {canCreateLink && (
          <MenuItem
            disabled={uploadingCopy}
            onPress={() => {
              hideMenu();
              confirmAndShareDeviceFile(item);
            }}>
            <Text
              style={[
                styles.menuItemText,
                uploadingCopy && styles.menuItemTextDisabled,
              ]}>
              {uploadingCopy
                ? `Uploading… ${uploadPercent}%`
                : 'Create shareable link'}
            </Text>
          </MenuItem>
        )}
        {renderMenuItems()}
      </Menu>
    </View>
  );
};

export default BaseMenu;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemText: {
    fontSize: 16,
    color: '#333',
    paddingVertical: 8,
  },
  menuItemTextDisabled: {
    color: '#aaa',
  },
  menuContainer: {
    borderRadius: 8,
    backgroundColor: '#fff',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
});
