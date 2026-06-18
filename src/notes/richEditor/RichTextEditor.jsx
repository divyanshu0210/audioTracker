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
  Image,
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

// Grey SVG placeholder that carries the REAL image dimensions as its intrinsic
// size. With `height:auto` the browser scales it exactly like the real image
// will scale → identical box → zero layout shift when the real src swaps in.
const makePlaceholder = (w, h) => {
  const W = Number(w) || 4;
  const H = Number(h) || 3;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#e0e0e0"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const CUSTOM_CSS = `
  .highlight { background-color: yellow; }
  img { max-width: 100% !important; height: auto !important; display: block; }
  div[contenteditable="false"] { max-width: 100% !important; }
`;

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function stripHtml(html, latestTitle = '') {
  if (!html) return '';
  let cleaned = html;
  cleaned = cleaned.replace(
    /<div[^>]*contenteditable=["']false["'][\s\S]*?<\/div>/gi,
    ' ',
  );
  cleaned = cleaned.replace(/<button[\s\S]*?<\/button>/gi, ' ');
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return latestTitle ? `${latestTitle}\n\n${cleaned}` : cleaned;
}

function isNoteEmpty(title, content) {
  if (title?.trim()) return false;
  if (!content) return true;
  if (content === '<p><br></p>' || content === '<div><br></div>') return true;
  if (stripHtml(content).trim()) return false;
  return !/<img[^>]+>/i.test(content);
}

function processHtmlContent(html) {
  const imageIdsInContent = new Set();
  const processedHtml = html.replace(
    /<img\b(?=(?:[^>]*\s)?data-image-id\s*=\s*(?:"([^"]*)"|'([^']*)'))[^>]*?(?:\s+src\s*=\s*["'][^"']*["'])?[^>]*>/gi,
    (fullMatch, doubleQuotedId, singleQuotedId) => {
      const imageId = doubleQuotedId || singleQuotedId;
      if (imageId) {
        imageIdsInContent.add(imageId);
        const w = fullMatch.match(/data-image-width="(\d+)"/)?.[1];
        const h = fullMatch.match(/data-image-height="(\d+)"/)?.[1];
        // Explicit width/height attrs make the browser reserve the correct box
        // BEFORE the real image decodes → scrollHeight is right immediately, so
        // the editor measures the right height and the note stays scrollable.
        const dimAttrs = w && h ? ` width="${w}" height="${h}"` : '';
        return `<img src="${makePlaceholder(w, h)}" data-image-id="${imageId}" data-image-width="${w || ''}" data-image-height="${h || ''}"${dimAttrs} alt="image" style="max-width:100%;height:auto;display:block;background:#e0e0e0;"/>`;
      }
      return fullMatch;
    },
  );
  return {processedHtml, imageIdsInContent: Array.from(imageIdsInContent)};
}

// ─────────────────────────────────────────────────────────────────────────────

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

       const renderCount = useRef(0);
    renderCount.current++;
    console.log(`🎯 Render #${renderCount.current}`, {
      noteId,
      currentNoteId: noteId,
    });
    const richText = useRef(null);
    const scrollRef = useRef(null);
    const titleInputRef = useRef(null);
    const editorReadyRef = useRef(false);
    const pendingContentRef = useRef(null);
    const saveTimeout = useRef(null);
    const titleTimeout = useRef(null);

    // Shadow refs — let callbacks read current values without stale closures
    const noteIdRef = useRef(noteId);
    const isEditableRef = useRef(false);
    const isLoadingRef = useRef(false);
    const latestHtmlContentRef = useRef('');
    const latestTitleRef = useRef('');

    const [isLoading, setIsLoading] = useState(false);
    const [title, setTitle] = useState('');
    const [initialContent] = useState('');
    const [isTitleFocused, setIsTitleFocused] = useState(false);
    const [isEditable, setIsEditable] = useState(false);

    // Keep shadow refs in sync with state/props
    useEffect(() => { noteIdRef.current = noteId; }, [noteId]);
    useEffect(() => { isEditableRef.current = isEditable; }, [isEditable]);
    useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

    const {saveContent, saveTitle, deleteNote, updateNoteInState} = useNoteController();
    const {saveImageInBackground} = useImagePersistence();
    const setActiveNoteId = useNotesStore(state => state.setActiveNoteId);

    // ── Editor ready ──────────────────────────────────────────────────────────

    const handleEditorInitialized = useCallback(() => {
      editorReadyRef.current = true;
      if (pendingContentRef.current !== null) {
        richText.current?.setContentHTML(pendingContentRef.current);
        pendingContentRef.current = null;
      }
    }, []);

    // ── Note loading ──────────────────────────────────────────────────────────

    const hydrateImagesInHtml = useCallback(async (noteId, htmlContent) => {
      try {
        const images = await getImagesForNote(noteId);
        if (!images?.length) return htmlContent;

        let hydrated = htmlContent;
        for (const img of images) {
          if (!img?.id || !img?.image_data) continue;

          const marker = `data-image-id="${img.id}"`;
          const markerPos = hydrated.indexOf(marker);
          if (markerPos === -1) continue;

          const tagStart = hydrated.lastIndexOf('<img', markerPos);
          if (tagStart === -1) continue;

          // Walk forward respecting quoted values so > inside SVG src is not confused with tag end
          let pos = tagStart + 4;
          while (pos < hydrated.length) {
            const ch = hydrated[pos];
            if (ch === '"' || ch === "'") {
              const q = ch;
              pos++;
              while (pos < hydrated.length && hydrated[pos] !== q) pos++;
            } else if (ch === '>') {
              break;
            }
            pos++;
          }

          const fullTag = hydrated.slice(tagStart, pos + 1);
          // /s flag so [^"]* spans newlines inside the SVG data URL
          const updatedTag = fullTag.replace(/src="[^"]*"/s, `src="${img.image_data}"`);
          hydrated = hydrated.slice(0, tagStart) + updatedTag + hydrated.slice(pos + 1);
        }
        return hydrated;
      } catch (err) {
        console.log('🟠 hydrateImagesInHtml failed:', err);
        return htmlContent;
      }
    }, []);

    const loadNote = useCallback(async id => {
      if (!id) {
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
        const noteTitle = note.title || '';
        const isEmpty = isNoteEmpty(noteTitle, content);

        // Hydrate real image data into the HTML BEFORE handing it to the editor.
        // width/height attrs reserve each image's box, so there's no flash and no
        // scroll bug — and no racy second setContentHTML on a not-yet-ready editor.
        const hydratedContent = await hydrateImagesInHtml(id, content);

        unstable_batchedUpdates(() => {
          setTitle(noteTitle);
          latestTitleRef.current = noteTitle;

          if (editorReadyRef.current) {
            richText.current?.setContentHTML(hydratedContent);
          } else {
            pendingContentRef.current = hydratedContent;
          }
          latestHtmlContentRef.current = content;

          if (isEditableRef.current !== isEmpty) setIsEditable(isEmpty);
          setIsLoading(false);
        });

        setTimeout(() => {
          const usedImageIds = Array.from(
            content.matchAll(/data-image-id="(\d+)"/g),
          ).map(match => parseInt(match[1], 10));
          deleteUnusedImages(id, usedImageIds);
        }, 0);
      } catch (error) {
        console.error('🔴 loadNote error:', error);
        Alert.alert('Error', error.message || 'Failed to load note');
        setIsLoading(false);
      }
    }, [hydrateImagesInHtml]);

    useEffect(() => {
      if (!noteId) return;
      if (typeof noteId === 'string' && noteId.startsWith('temp_')) {
        setIsEditable(true);
        return;
      }
      loadNote(noteId);
    }, [noteId, loadNote]);

    // ── Save ──────────────────────────────────────────────────────────────────

    const handleSaveNote = useCallback(async (content, forceSave = false) => {
      const id = noteIdRef.current;
      if (!id) return;
      if (!isEditableRef.current && !forceSave) return;

      const {processedHtml} = processHtmlContent(content);
      const textContent = stripHtml(processedHtml, latestTitleRef.current);
      try {
        saveContent(id, processedHtml, textContent);
      } catch (error) {
        console.error('🔵 handleSaveNote failed:', error);
      }
    }, [saveContent]);

    const debouncedSaveNote = useCallback(newHtmlContent => {
      latestHtmlContentRef.current = newHtmlContent;
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        requestAnimationFrame(() => handleSaveNote(newHtmlContent));
      }, 500);
    }, [handleSaveNote]);

    const handleTitleChange = useCallback(text => {
      setTitle(text);
      latestTitleRef.current = text;
      if (titleTimeout.current) clearTimeout(titleTimeout.current);
      titleTimeout.current = setTimeout(() => {
        saveTitle(noteIdRef.current, text);
      }, 500);
    }, [saveTitle]);

    // ── Close ─────────────────────────────────────────────────────────────────

    const handleCloseNote = useCallback(async noteIdToClose => {
      const id = noteIdToClose || noteIdRef.current;
      if (!id) return;
      try {
        const currentContent = latestHtmlContentRef.current;
        const isEmpty = isNoteEmpty(latestTitleRef.current, currentContent);

        if (isEmpty) {
          if (currentContent === '' && id !== noteIdRef.current) return;
          await deleteNote(id);
          ToastAndroid.show('Empty note deleted', ToastAndroid.SHORT);
        } else {
          await handleSaveNote(currentContent);
          updateNoteInState(id, {
            content: currentContent,
            noteTitle: latestTitleRef.current,
            text_content: stripHtml(currentContent, latestTitleRef.current),
          });
        }

        const {activeNoteId: currentActiveId} = useNotesStore.getState();
        if (currentActiveId === id) setActiveNoteId(null);
      } catch (error) {
        console.error('🔴 handleCloseNote error:', error);
        ToastAndroid.show('Error closing note', ToastAndroid.SHORT);
      }
    }, [handleSaveNote, deleteNote, setActiveNoteId, updateNoteInState]);

    useEffect(() => {
      const mountedNoteId = noteId;
      return () => {
        if (mountedNoteId) handleCloseNote(mountedNoteId);
      };
    }, []);

    // ── Images ────────────────────────────────────────────────────────────────

    const handleImagePickerResult = useCallback(async result => {
      if (!result || !result.data) {
        Alert.alert('Info', 'Base64 data not available. Please enable base64 option.');
        return;
      }
      try {
        const timestamp =
          webViewRef && result.timestamp
            ? result.timestamp
            : !webViewRef
              ? playerRef?.current?.getCurrentTime() / 1000
              : null;
        const formattedTime = timestamp
          ? new Date(timestamp * 1000).toISOString().substr(11, 8)
          : null;

        const base64Image = `data:${result.mime || 'image/jpeg'};base64,${result.data}`;
        const imageId = generateId();

        // Screenshots arrive without dimensions; derive them so the placeholder
        // matches the real image size on reload (gallery/cam already provide these).
        let {width, height} = result;
        if (!width || !height) {
          try {
            ({width, height} = await new Promise((resolve, reject) =>
              Image.getSize(base64Image, (w, h) => resolve({width: w, height: h}), reject),
            ));
          } catch (e) {
            console.log('🟠 Could not resolve image size:', e);
          }
        }

        let html = `
        <div><br></div>
        <div contenteditable="false" style="position: relative; display: block; max-width: 100%;">
          <img
            src="${base64Image}"
            style="max-width: 100%; height: auto; display: block;"
            alt="image"
            data-image-id="${imageId}"
            data-image-width="${width || ''}"
            data-image-height="${height || ''}"
            ${width && height ? `width="${width}" height="${height}"` : ''}
          />`;
        if (timestamp) {
          html += `
          <button
            contenteditable="false"
            onclick="_.sendEvent('TIMESTAMP_${timestamp}'); return false;"
            style="
              position: absolute; top: 8px; left: 8px;
              background-color: rgba(225, 245, 254, 0.9); color: #0288d1;
              padding: 2px 8px; border-radius: 20px;
              font-weight: bold; font-size: 12px; border: none; cursor: pointer;">
            ${formattedTime}
          </button>`;
        }
        html += `\n      </div>\n      <div><br></div>\n    `;

        await richText.current?.insertHTML(html);
        richText.current?.insertHTML(
          `<button contenteditable="false" style="background:transparent;border:none;padding:0;font-size:1px;color:transparent;">.</button><div><br></div>`,
        );
        saveImageInBackground(noteIdRef.current, base64Image, imageId);
      } catch (error) {
        console.error('🔴 handleImagePickerResult error:', error);
        Alert.alert('Error', 'Something went wrong while handling the image.');
      }
    }, [saveImageInBackground, webViewRef, playerRef]);

    // ── Timestamps ────────────────────────────────────────────────────────────

    const addTimestamp = useCallback(async time => {
      const formattedTime = new Date(time * 1000).toISOString().substr(11, 8);
      const timestampHtml = `
      <div><br></div>
        <button
         contenteditable="false"
          onclick="_.sendEvent('TIMESTAMP_${time}'); return false;"
          style="
            background-color: #e1f5fe; color: #0288d1;
            padding: 2px 8px; border-radius: 20px;
            font-weight: bold; font-size: 12px; border: none; cursor: pointer;">
          ${formattedTime}
        </button>
        <div><br></div>
      `;
      richText.current?.insertHTML(timestampHtml);
      richText.current?.focusContentEditor();
    }, []);

    const addTimestampCb = useCallback(() => {
      const time = playerRef?.current?.getCurrentTime();
      if (!time) return;
      addTimestamp(source_type !== 'youtube_video' ? time / 1000 : time);
    }, [source_type, addTimestamp]);

    const seekToTimestamp = useCallback(time => {
      if (source_type !== 'youtube_video') {
        playerRef?.current?.handleSeek(time * 1000);
      } else {
        seekVideoTo(webViewRef, time);
      }
      showPlayerMinimized();
    }, [source_type, webViewRef, showPlayerMinimized]);

    const handleMessage = useCallback(message => {
      const type = message.type;
      if (typeof type === 'string' && type.startsWith('TIMESTAMP_')) {
        seekToTimestamp(parseFloat(type.replace('TIMESTAMP_', '')));
      }
    }, [seekToTimestamp]);

    // ── Edit mode ─────────────────────────────────────────────────────────────

    const toggleEditMode = useCallback(async () => {
      if (!isEditableRef.current) {
        richText.current?.focusContentEditor();
      } else {
        const currentContent = await richText.current?.getContentHtml();
        latestHtmlContentRef.current = currentContent;
        handleSaveNote(currentContent);
        Keyboard.dismiss();
      }
      setIsEditable(prev => !prev);
    }, [handleSaveNote]);

    const handleCursorPosition = useCallback(scrollY => {
      scrollRef.current?.scrollTo({y: scrollY - 30, animated: true});
    }, []);

    // ── RichEditor onChange ───────────────────────────────────────────────────

    const handleEditorChange = useCallback(descriptionText => {
      latestHtmlContentRef.current = descriptionText;
      if (noteIdRef.current && !isLoadingRef.current) {
        debouncedSaveNote(descriptionText);
      }
      onContentChange?.(descriptionText);
    }, [debouncedSaveNote, onContentChange]);

    // ── Title input callbacks ─────────────────────────────────────────────────

    const onTitleFocus = useCallback(() => setIsTitleFocused(true), []);
    const onTitleBlur = useCallback(() => setIsTitleFocused(false), []);
    const onSubmitTitle = useCallback(
      () => richText.current?.focusContentEditor(),
      [],
    );

    // ── Imperative handle ─────────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
      handleImagePickerResult,
      addTimestamp,
      getCurrentContent: () => latestHtmlContentRef.current,
      getCurrentTitle: () => latestTitleRef.current,
      focusEditor: () => richText.current?.focusContentEditor(),
      blurEditor: () => richText.current?.blurContentEditor(),
      toggleEditMode,
    }), [handleImagePickerResult, addTimestamp, toggleEditMode]);

    // ── Render ────────────────────────────────────────────────────────────────

    return (
      <SafeAreaView style={styles.container}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
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
              !isLoading && styles.titleMargin,
            ]}
            placeholder="Title"
            placeholderTextColor="#888"
            value={title}
            editable={isEditable}
            onChangeText={handleTitleChange}
            onFocus={onTitleFocus}
            onBlur={onTitleBlur}
            multiline={false}
            returnKeyType="next"
            onSubmitEditing={onSubmitTitle}
          />
          {isLoading && <LoadingBar isInserting={isLoading} speed={800} />}
          <RichEditor
            ref={richText}
            placeholder="Start typing..."
            style={styles.richEditor}
            initialContentHTML={initialContent}
            editorInitializedCallback={handleEditorInitialized}
            useContainer={true}
            disabled={!isEditable}
            editorStyle={styles.editorStyle}
            onCursorPosition={handleCursorPosition}
            onChange={handleEditorChange}
            customCSS={CUSTOM_CSS}
            onMessage={handleMessage}
          />
        </ScrollView>

        {!isEditable && (
          <TouchableOpacity style={styles.editButton} onPress={toggleEditMode}>
            <MaterialIcons name="edit" size={24} color="white" />
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
          />
        )}
      </SafeAreaView>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: '#fff',
  },
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
  titleMargin: {
    marginBottom: 10,
  },
  richEditor: {
    flex: 1,
    minHeight: 200,
  },
  editorStyle: {
    backgroundColor: '#fefefe',
  },
  editButton: {
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
});

export default React.memo(RichTextEditor, (prevProps, nextProps) => {
  return prevProps.noteId === nextProps.noteId;
});
