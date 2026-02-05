import React, {useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Alert} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Feather from 'react-native-vector-icons/Feather';
import {actions, RichToolbar} from 'react-native-pell-rich-editor';
import {openCamera, pickImage} from '../utils/imageAndCamUtils';
import {getCurrentVideoTime} from '../../music/progressTrackingUtils';

const HIGHLIGHT_COLORS = [
  {id: 'yellow', value: '#ffff00', name: 'Yellow'}, // bright yellow
  {id: 'blue', value: '#4fc3f7', name: 'Blue'}, // fresh sky blue
  {id: 'pink', value: '#ff80ab', name: 'Pink'}, // soft pink
  {id: 'green', value: '#228B22', name: 'Green'}, // Forest Green
  {id: 'orange', value: '#ffa726', name: 'Orange'}, // strong orange
  {id: 'purple', value: '#ba68c8', name: 'Purple'}, // pleasant purple
  {id: 'teal', value: '#4db6ac', name: 'Teal'}, // clean teal
  {id: 'parrotgreen', value: '#7CFC00', name: 'Parrot Green'}, // vivid and lively green
  {id: 'red', value: '#ef5350', name: 'Red'}, // soft red
  {id: 'mint', value: '#a7ffeb', name: 'Mint'}, // light mint
];

const RichTextToolbar = ({
  editorRef,
  handleImagePickerResult,
  captureScreenshot,
  addVLCTimestamp,
  webViewRef,
  onToolbarVisibilityChange,
  isHidden,
}) => {
  const [activeToolbar, setActiveToolbar] = useState(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  // Define our category buttons
  const iconMap = {
    link: ({tintColor}) => (
      <Text style={[styles.toolIcon, {color: tintColor}]}>🔗</Text>
    ),
    heading1: ({tintColor}) => (
      <Text style={[styles.toolIcon, {color: tintColor, fontWeight: 'bold'}]}>
        H1
      </Text>
    ),
    heading2: ({tintColor}) => (
      <Text style={[styles.toolIcon, {color: tintColor, fontWeight: 'bold'}]}>
        H2
      </Text>
    ),
    heading3: ({tintColor}) => (
      <Text style={[styles.toolIcon, {color: tintColor, fontWeight: 'bold'}]}>
        H3
      </Text>
    ),
    heading4: ({tintColor}) => (
      <Text style={[styles.toolIcon, {color: tintColor, fontWeight: 'bold'}]}>
        H4
      </Text>
    ),
    heading5: ({tintColor}) => (
      <Text style={[styles.toolIcon, {color: tintColor, fontWeight: 'bold'}]}>
        H5
      </Text>
    ),
    heading6: ({tintColor}) => (
      <Text style={[styles.toolIcon, {color: tintColor, fontWeight: 'bold'}]}>
        H6
      </Text>
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
          <TouchableOpacity onPress={() => onHighlightWithColor(color.value)}>
            <View
              style={[styles.colorButton, {backgroundColor: color.value}]}
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
  };

  // Define our category buttons
  const categories = [
    {id: 'media', label: 'Media', icon: 'plus-square'},
    {id: 'format', label: 'Format', icon: 'text-format'},
    {id: 'highlight', label: 'Highlight', icon: 'format-color-highlight'},
    {id: 'lists', label: 'Lists', icon: 'format-list-bulleted'},
    {id: 'alignment', label: 'Alignment', icon: 'format-align-left'},
    {id: 'screenshot', label: 'Screenshot', icon: 'screenshot'},
    {id: 'timestamp', label: 'timestamp', icon: 'access-time'},
  ];

  const toolbarConfigs = {
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

  const handleCategoryPress = categoryId => {
    if (categoryId === 'highlight') {
      const newState = !showColorPicker;
      setShowColorPicker(newState);
      setActiveToolbar(null);
      if (onToolbarVisibilityChange) {
        onToolbarVisibilityChange(newState);
      }
      return;
    }

    if (categoryId === 'screenshot') {
      if (captureScreenshot) {
        captureScreenshot();
      }
      return; // Don't change toolbar state
    }

    if (categoryId === 'timestamp') {
      if (webViewRef != null) {
        getCurrentVideoTime(webViewRef);
      } else if (typeof addVLCTimestamp === 'function') {
        addVLCTimestamp();
      }
      return; // Don't change toolbar state
    }
    
    // For other categories, toggle toolbar visibility
    const newState = activeToolbar === categoryId ? null : categoryId;
    setActiveToolbar(newState);
    setShowColorPicker(false);

    if (onToolbarVisibilityChange) {
      onToolbarVisibilityChange(newState !== null);
    }
  };

  //highlighter
  const onHighlightWithColor = (color = 'yellow') => {
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
  };

  const handleCamera = async () => {
    try {
      const image = await openCamera(); // Assuming openCamera returns a URI or an object with URI
      if (image) {
        handleImagePickerResult(image); // Call the onCamera callback with the URI
      }
    } catch (error) {
      console.error('Error opening camera:', error); // Handle any errors
    }
  };

  const handleImage = async () => {
    try {
      const images = await pickImage(); // Assuming openCamera returns a URI or an object with URI
      if (images) {
        console.log('Captured Image:', images);
        for (const image of images) {
          handleImagePickerResult(image);
        }
      }
    } catch (error) {
      console.error('Error opening photo:', error); // Handle any errors
    }
  };

  return (
    <>
      {/* Color Picker Toolbar - appears when highlight is clicked */}
      {showColorPicker && (
        <RichToolbar
          editor={editorRef}
          actions={toolbarConfigs.colors.actions}
          selectedButtonStyle={styles.activeIcon}
          iconTint="#333"
          iconMap={iconMap}
          style={styles.toolbar}
        />
      )}
      {/* Conditional toolbars */}
      {activeToolbar && !showColorPicker && (
        <RichToolbar
          editor={editorRef}
          actions={toolbarConfigs[activeToolbar].actions}
          selectedButtonStyle={styles.activeIcon}
          iconTint="#333"
          iconMap={iconMap}
          style={styles.toolbar}
        />
      )}

      {/* Category selection row */}
      <View style={styles.categoryRow}>
        {categories.map(category => (
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
          style={styles.mainToolbar}
        />
      </View>
    </>
  );
};

const styles = StyleSheet.create({
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

export default RichTextToolbar;
