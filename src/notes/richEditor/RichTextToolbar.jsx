import React, {useState, useCallback, useMemo} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Alert} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Feather from 'react-native-vector-icons/Feather';
import {actions, RichToolbar} from 'react-native-pell-rich-editor';
import {openCamera, pickImage} from '../utils/imageAndCamUtils';
import {getCurrentVideoTime} from '../../music/progressTrackingUtils';

const HIGHLIGHT_COLORS = [
  {id: 'yellow', hex: '#ffff00', name: 'Yellow'}, // bright yellow
  {id: 'blue', hex: '#4fc3f7', name: 'Blue'}, // fresh sky blue
  {id: 'pink', hex: '#ff80ab', name: 'Pink'}, // soft pink
  {id: 'green', hex: '#228B22', name: 'Green'}, // Forest Green
  {id: 'orange', hex: '#ffa726', name: 'Orange'}, // strong orange
  {id: 'purple', hex: '#ba68c8', name: 'Purple'}, // pleasant purple
  {id: 'teal', hex: '#4db6ac', name: 'Teal'}, // clean teal
  {id: 'parrotgreen', hex: '#7CFC00', name: 'Parrot Green'}, // vivid and lively green
  {id: 'red', hex: '#ef5350', name: 'Red'}, // soft red
  {id: 'mint', hex: '#a7ffeb', name: 'Mint'}, // light mint
];

const TOOLBAR_CONFIGS = {
  format: {
    actions: [
      actions.setBold,
      actions.setItalic,
      actions.setUnderline,
      'code',
      'heading1',
      'heading2',
      'heading3',
      'heading4',
      'heading5',
      'heading6',
    ],
  },
  lists: {
    actions: [
      actions.insertBulletsList,
      actions.insertOrderedList,
      'indent',
      'outdent',
    ],
  },
  alignment: {
    actions: [
      actions.alignLeft,
      actions.alignCenter,
      actions.alignRight,
      actions.alignFull,
    ],
  },
  media: {actions: ['image', 'camera']},
  colors: {
    actions: [
      ...HIGHLIGHT_COLORS.map(
        color =>
          `color${color.id.charAt(0).toUpperCase() + color.id.slice(1)}`,
      ),
      'colorRemove',
    ],
  },
};

const CATEGORIES = [
  {id: 'media', label: 'Media', icon: 'plus-square'},
  {id: 'format', label: 'Format', icon: 'text-format'},
  {id: 'highlight', label: 'Highlight', icon: 'format-color-highlight'},
  {id: 'lists', label: 'Lists', icon: 'format-list-bulleted'},
  {id: 'alignment', label: 'Alignment', icon: 'format-align-left'},
  {id: 'screenshot', label: 'Screenshot', icon: 'screenshot'},
  {id: 'timestamp', label: 'timestamp', icon: 'access-time'},
];

const SECONDARY_TOOLBAR_KEYS = ['format', 'lists', 'alignment', 'media'];

