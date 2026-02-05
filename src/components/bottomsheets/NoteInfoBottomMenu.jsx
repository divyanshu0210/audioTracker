import React, { forwardRef, useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { useAppState } from '../../contexts/AppStateContext';

const NoteInfoBottomMenu = forwardRef(({  }, ref) => {
  const snapPoints = ['50%'];
    const {selectedNote} = useAppState();

    // Custom backdrop component
  const renderBackdrop = useCallback(
    (props) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0} // Show backdrop when sheet is at index 0 (open)
        disappearsOnIndex={-1} // Hide backdrop when sheet is at index -1 (closed)
        opacity={0.5} // Adjust opacity as needed
        pressBehavior="close" // Close the sheet when backdrop is pressed
      />
    ),
    []
  );

  if (!selectedNote) return null;

  return (
    <>
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backgroundStyle={styles.bottomSheetBackground}
        handleIndicatorStyle={styles.handleIndicator}
        enableOverDrag={false}
        animationConfigs={{
          duration: 200,
          easeInOut: 'easeInOut',
        }}
         backdropComponent={renderBackdrop} 
      >
        <BottomSheetView style={styles.contentContainer}>
         
            <View>
              <Text style={styles.title}>Note Details</Text>
              
              <Text style={styles.label}>Source Type:</Text>
              <Text style={styles.content}>{selectedNote.source_type}</Text>
                <>
                  <Text style={styles.label}>Source Name:</Text>
                  <Text style={styles.content}>
                    {selectedNote.relatedItem?.name || selectedNote.relatedItem?.title}
                  </Text>
                </>
        
              <Text style={styles.label}>Created:</Text>
              <Text style={styles.content}>{selectedNote.created_at}</Text>
            </View>
        </BottomSheetView>
      </BottomSheet>
    </>
  );
});

const styles = StyleSheet.create({
  triggerButton: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 17,
    elevation: 5,
  },
  triggerText: {
    fontSize: 16,
    color: '#333',
  },
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
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#000',
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
    color: '#000',
  },
  content: {
    fontSize: 14,
    marginBottom: 10,
    color: '#000',
  },
});

export default NoteInfoBottomMenu;