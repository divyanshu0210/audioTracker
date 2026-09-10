import React from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import {MenuDivider, MenuItem} from 'react-native-material-menu';
import {useAppState} from '../../contexts/AppStateContext';
import {deleteYTItemFromDB, softDeleteItem} from '../../database/D';
import useInMenteeCategory from '../../appMentor/useInMenteeCategory';
import { useShallow } from 'zustand/react/shallow';
import { useMediaStore } from '../../stores/useMediaStore';

const YTMenuItems = ({item, screen, hideMenu}) => {
  // Hidden while a mentor is inside a mentee's category: there Delete looks
  // like "unassign" and instead removes the item from the mentor's own
  // library. See useInMenteeCategory.
  const inMenteeCategory = useInMenteeCategory();
  const {setItems, items} = useMediaStore(
  useShallow(state => ({
    setItems: state.setItems,
    items: state.items,
  })),
);

  const confirmDelete = item => {
    Alert.alert(
      'Confirm Deletion',
      'This will also Delete all related videos?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          onPress: () => handleDeleteYTItem(item),
          style: 'destructive',
        },
      ],
    );
  };
  const handleDelete = item => {
    console.log('removing from Ui', item);
    setItems(prevItems =>
      prevItems.filter(f => f.source_id !== item.source_id),
    );
  };
  const handleDeleteYTItem = async item => {
    try {
      await softDeleteItem(item.type, item.source_id);
      handleDelete(item);
      Alert.alert(`Deleted successfully`,`${item.title} `);
    } catch (error) {
      Alert.alert('Delete failed');
      console.error('Delete failed:', error);
    }
  };

  // screen === 'out' as well as the category check: the category filter only
  // applies on the Home tabs, so anywhere else the selected category is just
  // whatever was left selected and this would hide Delete for no reason.
  const renderDelete = () =>
    inMenteeCategory && screen === 'out' ? null : (
    <MenuItem
      onPress={() => {
        hideMenu();
        confirmDelete(item);
      }}>
      <Text style={styles.menuItemText}>Delete</Text>
    </MenuItem>
  );

  return (
    <View>
      {item.type === 'youtube_playlist' && (
        <>
          <MenuItem onPress={hideMenu}>
            <Text style={[styles.menuItemText, {color: '#999'}]}>Refresh</Text>
          </MenuItem>
          <MenuDivider />

          {renderDelete()}
        </>
      )}

      {item.type === 'youtube_video' && (
        <>{item.out_show === 1 && screen === 'out' && renderDelete()}</>
      )}
    </View>
  );
};

export default YTMenuItems;

const styles = StyleSheet.create({
  menuItemText: {
    fontSize: 16,
    color: '#333',
    paddingVertical: 8,
  },
});