const RichTextToolbar = ({
  editorRef,
  handleImagePickerResult,
  captureScreenshot,
  addTimestampCb,
  onToolbarVisibilityChange,
}) => {
     console.log('🔄🔄 RichTextToolbar RENDERING', new Date().toISOString());
  const [activeToolbar, setActiveToolbar] = useState(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const onHighlightWithColor = useCallback((color = 'yellow') => {
    if (editorRef.current?.webviewBridge?.injectJavaScript) {
      editorRef.current.webviewBridge.injectJavaScript(`
            try {
              document.execCommand('hiliteColor', false, '${color}');
            } catch(e) {
              const selection = window.getSelection();
              if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const span = document.createElement('span');
                span.style.backgroundColor = '${color}';
                range.surroundContents(span);
              }
            }
            true;
          `);
    } else {
      editorRef.current?.insertHTML(
        '<span style="background-color:yellow;"> </span>',
      );
    }
  }, []);

  const handleCamera = useCallback(async () => {
    try {
      const image = await openCamera();
      if (image) handleImagePickerResult(image);
    } catch (error) {
      console.error('Error opening camera:', error);
    }
  }, [handleImagePickerResult]);

  const handleImage = useCallback(async () => {
    try {
      const images = await pickImage();
      if (images) {
        console.log('Captured Image:', images);
        for (const image of images) handleImagePickerResult(image);
      }
    } catch (error) {
      console.error('Error opening photo:', error);
    }
  }, [handleImagePickerResult]);

  const handleCategoryPress = useCallback(categoryId => {
    if (categoryId === 'highlight') {
      setShowColorPicker(prev => {
        const newState = !prev;
        onToolbarVisibilityChange?.(newState);
        return newState;
      });
      setActiveToolbar(null);
      return;
    }
    if (categoryId === 'screenshot') {
      captureScreenshot?.();
      return;
    }
    if (categoryId === 'timestamp') {
      if (typeof addTimestampCb === 'function') addTimestampCb();
      return;
    }
    setActiveToolbar(prev => {
      const newState = prev === categoryId ? null : categoryId;
      setShowColorPicker(false);
      onToolbarVisibilityChange?.(newState !== null);
      return newState;
    });
  }, [captureScreenshot, addTimestampCb, onToolbarVisibilityChange]);

  const iconMap = useMemo(() => ({
    [actions.setBold]: ({tintColor}) => (
      <Text style={[styles.formatIcon, {color: tintColor, fontWeight: '900'}]}>B</Text>
    ),
    [actions.setItalic]: ({tintColor}) => (
      <Text style={[styles.formatIcon, {color: tintColor, fontStyle: 'italic', fontWeight: '700'}]}>I</Text>
    ),
    [actions.setUnderline]: ({tintColor}) => (
      <Text style={[styles.formatIcon, {color: tintColor, textDecorationLine: 'underline', fontWeight: '700'}]}>U</Text>
    ),
    [actions.insertBulletsList]: ({tintColor}) => (
      <MaterialCommunityIcons name="format-list-bulleted" size={24} color={tintColor} />
    ),
    [actions.insertOrderedList]: ({tintColor}) => (
      <MaterialCommunityIcons name="format-list-numbered" size={24} color={tintColor} />
    ),
    [actions.alignLeft]: ({tintColor}) => (
      <MaterialCommunityIcons name="format-align-left" size={24} color={tintColor} />
    ),
    [actions.alignCenter]: ({tintColor}) => (
      <MaterialCommunityIcons name="format-align-center" size={24} color={tintColor} />
    ),
    [actions.alignRight]: ({tintColor}) => (
      <MaterialCommunityIcons name="format-align-right" size={24} color={tintColor} />
    ),
    [actions.alignFull]: ({tintColor}) => (
      <MaterialCommunityIcons name="format-align-justify" size={24} color={tintColor} />
    ),
    indent: ({tintColor}) => (
      <MaterialCommunityIcons name="format-indent-increase" size={24} color={tintColor} />
    ),
    outdent: ({tintColor}) => (
      <MaterialCommunityIcons name="format-indent-decrease" size={24} color={tintColor} />
    ),
    code: ({tintColor}) => (
      <MaterialCommunityIcons name="code-tags" size={24} color={tintColor} />
    ),
    undo: ({tintColor}) => (
      <MaterialCommunityIcons name="undo-variant" size={24} color={tintColor} />
    ),
    redo: ({tintColor}) => (
      <MaterialCommunityIcons name="redo-variant" size={24} color={tintColor} />
    ),
    link: ({tintColor}) => (
      <MaterialCommunityIcons name="link-variant" size={24} color={tintColor} />
    ),
    heading1: ({tintColor}) => (
      <Text style={[styles.headingIcon, {color: tintColor}]}>H1</Text>
    ),
    heading2: ({tintColor}) => (
      <Text style={[styles.headingIcon, {color: tintColor}]}>H2</Text>
    ),
    heading3: ({tintColor}) => (
      <Text style={[styles.headingIcon, {color: tintColor}]}>H3</Text>
    ),
    heading4: ({tintColor}) => (
      <Text style={[styles.headingIcon, {color: tintColor}]}>H4</Text>
    ),
    heading5: ({tintColor}) => (
      <Text style={[styles.headingIcon, {color: tintColor}]}>H5</Text>
    ),
    heading6: ({tintColor}) => (
      <Text style={[styles.headingIcon, {color: tintColor}]}>H6</Text>
    ),
    highlight: ({tintColor}) => (
      <TouchableOpacity onPress={() => handleCategoryPress('highlight')}>
        <MaterialCommunityIcons
          name="format-color-highlight"
          size={24}
          color={tintColor}
        />
      </TouchableOpacity>
    ),
    camera: ({tintColor}) => (
      <TouchableOpacity onPress={handleCamera}>
        <MaterialIcons name="photo-camera" size={24} color={tintColor} />
      </TouchableOpacity>
    ),
    image: ({tintColor}) => (
      <TouchableOpacity onPress={handleImage}>
        <MaterialIcons name="image" size={24} color={tintColor} />
      </TouchableOpacity>
    ),
    // Dynamically generate color buttons
    ...HIGHLIGHT_COLORS.reduce(
      (acc, color) => ({
        ...acc,
        [`color${color.id.charAt(0).toUpperCase() + color.id.slice(1)}`]: ({
          tintColor,
        }) => (
          <TouchableOpacity onPress={() => onHighlightWithColor(color.hex)}>
            <View
              style={[styles.colorButton, {backgroundColor: color.hex}]}
            />
          </TouchableOpacity>
        ),
      }),
      {},
    ),
    colorRemove: ({tintColor}) => (
      <TouchableOpacity onPress={() => onHighlightWithColor('transparent')}>
        <MaterialIcons name="highlight-off" size={24} color={tintColor} />
      </TouchableOpacity>
    ),
  }), [handleCategoryPress, handleCamera, handleImage, onHighlightWithColor]);

  return (
    <>
      {/* All secondary toolbars pre-mounted; only the wrapper visibility changes */}
      <View style={showColorPicker ? null : styles.hidden}>
        <RichToolbar
          editor={editorRef}
          actions={TOOLBAR_CONFIGS.colors.actions}
          selectedButtonStyle={styles.activeIcon}
          iconTint="#333"
          iconMap={iconMap}
          style={styles.toolbar}
        />
      </View>
      {SECONDARY_TOOLBAR_KEYS.map(key => (
        <View
          key={key}
          style={activeToolbar === key && !showColorPicker ? null : styles.hidden}>
          <RichToolbar
            editor={editorRef}
            actions={TOOLBAR_CONFIGS[key].actions}
            selectedButtonStyle={styles.activeIcon}
            iconTint="#333"
            iconMap={iconMap}
            style={styles.toolbar}
          />
        </View>
      ))}

      {/* Category selection row */}
      <View style={styles.categoryRow}>
        {CATEGORIES.map(category => (
          <TouchableOpacity
            key={category.id}
            style={[
              styles.categoryButton,
              (activeToolbar === category.id ||
                (category.id === 'highlight' && showColorPicker)) &&
                styles.activeCategory,
            ]}
            onPress={() => handleCategoryPress(category.id)}>
            {category.icon ? (
              category.id === 'highlight' ? (
                <MaterialCommunityIcons
                  name={category.icon}
                  size={24}
                  color={showColorPicker ? '#6200EE' : '#333'}
                />
              ) : category.id === 'media' ? (
                <Feather name={category.icon} size={24} color="#333" />
              ) : (
                <MaterialIcons name={category.icon} size={24} color="#333" />
              )
            ) : (
              <Text style={styles.categoryText}>{category.label}</Text>
            )}
          </TouchableOpacity>
        ))}

        <RichToolbar
          editor={editorRef}
          actions={['undo', 'redo']}
          selectedButtonStyle={styles.activeIcon}
          iconTint="#333"
          iconMap={iconMap}
          style={styles.mainToolbar}
        />
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  hidden: {
    display: 'none',
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 1,
    backgroundColor: '#f5f5f5',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  categoryButton: {
    padding: 8,
    borderRadius: 4,
  },
  activeCategory: {
    backgroundColor: '#e0e0e0',
  },
  categoryText: {
    fontWeight: '500',
  },
  toolbar: {
    backgroundColor: '#f5f5f5',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  mainToolbar: {
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    paddingVertical: 0,
  },
  toolIcon: {
    fontSize: 16,
    color: '#424242',
    margin: 4,
  },
  formatIcon: {
    fontSize: 18,
    width: 24,
    textAlign: 'center',
  },
  headingIcon: {
    fontSize: 15,
    fontWeight: '800',
    width: 28,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  activeIcon: {
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
  },
  colorButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    margin: 8,
    borderWidth: 1,
    borderColor: '#ccc',
  },
});

export default React.memo(RichTextToolbar);
