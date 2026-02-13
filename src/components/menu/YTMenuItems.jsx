import React from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import {MenuDivider, MenuItem} from 'react-native-material-menu';
import {useAppState} from '../../contexts/AppStateContext';
import {deleteYTItemFromDB, softDeleteItem} from '../../database/D';

const YTMenuItems = ({item, screen, hideMenu}) => {
  const {setItems} = useAppState();

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
      prevItems.filter(item => item.source_id !== item.source_id),
    );
  };
  const handleDeleteYTItem = async item => {
    try {
      await softDeleteItem(item.type, item.source_id);
      console.log('delete hoja');
      handleDelete(item);
      Alert.alert(`${item.title} deleted successfully`);
    } catch (error) {
      Alert.alert('Delete failed');
      console.error('Delete failed:', error);
    }
  };

  const renderDelete = () => (
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
