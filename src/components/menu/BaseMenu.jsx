import React, {useState} from 'react';
import {StyleSheet, TouchableOpacity, View} from 'react-native';
import {Menu} from 'react-native-material-menu';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAppState} from '../../contexts/AppStateContext';
import CommonMenuItems from './CommonMenuItems';
import DriveMenuItems from './DriveMenuItems';
import NBMenuItems from './NBMenuItems';
import NoteMenuItems from './NoteMenuItems';
import YTMenuItems from './YTMenuItems';
import {ItemTypes} from '../../contexts/constants';

const BaseMenu = ({item, type, screen}) => {
  const [visible, setVisible] = useState(false);
  const {setActiveItem, setSelectedNote} = useAppState();
  const sourceId =
    item?.rowid ||
    item?.source_id ||
    (type === 'notebook' && item?.id);

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
        return item.type !== 'playlist';
      default:
        return null;
    }
  };

  return (
    <View>
      <Menu
        visible={visible}
        anchor={
          <TouchableOpacity onPress={handleAnchorPress} style={{padding: 5}}>
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
        {renderMenuItems()}
      </Menu>
    </View>
  );
};

export default BaseMenu;

const styles = StyleSheet.create({
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
