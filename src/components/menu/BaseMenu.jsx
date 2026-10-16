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
import {ItemTypes, ScreenTypes} from '../../contexts/constants';
import useInMenteeCategory from '../../appMentor/useInMenteeCategory';
import { useSelectionStore } from '../../stores/useSelectionStore';
import { useNotesStore } from '../../stores/useNotesStore';
import { useShallow } from 'zustand/react/shallow';
import {getShareLink, shareItem} from '../../Linking/utils/shareLink';
import DeviceMenuActions from './DeviceMenuActions';
import DeviceShareSheet from '../modals/DeviceShareSheet';
import {shareDeviceFile} from '../../share/shareDeviceFile';

const BaseMenu = ({item, type, screen}) => {
  const [visible, setVisible] = useState(false);
  const [deviceShareVisible, setDeviceShareVisible] = useState(false);
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

  // A mentor looking at what they assigned to one mentee is not looking at
  // their own shelf, and nearly every entry here acts on the shelf: Add Notes
  // writes a note the mentee will never read, Add to Category files their
  // lecture under the mentor's own headings, Download fills this phone with a
  // copy of everything they ever sent. Delete was already hidden for reading as
  // "unassign" and doing the opposite; the rest is the same mistake with a
  // smaller bill.
  //
  // What is left is the two entries that are about the mentee: their notes on
  // this item, and a link to hand them. Withdrawing an assignment is not among
  // them and is not missing - what has been sent has been sent, and that is the
  // mentor's to carry.
  //
  // Decided here rather than in each of the per-type files, which is where it
  // started: three copies of one condition, and the iskcon file never got a
  // copy, so Remove Download sat on a mentee's row and deleted the mentor's
  // own download.
  const inMenteeCategory = useInMenteeCategory();
  const menteeView = inMenteeCategory && screen === ScreenTypes.MAIN;

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
  const shareLink = getShareLink(item, driveCopyId);

  // file_path alone is not enough to know the bytes are there: a restored row
  // carries the path it had on whatever device made the backup. validDeviceIds
  // is the list setDeviceFiles built by actually asking the filesystem.
  // Offered instead of Copy Link, and only for a device file that has no copy
  // yet: it uploads the file rather than just reading an id, so it asks first.
  // Never for a file whose bytes are gone — there would be nothing to upload.
  const isDeviceItem = item?.type === 'device_file';
  const hasDeviceShareAction =
    isDeviceItem && (!!item?.file_path || !!driveCopyId);

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
        return (
          <DeviceMenuActions
            item={item}
            hideMenu={hideMenu}
            screen={screen}
            onOpenShare={() => setDeviceShareVisible(true)}
          />
        );
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

  const canShowNotes = showAddNote();

  // In a mentee's category the menu is two entries at most, and a row can have
  // neither - a folder has no notes of its own and no link. An anchor that
  // opens an empty popup is worse than no anchor.
  if (menteeView && !canShowNotes && !shareLink && !hasDeviceShareAction) return null;

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
          showAddNote={canShowNotes && !menteeView}
          showAllNotes={canShowNotes}
          showAddToCategory={!menteeView}
          menteeView={menteeView}
        />
        {!isDeviceItem && shareLink && (
          <MenuItem
            onPress={() => {
              hideMenu();
              shareItem(item, driveCopyId).catch(error =>
                console.log('Share cancelled or failed:', error),
              );
            }}>
            <Text style={styles.menuItemText}>Share</Text>
          </MenuItem>
        )}
        {!menteeView && renderMenuItems()}
      </Menu>
      <DeviceShareSheet
        visible={deviceShareVisible}
        hasDriveLink={!!shareLink}
        onClose={() => setDeviceShareVisible(false)}
        onShareFile={() => {
          setDeviceShareVisible(false);
          shareItem(item, driveCopyId).catch(error =>
            console.log('Share cancelled or failed:', error),
          );
        }}
        onShareLink={() => {
          setDeviceShareVisible(false);
          if (shareLink) {
            shareItem(item, driveCopyId).catch(error =>
              console.log('Share cancelled or failed:', error),
            );
          } else {
            shareDeviceFile(item);
          }
        }}
      />
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
