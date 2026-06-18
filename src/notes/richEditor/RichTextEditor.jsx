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
  unstable_batchedUpdates,
} from 'react-native';
import {RichEditor} from 'react-native-pell-rich-editor';
import RichTextToolbar from './RichTextToolbar.jsx';
import {deleteUnusedImages, getImagesForNote, getNoteById} from '../richDB.js';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {seekVideoTo} from '../../music/progressTrackingUtils.js';
import {generateId, useNoteController} from '../useNoteController.jsx';
import {useImagePersistence} from '../useImagePersistence.jsx';
import {LoadingBar} from '../../components/LoadingBar.jsx';
import {useNotesStore} from '../../stores/useNotesStore.js';

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
      source_type,
      isHidden,
      showPlayerMinimized,
      playerRef,
    },
    ref,
  ) => {
    console.log('🔄 RichTextEditor RENDERING', new Date().toISOString());

    // 🔵 LOG: Track render count
    const renderCount = useRef(0);
    renderCount.current++;
    console.log(`🎯 Render #${renderCount.current}`, {
      noteId,
      currentNoteId: noteId,
    });

    const richText = useRef(null);
    const scrollRef = useRef(null);
    const editorReadyRef = useRef(false);
    const pendingContentRef = useRef(null);

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

    const handleEditorInitialized = useCallback(() => {
      editorReadyRef.current = true;
      if (pendingContentRef.current !== null) {
        richText.current?.setContentHTML(pendingContentRef.current);
        pendingContentRef.current = null;
      }
    }, []);

    const {saveContent, saveTitle, deleteNote} = useNoteController();
    const {saveImageInBackground} = useImagePersistence();
    const setActiveNoteId = useNotesStore(state => state.setActiveNoteId);

    // 🔵 LOG: Track state changes
    useEffect(() => {
      console.log('📌 currentNoteId changed:', currentNoteId);
    }, [currentNoteId]);

    useEffect(() => {
      console.log('📌 isLoading changed:', isLoading);
    }, [isLoading]);

    useEffect(() => {
      console.log('📌 isEditable changed:', isEditable);
    }, [isEditable]);

    useEffect(() => {
      console.log('📌 isToolbarVisible changed:', isToolbarVisible);
    }, [isToolbarVisible]);

    useEffect(() => {
      console.log('📝 Title changed to:', title);
    }, [title]);

    // 🔵 LOG: Track prop changes
    useEffect(() => {
      console.log('📦 Props updated:', {
        noteId,
        isHidden,
        captureScreenshot: !!captureScreenshot,
        webViewConnected: !!webViewRef,
        showPlayerMinimized: !!showPlayerMinimized,
      });
    }, [noteId, isHidden, captureScreenshot, webViewRef, showPlayerMinimized]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      handleImagePickerResult,
      addTimestamp,
      getCurrentContent: () => latestHtmlContentRef.current,
      getCurrentTitle: () => latestTitleRef.current,
      focusEditor: () => richText.current?.focusContentEditor(),
      blurEditor: () => richText.current?.blurContentEditor(),
      toggleEditMode,
    }));

    useEffect(() => {
      console.log('🟢 useEffect[noteId] triggered', noteId);
      if (!noteId) {
        console.log('🟢 No noteId, returning');
        return;
      }
      if (typeof noteId === 'string' && noteId.startsWith('temp_')) {
        console.log('🟢 Temp note detected, setting editable');
        setIsEditable(true);
        setInitialContent('');
        return;
      }

      console.log('🟢 Loading note:', noteId);
      loadNote(noteId);
    }, [noteId]);

    useEffect(() => {
      console.log('📊 RichTextEditor MOUNTED:', noteId);
      const mountedNoteId = noteId;
      return () => {
        console.log('💀 RichTextEditor UNMOUNTED:', mountedNoteId);
        if (mountedNoteId) {
          handleCloseNote(mountedNoteId);
        }
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
      console.log('🟡 loadNote: START for id:', id);
      if (!id) {
        console.warn('🟡 loadNote: No note ID provided');
        Alert.alert('Error', 'Invalid note ID');
        return;
      }

      try {
        console.log('🟡 loadNote: Setting isLoading(true)');
        setIsLoading(true);

        console.log('🟡 loadNote: Fetching from DB...');
        const note = await getNoteById(id);
        console.log(
          '🟡 loadNote: Note received:',
          !!note,
          note ? `(title: "${note.noteTitle}")` : '',
        );

        if (!note || typeof note !== 'object') {
          throw new Error('Note not found or invalid format');
        }
        const content = note.content || '';
        const title = note.title || '';

        console.log(
          '🟡 loadNote: Extracted - title:',
          title,
          ', content length:',
          content.length,
        );

        const isEmpty = isNoteEmpty(title, content);
        console.log(
          '🟡 loadNote: Is note empty?',
          isEmpty,
          ', current isEditable:',
          isEditable,
        );

        // ✅ Batch ALL state updates into ONE render
        console.log('🟡 loadNote: Batching state updates...');
        unstable_batchedUpdates(() => {
          console.log(
            '🟡 loadNote: Inside batchedUpdates - setting title:',
            title,
          );
          setTitle(title);
          latestTitleRef.current = title;

          console.log(
            '🟡 loadNote: Setting content HTML (length:',
            content.length,
            ')',
          );
          if (editorReadyRef.current) {
            richText.current?.setContentHTML(content);
          } else {
            pendingContentRef.current = content;
          }
          latestHtmlContentRef.current = content;

          if (isEditable !== isEmpty) {
            console.log(
              '🟡 loadNote: Updating isEditable from',
              isEditable,
              'to',
              isEmpty,
            );
            setIsEditable(isEmpty);
          } else {
            console.log(
              '🟡 loadNote: Skipping setIsEditable - value unchanged (',
              isEmpty,
              ')',
            );
          }

          console.log('🟡 loadNote: Setting isLoading(false)');
          setIsLoading(false);
        });
        console.log('🟡 loadNote: Batched updates complete');

        console.log('🟡 loadNote: Scheduling hydrateImages');
        setTimeout(() => {
          console.log('🟡 loadNote: Calling hydrateImages (timeout fired)');
          hydrateImages(id, content);
        }, 0);

        console.log('🟡 loadNote: END of try block');
      } catch (error) {
        console.error('🔴 loadNote: Error loading note:', error);
        Alert.alert('Error', error.message || 'Failed to load note');
        console.log('🔴 loadNote: Setting isLoading(false) from catch block');
        setIsLoading(false);
      }
    };

    const hydrateImages = async (noteId, htmlContent) => {
      console.log('🟠 hydrateImages: START for note:', noteId);
      try {
        const images = await getImagesForNote(noteId);
        console.log('🟠 hydrateImages: Images found:', images?.length || 0);

        if (!images?.length) return;

        const imageMap = {};
        images.forEach(img => {
          if (img?.id && img?.image_data) {
            imageMap[img.id] = img.image_data;
          }
        });

        console.log('🟠 hydrateImages: Injecting JS to replace placeholders');
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

        console.log('🟠 hydrateImages: Used image IDs:', usedImageIds);
        setTimeout(() => {
          console.log('🟠 hydrateImages: Cleaning up unused images');
          deleteUnusedImages(noteId, usedImageIds);
        }, 0);
      } catch (err) {
        console.log('🟠 hydrateImages: Failed:', err);
      }
    };

    const debouncedSaveNote = newHtmlContent => {
      console.log(
        '🟤 debouncedSaveNote: Called (content length:',
        newHtmlContent?.length,
        ')',
      );
      latestHtmlContentRef.current = newHtmlContent;

      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
        console.log('🟤 debouncedSaveNote: Cleared previous timeout');
      }
      saveTimeout.current = setTimeout(() => {
        console.log('🟤 debouncedSaveNote: Timeout fired, saving...');
        requestAnimationFrame(() => {
          handleSaveNote(newHtmlContent);
        });
      }, 500);
    };

    const handleSaveNote = async (content, forceSave = false) => {
      console.log(
        '🔵 handleSaveNote: START (isEditable:',
        isEditable,
        ', currentNoteId:',
        currentNoteId,
        ', forceSave:',
        forceSave,
        ')',
      );

      if (!currentNoteId) {
        console.log('🔵 handleSaveNote: Aborting - no noteId');
        return;
      }

      // Allow force save even when not editable (for cleanup)
      if (!isEditable && !forceSave) {
        console.log(
          '🔵 handleSaveNote: Aborting - not editable and not forced',
        );
        return;
      }

      const {processedHtml, imageIdsInContent} = processHtmlContent(content);
      const textContent = stripHtml(processedHtml);

      console.log('🔵 handleSaveNote: Calling saveContent');
      try {
        saveContent(currentNoteId, processedHtml, textContent);
        console.log('🔵 handleSaveNote: Save complete');
      } catch (error) {
        console.error('🔵 handleSaveNote: Failed:', error);
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
      console.log('📝 handleTitleChange: New title:', text);
      setTitle(text);
      latestTitleRef.current = text;

      if (titleTimeout.current) {
        clearTimeout(titleTimeout.current);
      }

      titleTimeout.current = setTimeout(() => {
        console.log('📝 handleTitleChange: Saving title to DB');
        saveTitle(currentNoteId, text);
      }, 500);
    };

    const handleImagePickerResult = async result => {
      console.log('🖼️ handleImagePickerResult: Called');
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
              ? playerRef.current?.getCurrentTime() / 1000
              : null;
        const formattedTime = timestamp
          ? new Date(timestamp * 1000).toISOString().substr(11, 8)
          : null;

        const base64Image = `data:${result.mime || 'image/jpeg'};base64,${result.data}`;
        const imageId = generateId();
        console.log(
          '🖼️ handleImagePickerResult: Inserting image (id:',
          imageId,
          ')',
        );

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
        console.log('🖼️ handleImagePickerResult: Saving image in background');
        saveImageInBackground(currentNoteId, base64Image, imageId);
      } catch (error) {
        console.error('🔴 Error saving image or inserting HTML:', error);
        Alert.alert('Error', 'Something went wrong while handling the image.');
      }
    };

    const handleCursorPosition = useCallback(scrollY => {
      // Positioning scroll bar
      scrollRef.current?.scrollTo({y: scrollY - 30, animated: true});
    }, []);

    const toggleEditMode = async () => {
      console.log(
        '✏️ toggleEditMode: Current mode:',
        isEditable ? 'editing' : 'read-only',
      );
      if (!isEditable) {
        console.log('✏️ toggleEditMode: Entering edit mode');
        richText.current?.focusContentEditor();
      } else {
        // Get the latest content before saving
        console.log('✏️ toggleEditMode: Exiting edit mode, saving...');
        const currentContent = await richText.current?.getContentHtml();
        latestHtmlContentRef.current = currentContent;
        handleSaveNote(currentContent);
        Keyboard.dismiss();
      }

      setIsEditable(prev => !prev);
    };

const handleCloseNote = async (noteIdToClose) => {
  const id = noteIdToClose || currentNoteId;
  console.log('🚪 handleCloseNote: START for note:', id);

  if (!id) {
    console.log('🚪 handleCloseNote: No noteId, returning');
    return;
  }

  try {
    const currentContent = latestHtmlContentRef.current;
    const isEmpty = isNoteEmpty(latestTitleRef.current, currentContent);

    console.log('🚪 handleCloseNote: Is empty?', isEmpty, 'Content length:', currentContent?.length);

    if (isEmpty) {
      // If content was never loaded (empty ref default), don't delete
      if (currentContent === '' && id !== currentNoteId) {
        console.log('🚪 handleCloseNote: Content never loaded for', id, '- skipping delete');
        return;
      }
      console.log('🚪 handleCloseNote: Deleting empty note:', id);
      await deleteNote(id);
      ToastAndroid.show('Empty note deleted', ToastAndroid.SHORT);
    } else {
      console.log('🚪 handleCloseNote: Saving note before close:', id);
      await handleSaveNote(currentContent);
    }
    
    // 🔑 ONLY clear activeNoteId if THIS note is still the active one
    // Use the current state value, not the stale closure
    const { activeNoteId: currentActiveId } = useNotesStore.getState();
    console.log('🚪 handleCloseNote: current activeNoteId:', currentActiveId, 'closing noteId:', id);
    
    if (currentActiveId === id) {
      console.log('🚪 handleCloseNote: Setting activeNoteId to null (was our note)');
      setActiveNoteId(null);
    } else {
      console.log('🚪 handleCloseNote: NOT setting null - activeNoteId changed to', currentActiveId);
    }
  } catch (error) {
    console.error('🔴 Error in handleCloseNote:', error);
    ToastAndroid.show('Error closing note', ToastAndroid.SHORT);
  }
};

    //timestamp handlers
    const addTimestamp = async time => {
      console.log('⏱️ addTimestamp: Adding timestamp at', time);
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

    const addTimestampCb = useCallback(() => {
      // Get time fresh from playerRef when actually needed
      const time = playerRef.current?.getCurrentTime();
      if (source_type !== 'youtube_video' && time) {
        addTimestamp(time / 1000);
      } else if (time) {
        addTimestamp(time);
      }
    }, []);

    // Function to handle timestamp clicks
    const handleMessage = message => {
      console.log('📨 editor is able to send message');
      const type = message.type;
      // The library sends the message as a string directly
      if (typeof type === 'string' && type.startsWith('TIMESTAMP_')) {
        const time = parseFloat(type.replace('TIMESTAMP_', ''));
        console.log('📨 Seeking to timestamp:', time);
        seekToTimestamp(time);
      }
    };

    const seekToTimestamp = time => {
      console.log('🎬 seekToTimestamp:', time);
      if (source_type !== 'youtube_video') {
        playerRef.current?.handleSeek(time * 1000);
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
            onFocus={() => {
              console.log('📝 Title input FOCUSED');
              setIsTitleFocused(true);
            }}
            onBlur={() => {
              console.log('📝 Title input BLURRED');
              setIsTitleFocused(false);
            }}
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
            editorInitializedCallback={handleEditorInitialized}
            useContainer={true}
            disabled={!isEditable}
            editorStyle={{backgroundColor: '#fefefe'}}
            onCursorPosition={handleCursorPosition}
            onChange={descriptionText => {
              console.log(
                '🟣 onChange FIRED (content length:',
                descriptionText?.length,
                ')',
              );
              latestHtmlContentRef.current = descriptionText;
              if (currentNoteId && !isLoading) {
                debouncedSaveNote(descriptionText);
              }
              if (onContentChange) {
                console.log('🟣 onChange: Calling onContentChange callback');
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
            addTimestampCb={addTimestampCb}
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

// export default RichTextEditor;
export default React.memo(RichTextEditor, (prevProps, nextProps) => {
  // Only re-render if noteId changes
  return prevProps.noteId === nextProps.noteId;
  // This will ignore ALL other prop changes!
  // Use refs or context for functions you need inside the editor
});
