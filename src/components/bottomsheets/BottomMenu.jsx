import React, {forwardRef, useCallback, useState} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import BottomSheet, {BottomSheetView} from '@gorhom/bottom-sheet';
import {ScreenTypes} from '../../contexts/constants';
import ItemNotesScreen from '../../notes/ItemNotesList';

const BottomMenu = forwardRef((props, ref) => {
  const snapPoints = ['75%'];

  const handleSheetChanges = useCallback(index => {
    console.log('handleSheetChanges', index);
  }, []);


  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      enablePanDownToClose
      backgroundStyle={styles.bottomSheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
      enableOverDrag={false}
      animationConfigs={{
        duration: 200,
        easeInOut: 'easeInOut',
      }}>
      <BottomSheetView style={styles.contentContainer}>
        <Text style={styles.title}>All Notes</Text>
        <ItemNotesScreen useSpecial={true} />
      </BottomSheetView>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  bottomSheetBackground: {
    backgroundColor: '#fdfdfd',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handleIndicator: {
    backgroundColor: '#999',
    width: 40,
  },
  contentContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
    color: '#333',
  },
});

export default BottomMenu;
