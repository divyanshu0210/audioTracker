import {useRef} from 'react';
import {saveImage} from './richDB';
import {useAppState} from '../contexts/AppStateContext';

export const useImagePersistence = (editorRef, setHtml) => {

  const saveImageInBackground = async (noteId, base64Image, imageId) => {
    try {
      console.log('saving image with note id ', noteId);
      const realId = await saveImage(imageId, noteId, base64Image);
    } catch (error) {
      console.error('Background image save failed:', error);
    }
  };

  return {
    saveImageInBackground,
  };
};
