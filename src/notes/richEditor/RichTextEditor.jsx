import React, {
  forwardRef,
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  useCallback,
} from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Keyboard,
  ToastAndroid,
  SafeAreaView,
} from 'react-native';
import {RichEditor} from 'react-native-pell-rich-editor';
import RichTextToolbar from './RichTextToolbar.jsx';
import {deleteUnusedImages, getImagesForNote, getNoteById} from '../richDB.js';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {seekVideoTo} from '../../music/progressTrackingUtils.js';
import {generateId, useNoteController} from '../useNoteController.jsx';
import {useImagePersistence} from '../useImagePersistence.jsx';
import {LoadingBar} from '../../components/LoadingBar.jsx';
import {useAppState} from '../../contexts/AppStateContext.jsx';

const IMAGE_PLACEHOLDER = `
data:image/svg+xml;utf8,
<svg xmlns='http://www.w3.org/2000/svg' width='100%' height='200'>
  <rect width='100%' height='100%' fill='%23e0e0e0'/>
  <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
    fill='%239e9e9e' font-size='16'>
    Loading image...
  </text>
</svg>
`;

const RichTextEditor = forwardRef(
  (
    {
      noteId,
      onContentChange,
      captureScreenshot,
      webViewRef,
      ytTime,
      vlcTime,
      seekToTime,
      isHidden,
      showPlayerMinimized,
      playerRef,
    },
    ref,
  ) => {
    const richText = useRef(null);
    const scrollRef = useRef(null);

    const [currentNoteId, setCurrentNoteId] = useState(noteId);
    const [isLoading, setIsLoading] = useState(false);
    const latestHtmlContentRef = useRef(''); // Ref to store the latest content

    const titleInputRef = useRef(null);
    const [title, setTitle] = useState('');
    const [initialContent, setInitialContent] = useState(''); // Add this state
    const latestTitleRef = useRef(''); // New ref for title
    const [isTitleFocused, setIsTitleFocused] = useState(false);

    const saveTimeout = useRef(null);
    const titleTimeout = useRef(null);

    const [isEditable, setIsEditable] = useState(false);

    const [isToolbarVisible, setIsToolbarVisible] = useState(false);

    const {saveContent, saveTitle, deleteNote} = useNoteController();
    const {saveImageInBackground} = useImagePersistence();
    const {setActiveNoteId} = useAppState();

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      handleImagePickerResult,
      addTimestamp,
      getCurrentContent: () => latestHtmlContentRef.current,
      getCurrentTitle: () => latestTitleRef.current,
      focusEditor: () => richText.current?.focusContentEditor(),
      toggleEditMode,
    }));

    useEffect(() => {
      if (!noteId) return;
      if (typeof noteId === 'string' && noteId.startsWith('temp_')) {
        setIsEditable(true);
        setInitialContent('');
        return;
      }

      loadNote(noteId);
    }, [noteId]);

    useEffect(() => {
      return () => {
        handleCloseNote();
      };
    }, []);

    const stripHtml = (html, includeTitle = true) => {
      if (!html) return '';

      let cleaned = html;
      // 1️⃣ Remove full non-editable image blocks
      cleaned = cleaned.replace(
        /<div[^>]*contenteditable=["']false["'][\s\S]*?<\/div>/gi,
        ' ',
      );
      // 2️⃣ Remove any remaining buttons
      cleaned = cleaned.replace(/<button[\s\S]*?<\/button>/gi, ' ');
      // 3️⃣ Remove ALL remaining tags
      cleaned = cleaned.replace(/<[^>]+>/g, ' ');
      // 4️⃣ Normalize spaces0
      cleaned = cleaned.replace(/\s+/g, ' ').trim();
      if (includeTitle && latestTitleRef.current) {
        return `${latestTitleRef.current}\n\n${cleaned}`;
      }
      return cleaned;
    };

    const isNoteEmpty = (title, content) => {
      if (title?.trim()) return false;

      if (!content) return true;

      // Check for empty HTML (common editor empty states)
      if (content === '<p><br></p>' || content === '<div><br></div>')
        return true;

      // Strip HTML and check for text content
      const strippedContent = stripHtml(content, false).trim();
      if (strippedContent) return false;

      // Check if content contains only images (no text)
      const hasImages = /<img[^>]+>/i.test(content);
      return !hasImages;
    };

    const loadNote = async id => {
      if (!id) {
        console.warn('No note ID provided');
        Alert.alert('Error', 'Invalid note ID');
        return;
      }

      try {
        setIsLoading(true);

        const note = await getNoteById(id);
        if (!note || typeof note !== 'object') {
          throw new Error('Note not found or invalid format');
        }
        const content = note.content || '';
        const title = note.title || '';
        setTitle(title);
        latestTitleRef.current = title;

        // Set the initial content before rendering the editor
        richText.current?.setContentHTML(content);

        // setInitialContent(content);
        latestHtmlContentRef.current = content;

        const isEmpty = isNoteEmpty(title, content);
        setIsEditable(isEmpty);

        setIsLoading(false);
        setTimeout(() => {
          hydrateImages(id, content);
        }, 0);
        // hydrateImages(id, content);
      } catch (error) {
        console.error('Error loading note:', error);
        Alert.alert('Error', error.message || 'Failed to load note');
      } finally {
        setIsLoading(false);
      }
    };

    const hydrateImages = async (noteId, htmlContent) => {
      try {
        const images = await getImagesForNote(noteId);

        if (!images?.length) return;

        const imageMap = {};
        images.forEach(img => {
          if (img?.id && img?.image_data) {
            imageMap[img.id] = img.image_data;
          }
        });

        richText.current?.commandDOM(`
          (function() {
            const map = ${JSON.stringify(imageMap)};
            document.querySelectorAll('img[data-image-id]').forEach(img => {
              const id = img.getAttribute('data-image-id');
              if (map[id]) {
                img.src = map[id];
                img.style.minHeight = "auto";
                img.style.background = "transparent";
              }
            });
          })();
        `);

        // 4️⃣ Cleanup unused images silently
        const usedImageIds = Array.from(
          htmlContent.matchAll(/data-image-id="(\d+)"/g),
        ).map(match => parseInt(match[1], 10));
        setTimeout(() => {
          deleteUnusedImages(noteId, usedImageIds);
        }, 0);
      } catch (err) {
        console.log('Image hydration failed:', err);
      }
    };

    const debouncedSaveNote = newHtmlContent => {
      latestHtmlContentRef.current = newHtmlContent;

      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
      }
      saveTimeout.current = setTimeout(() => {
        requestAnimationFrame(() => {
          handleSaveNote(newHtmlContent);
        });
      }, 500);
    };

    const handleSaveNote = async content => {
      if (!currentNoteId || !isEditable) return;

      const {processedHtml, imageIdsInContent} = processHtmlContent(content);
      const textContent = stripHtml(processedHtml);

      try {
        saveContent(currentNoteId, processedHtml, textContent);
      } catch (error) {
        console.error('Failed to save note:', error);
      }
    };

    const processHtmlContent = html => {
      const imageIdsInContent = new Set();

      const processedHtml = html.replace(
        /<img\b(?=(?:[^>]*\s)?data-image-id\s*=\s*(?:"([^"]*)"|'([^']*)'))[^>]*?(?:\s+src\s*=\s*["'][^"']*["'])?[^>]*>/gi,
        (fullMatch, doubleQuotedId, singleQuotedId) => {
          const imageId = doubleQuotedId || singleQuotedId;

          if (imageId) {
            imageIdsInContent.add(imageId);
            // return `<img data-image-id="${imageId}" alt="image">`;
            return `
          <img 
            src="${IMAGE_PLACEHOLDER}"
            data-image-id="${imageId}" 
            alt="image"
            style="max-width:100%; min-height:200px; background:#e0e0e0;"
          />
        `;
          }

          return fullMatch;
        },
      );

      return {
        processedHtml,
        imageIdsInContent: Array.from(imageIdsInContent),
      };
    };

    const handleTitleChange = text => {
      setTitle(text);
      latestTitleRef.current = text;

      if (titleTimeout.current) {
        clearTimeout(titleTimeout.current);
      }

      titleTimeout.current = setTimeout(() => {
        saveTitle(currentNoteId, text);
      }, 500);
    };

    const handleImagePickerResult = async result => {
      if (!result || !result.data) {
        Alert.alert(
          'Info',
          'Base64 data not available. Please enable base64 option.',
        );
        return;
      }

      try {
        const timestamp =
          webViewRef && result.timestamp
            ? result.timestamp
            : !webViewRef
              ? vlcTime
              : null;
        const formattedTime = timestamp
          ? new Date(timestamp * 1000).toISOString().substr(11, 8)
          : null;

        const base64Image = `data:${result.mime || 'image/jpeg'};base64,${result.data}`;
        const imageId = generateId();
        let html = `
        <div><br></div>
        <div contenteditable="false" style="position: relative; display: inline-block;">
          <img 
            src="${base64Image}" 
            style="max-width: 100%;" 
            alt="image"
            data-image-id="${imageId}"
          />`;
        if (timestamp) {
          html += `
          <button  
            contenteditable="false"
            onclick="_.sendEvent('TIMESTAMP_${timestamp}'); return false;"
            style="
              position: absolute;
              top: 8px;
              left: 8px;
              background-color: rgba(225, 245, 254, 0.9);
              color: #0288d1;
              padding: 2px 8px;
              border-radius: 20px;
              font-weight: bold;
              font-size: 12px;
              border: none;
              cursor: pointer;
            ">
            ${formattedTime}
             </button>`;
        }

        html += `
      </div>
      <div><br></div>
    `;

        await richText.current?.insertHTML(html);
        richText.current?.insertHTML(
          `
           <button  
             contenteditable="false"
             style="
               background: transparent;
               border: none;
               padding:0;
                font-size: 1px;
                  color: transparent;
             "
           >.</button>
           <div><br></div>`,
        );
        saveImageInBackground(currentNoteId, base64Image, imageId);
      } catch (error) {
        console.error('Error saving image or inserting HTML:', error);
        Alert.alert('Error', 'Something went wrong while handling the image.');
      }
    };

    const handleCursorPosition = useCallback(scrollY => {
      // Positioning scroll bar
      scrollRef.current?.scrollTo({y: scrollY - 30, animated: true});
    }, []);

    const toggleEditMode = async () => {
      if (!isEditable) {
        richText.current?.focusContentEditor();
      } else {
        // Get the latest content before saving
        const currentContent = await richText.current?.getContentHtml();
        latestHtmlContentRef.current = currentContent;
        handleSaveNote(currentContent);
        Keyboard.dismiss();
      }

      setIsEditable(prev => !prev);
    };

    const handleCloseNote = async () => {
      try {
        if (currentNoteId) {
          // Use the ref which always has the latest content
          const currentContent = latestHtmlContentRef.current;
          const isEmpty = isNoteEmpty(
            latestTitleRef.current,
            latestHtmlContentRef.current,
          );

          if (isEmpty) {
            deleteNote(currentNoteId);

            ToastAndroid.show('Empty note deleted', ToastAndroid.SHORT);
          } else {
            await handleSaveNote(currentContent);
          }
          setActiveNoteId(null);
        }
      } catch (error) {
        console.error('Error in handleCloseNote:', error);
        ToastAndroid.show('Error closing note', ToastAndroid.SHORT);
      }
    };

    //timestamp handlers
    const addTimestamp = async time => {
      const formattedTime = new Date(time * 1000).toISOString().substr(11, 8);
      const timestampHtml = `
      <div><br></div>
        <button  
         contenteditable="false"
          onclick="_.sendEvent('TIMESTAMP_${time}'); return false;"
          style="
            background-color: #e1f5fe;
            color: #0288d1;
            padding: 2px 8px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 12px;
            border: none;
            cursor: pointer;
          ">
          ${formattedTime}
        </button>
        <div><br></div>
      `;

      richText.current?.insertHTML(timestampHtml);

      richText.current?.focusContentEditor();
    };

    // Function to handle timestamp clicks
    const handleMessage = message => {
      console.log('editor is able to send message');
      const type = message.type;
      // The library sends the message as a string directly
      if (typeof type === 'string' && type.startsWith('TIMESTAMP_')) {
        const time = parseFloat(type.replace('TIMESTAMP_', ''));
        console.log('Seeking to timestamp:', time);
        seekToTimestamp(time);
      }
    };

    const seekToTimestamp = time => {
      if (typeof seekToTime === 'function') {
        playerRef.current?.handleSeek(time * 1000);
        // vlcTime=time;  not needed vlc player itself handles
      } else {
        seekVideoTo(webViewRef, time);
      }
      showPlayerMinimized();
    };

    return (
      <SafeAreaView style={{flex: 1}}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{flexGrow: 1, backgroundColor: '#fff'}}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={true}
          keyboardDismissMode="none"
          nestedScrollEnabled={true}
          scrollEventThrottle={20}
          maximumZoomScale={3}
          minimumZoomScale={1}
          pinchGestureEnabled={true}>
          <TextInput
            ref={titleInputRef}
            style={[
              styles.titleInput,
              isTitleFocused && styles.titleInputFocused,
              !isLoading && {marginBottom: 10},
            ]}
            placeholder="Title"
            placeholderTextColor="#888"
            value={title}
            editable={isEditable}
            onChangeText={handleTitleChange}
            onFocus={() => setIsTitleFocused(true)}
            onBlur={() => setIsTitleFocused(false)}
            multiline={false}
            returnKeyType="next"
            onSubmitEditing={() => richText.current?.focusContentEditor()}
          />
          {isLoading && <LoadingBar isInserting={isLoading} speed={800} />}
          {/* {!isLoading && ( */}
          <RichEditor
            ref={richText}
            placeholder="Start typing..."
            style={{
              flex: 1,
              minHeight: 200,
              // borderWidth:1,
              // borderColor:'red'
            }}
            initialContentHTML={initialContent}
            useContainer={true}
            disabled={!isEditable}
            editorStyle={{backgroundColor: '#fefefe'}}
            onCursorPosition={handleCursorPosition}
            onChange={descriptionText => {
              latestHtmlContentRef.current = descriptionText;
              if (currentNoteId && !isLoading) {
                debouncedSaveNote(descriptionText);
              }
              if (onContentChange) {
                onContentChange(descriptionText);
              }
            }}
            customCSS={`
              .highlight {
                background-color: yellow;
              }
              `}
            onMessage={handleMessage}
          />
          {/* )} */}
        </ScrollView>

        {!isEditable && (
          <TouchableOpacity
            style={[styles.editButton]}
            onPress={toggleEditMode}>
            <MaterialIcons
              name={isEditable ? 'check' : 'edit'}
              size={24}
              color="white"
            />
          </TouchableOpacity>
        )}

        {isEditable && (
          <RichTextToolbar
            editorRef={richText}
            handleImagePickerResult={handleImagePickerResult}
            captureScreenshot={captureScreenshot}
            isHidden={isHidden}
            webViewRef={webViewRef}
            addVLCTimestamp={() => addTimestamp(vlcTime)}
            onToolbarVisibilityChange={setIsToolbarVisible}
          />
        )}
      </SafeAreaView>
    );
  },
);

const styles = StyleSheet.create({
  titleInput: {
    fontSize: 24,
    fontWeight: 'bold',
    paddingBottom: 10,

    borderBottomWidth: 2,
    borderBottomColor: '#eee',
    color: '#000',
  },
  titleInputFocused: {
    borderBottomColor: '#007AFF',
    borderBottomWidth: 2,
  },
  editButton: {
    // position: 'absolute',
    // bottom: 60,
    // right: 20,
    backgroundColor: '#2196F3',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-end',
    elevation: 3,
    margin: 16,
  },
  progressContainer: {
    height: 4,
    backgroundColor: '#e0e0e0',
    marginBottom: 10,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#2196F3',
    borderRadius: 2,
  },
});

export default RichTextEditor;
