// AddNewNoteBtn.js
import React, {forwardRef, useImperativeHandle} from 'react';
import {TouchableOpacity} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {createNewNote} from '../../notes/richDB';
import {useAppState} from '../../contexts/AppStateContext';

const AddNewNoteBtn = forwardRef(
  ({renderItem, onNoteAdded, beforeNoteCreated}, ref) => {
    const navigation = useNavigation();
    const {
      activeItem,
      setActiveNoteId,
      setNotesList,
      setMainNotesList,
      setSelectedNote,
    } = useAppState();

    const isNoteSource = activeItem?.sourceType === 'note';

    const resolvedItem = isNoteSource ? activeItem?.item : activeItem;

    const sourceId = isNoteSource
      ? resolvedItem?.source_id
      : resolvedItem?.sourceId;

    const sourceType = isNoteSource
      ? resolvedItem?.source_type
      : resolvedItem?.sourceType;

    const item = isNoteSource ? resolvedItem?.relatedItem : resolvedItem?.item;

    const handleAddNote = async () => {
      const proceed = beforeNoteCreated?.();
      if (proceed === false) return;

      try {
        const newNoteId = await createNewNote(String(sourceId), sourceType);
        if (newNoteId) {
          const newNoteObject = {
            rowid: newNoteId,
            source_id: String(sourceId),
            source_type: sourceType,
            noteTitle: '',
            content: '',
            text_content: {title: ''},
            created_at: new Date().toISOString(),
            relatedItem: item,
          };
          setActiveNoteId(newNoteId);
          setSelectedNote(newNoteObject);
          setNotesList(prev => [newNoteObject, ...prev]);
          setMainNotesList(prev => [newNoteObject, ...prev]);
          onNoteAdded?.(newNoteId);
        }
      } catch (err) {
        console.error('Failed to create note:', err);
      }
    };

    // Expose the function to parent
    useImperativeHandle(ref, () => ({
      handlePress: handleAddNote,
    }));

    return renderItem ? (
      <TouchableOpacity onPress={handleAddNote} activeOpacity={0.8}>
        {renderItem()}
      </TouchableOpacity>
    ) : null;
  },
);

export default AddNewNoteBtn;
