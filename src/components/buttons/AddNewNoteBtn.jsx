// AddNewNoteBtn.js
import React, {forwardRef, useImperativeHandle} from 'react';
import {TouchableOpacity} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {createNewNote} from '../../notes/richDB';
import {useAppState} from '../../contexts/AppStateContext';
import {generateId, useNoteController} from '../../notes/useNoteController';

const AddNewNoteBtn = forwardRef(
  ({renderItem, onNoteAdded, beforeNoteCreated, disabled}, ref) => {
    const {activeItem, setActiveNoteId} = useAppState();
    const {createNoteInstant} = useNoteController();

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
      const noteId = generateId();
      setActiveNoteId(noteId);
      onNoteAdded?.(noteId);

      createNoteInstant(String(sourceId), sourceType, item, noteId);
    };

    // Expose the function to parent
    useImperativeHandle(ref, () => ({
      handlePress: handleAddNote,
    }));

    return renderItem ? (
      <TouchableOpacity onPress={handleAddNote} activeOpacity={0.8} disabled={disabled}>
        {renderItem()}
      </TouchableOpacity>
    ) : null;
  },
);

export default AddNewNoteBtn;
