import React from 'react';
import {Modal, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

const ShareOption = ({icon, label, description, onPress}) => (
  <TouchableOpacity style={styles.option} onPress={onPress}>
    <MaterialIcons name={icon} size={24} color="#007AFF" style={styles.icon} />
    <View style={styles.optionText}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  </TouchableOpacity>
);

const DeviceShareSheet = ({visible, hasDriveLink, onClose, onShareFile, onShareLink}) => {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title}>Share device file</Text>
          <ShareOption
            icon="attach-file"
            label="Share file"
            description="Attach the complete file from this phone to another app."
            onPress={onShareFile}
          />
          <ShareOption
            icon="link"
            label="Share link"
            description={
              hasDriveLink
                ? 'Share the reusable Google Drive link.'
                : 'Create a reusable Drive link in the background. Progress will appear in notifications.'
            }
            onPress={onShareLink}
          />
          <TouchableOpacity style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default React.memo(DeviceShareSheet);

const styles = StyleSheet.create({
  overlay: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)'},
  sheet: {backgroundColor: '#fff', borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingTop: 14, paddingBottom: 8},
  title: {fontSize: 15, fontWeight: 'bold', color: '#222', paddingHorizontal: 16, paddingBottom: 8},
  option: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#eee'},
  icon: {width: 32},
  optionText: {flex: 1},
  label: {fontSize: 15, color: '#222', fontWeight: '600'},
  description: {fontSize: 12, color: '#888', marginTop: 2},
  cancel: {paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#eee', alignItems: 'center'},
  cancelText: {fontSize: 15, color: '#007AFF', fontWeight: '600'},
});
