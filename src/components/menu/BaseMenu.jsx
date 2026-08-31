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

  // Rebuilt from the item rather than stored on it — see getShareLink. Null
  // for notes, notebooks, device files, and iskcon files whose remote url was
  // overwritten by a download, so the entry just doesn't render for those
  // rather than offering a copy that would hand over nothing.
  const shareLink = getShareLink(item);

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
