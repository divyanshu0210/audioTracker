// ShareNotesSheet.jsx
//
// Bottom sheet listing the ways a note selection can leave the app. Presented
// like PlayerQueue's "Up Next" sheet — same slide-up Modal, same backdrop —
// so sheets behave consistently across the app.

import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

const ShareOption = ({icon, label, description, onPress, disabled}) => (
  <TouchableOpacity
    style={[styles.option, disabled && styles.optionDisabled]}
    onPress={onPress}
    disabled={disabled}>
    <MaterialIcons
      name={icon}
      size={24}
      color={disabled ? '#bbb' : '#007AFF'}
      style={styles.optionIcon}
    />
    <View style={styles.optionText}>
      <Text style={[styles.optionLabel, disabled && styles.optionLabelDisabled]}>
        {label}
      </Text>
      <Text style={styles.optionDescription}>{description}</Text>
    </View>
  </TouchableOpacity>
);

const ShareNotesSheet = ({
  visible,
  onClose,
  noteCount,
  onShareAsPdf,
  onShareAsCopy,
  pdfDisabled,
  pdfDescription,
}) => {
  if (!visible) return null;

  const noun = noteCount === 1 ? 'note' : 'notes';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Backdrop as an absolute sibling rather than a wrapper — same reason
            as PlayerQueue: wrapping the sheet makes it claim the touch
            responder, which swallows the sheet's own gestures. */}
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.sheet}>
          <Text style={styles.title}>
            Share {noteCount} {noun}
          </Text>

          <ShareOption
            icon="picture-as-pdf"
            label="Share as PDF"
            description={pdfDescription || 'A read-only document anyone can open'}
            onPress={onShareAsPdf}
            disabled={pdfDisabled}
          />

          <ShareOption
            icon="note-add"
            label="Share a copy"
            description="Opens in audioTracker, keeps images and timestamps"
            onPress={onShareAsCopy}
          />

          <TouchableOpacity style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default React.memo(ShareNotesSheet);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#222',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  optionDisabled: {
    opacity: 0.6,
  },
  optionIcon: {
    width: 32,
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 15,
    color: '#222',
    fontWeight: '600',
  },
  optionLabelDisabled: {
    color: '#999',
  },
  optionDescription: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  cancel: {
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    color: '#007AFF',
    fontWeight: '600',
  },
});
