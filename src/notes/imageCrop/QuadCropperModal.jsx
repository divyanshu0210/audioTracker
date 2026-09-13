import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {WebView} from 'react-native-webview';
import {QUAD_CROPPER_HTML} from './quadCropperHtml';

// Free-form four-point cropper. The picker hands us the untouched photo and
// this is where it gets trimmed: drag the four corners anywhere — a page shot
// at an angle can be selected as the slanted quadrilateral it actually is, and
// it comes back flattened into a rectangle.
//
// `image` is whatever the picker returned ({data, mime, ...}); `onDone` gets
// the same shape back with the cropped bytes, so callers can keep passing it
// straight to handleImagePickerResult.
const QuadCropperModal = ({visible, image, index, total, onDone, onCancel}) => {
  const webRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const sourceUri = image
    ? image.dataUri
      ? image.dataUri
      : image.data
        ? `data:${image.mime || 'image/jpeg'};base64,${image.data}`
        : image.path || image.uri
    : null;

  // Each image gets a fresh page: the WebView is remounted by key below, so
  // this fires once per photo, after its 'boot' message.
  const loadImage = useCallback(() => {
    if (!sourceUri || !webRef.current) return;
    webRef.current.injectJavaScript(
      `window.__load(${JSON.stringify(sourceUri)}); true;`,
    );
  }, [sourceUri]);

  // The WebView is remounted per image, so every change starts over from the
  // spinner - otherwise Done could fire at a page that has no image yet.
  useEffect(() => {
    setReady(false);
    setBusy(false);
  }, [visible, image]);

  const send = useCallback(name => {
    webRef.current?.injectJavaScript(`window.__cmd('${name}'); true;`);
  }, []);

  const onMessage = useCallback(
    event => {
      let msg;
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch (e) {
        return;
      }
      if (msg.type === 'boot') {
        loadImage();
      } else if (msg.type === 'ready') {
        setReady(true);
      } else if (msg.type === 'result') {
        setBusy(false);
        const comma = msg.uri.indexOf(',');
        onDone({
          ...image,
          data: msg.uri.slice(comma + 1),
          mime: 'image/jpeg',
          width: msg.width,
          height: msg.height,
        });
      } else if (msg.type === 'error') {
        setBusy(false);
        console.log('🔴 QuadCropper:', msg.message);
      }
    },
    [image, loadImage, onDone],
  );

  const handleDone = useCallback(() => {
    if (!ready || busy) return;
    setBusy(true);
    send('crop');
  }, [ready, busy, send]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onCancel}>
      <StatusBar barStyle="light-content" backgroundColor="#0d0f12" />
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={onCancel}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>
            {total > 1 ? `Crop ${index + 1} of ${total}` : 'Crop'}
          </Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => send('rotate')}>
              <MaterialCommunityIcons name="rotate-right" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => send('reset')}>
              <MaterialCommunityIcons name="crop-free" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.canvasWrap}>
          {visible && (
            <WebView
              key={sourceUri ? sourceUri.length + ':' + index : 'empty'}
              ref={webRef}
              source={{html: QUAD_CROPPER_HTML}}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled={false}
              scrollEnabled={false}
              overScrollMode="never"
              androidLayerType="hardware"
              onMessage={onMessage}
              style={styles.web}
            />
          )}
          {(!ready || busy) && (
            <View style={styles.overlay} pointerEvents="none">
              <ActivityIndicator size="large" color="#4da3ff" />
              <Text style={styles.overlayText}>
                {busy ? 'Applying crop…' : 'Loading image…'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.doneBtn, (!ready || busy) && styles.doneDisabled]}
            onPress={handleDone}
            disabled={!ready || busy}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0d0f12'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  headerBtn: {paddingHorizontal: 8, paddingVertical: 6, minWidth: 72},
  headerActions: {flexDirection: 'row', minWidth: 72, justifyContent: 'flex-end'},
  iconBtn: {padding: 8},
  cancel: {color: '#ff6b6b', fontSize: 16},
  title: {color: '#fff', fontSize: 16, fontWeight: '600'},
  canvasWrap: {flex: 1, backgroundColor: '#0d0f12'},
  web: {flex: 1, backgroundColor: '#0d0f12'},
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13,15,18,0.7)',
  },
  overlayText: {color: '#cfd8e3', marginTop: 10, fontSize: 13},
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  hint: {color: '#8d98a7', fontSize: 12, marginBottom: 10},
  doneBtn: {
    backgroundColor: '#4da3ff',
    paddingHorizontal: 44,
    paddingVertical: 12,
    borderRadius: 26,
  },
  doneDisabled: {opacity: 0.5},
  doneText: {color: '#06121f', fontSize: 16, fontWeight: '700'},
});

export default QuadCropperModal;
