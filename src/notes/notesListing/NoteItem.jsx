import React, {memo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Entypo from 'react-native-vector-icons/Entypo';
import FontAwesome from 'react-native-vector-icons/FontAwesome';

const NoteItem = ({item}) => {
  const previewText = getPreviewText(item);
  const relatedItem = item?.relatedItem;

  // console.log(item)

  return (
    <View style={styles.contentContainer}>
      <View style={styles.noteContent}>
        {/* Icon and content remain the same */}
        {item.source_type === 'drive' ? (
          <Entypo name="google-drive" size={20} color="orange" />
        ) : item.source_type === 'youtube' ? (
          <FontAwesome name="youtube-play" size={20} color="red" />
        ) : item.source_type === 'device' ? (
          <FontAwesome name="mobile" size={20} color="green" />
        ) : (
          <FontAwesome name="file" size={20} color="blue" />
        )}

        <View style={{marginLeft: 10, flex: 1}}>
          <Text style={styles.noteTitle}>{item.noteTitle}</Text>
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
  htmlContent = item.content;
  if (!htmlContent) return '...';

  // Strip HTML tags to get plain text
  const plainText = htmlContent
    .replace(/<[^>]*>/g, ' ') // Remove HTML tags
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();

  if (!plainText) {
    // Check if there's an image tag
    if (/<img/i.test(htmlContent)) {
      return '🖼️ Image Note';
    }
    return 'Empty Note';
  }

  // Return truncated text if it's too long
  return plainText.length > 45 ? plainText.substring(0, 45) + '...' : plainText;
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
