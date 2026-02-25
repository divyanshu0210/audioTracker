import React, {memo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Entypo from 'react-native-vector-icons/Entypo';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import {getFileIcon} from '../../contexts/fileIconHelper';

const NoteItem = ({item}) => {
  const previewText = getPreviewText(item);
  const relatedItem = item?.relatedItem;

  // console.log(item)

  return (
    <View style={styles.contentContainer}>
      <View style={styles.noteContent}>
        <View>{getFileIcon(item.source_type, 22)}</View>
        <View style={{marginLeft: 10, flex: 1}}>
          <Text style={styles.noteTitle}>
            {item.noteTitle || 'Untitled Note'}
          </Text>
          <Text style={styles.noteText}>{previewText}</Text>
          {item.relatedItem && (
            <Text style={styles.note} numberOfLines={1}>
              {`${item.source_type}: ${relatedItem?.title}`}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
};

export default memo(NoteItem);

export const getPreviewText = item => {
  const bodyText = item?.text_content.slice(item.noteTitle.length).trim();
  const hasImage = item.content?.includes('data-image-id=');
  if (!bodyText) {
    return hasImage ? 'Image Note...' : 'Empty Note';
  }
  return bodyText.length > 45 ? bodyText.slice(0, 45) + '...' : bodyText;
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: 'white', padding: 16},

  contentContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noteContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  noteText: {fontSize: 14, color: '#777'},
  noteTitle: {fontSize: 16, color: '#000'},
  note: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
    width: 300,
    textTransform: 'capitalize',
  },
});
