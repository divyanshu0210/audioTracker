import React from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import HeaderButtons from './HeaderButtons';
import {useAppState} from '../../contexts/AppStateContext';

const sourceTypeLabels = {
  youtube: 'YouTube Video',
  drive: 'Drive',
  device: 'Device',
  notebook: 'Notebook',
};

const sourceTypeColors = {
  youtube: '#FF4E42',
  drive: '#007bff',
  device: '#00C853',
  notebook: null, // Use dynamic color from item
};

const ContextHeader = ({style, showHeaderButtons = true}) => {
  const navigation = useNavigation();
  const {activeItem} = useAppState();

  const sourceId = activeItem?.sourceId;
  const sourceType = activeItem?.sourceType;
  const item = activeItem?.item;

  const title = item?.title || 'Related Notes';

  const subtitle = sourceTypeLabels[sourceType] || '';

  const barColor =
    sourceType === 'notebook'
      ? item?.color
      : sourceTypeColors[sourceType] || '#ccc';

  return (
    <View style={[styles.contextHeader, style]}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.iconButton}>
        <MaterialIcons name={'arrow-back'} size={24} color="gray" />
      </TouchableOpacity>

      <View style={styles.titleContainer}>
        <Text style={styles.contextTitle}>{title}</Text>
        <Text style={styles.contextSubtitle}>{subtitle}</Text>
      </View>

      {showHeaderButtons && sourceId && sourceType && (
        <View style={styles.headerButtonsContainer}>
          <HeaderButtons sourceId={sourceId} sourceType={sourceType} />
        </View>
      )}

      {/* Colored bar on the right */}
      {barColor && (
        <View style={[styles.colorBarRight, {backgroundColor: barColor}]} />
      )}
    </View>
  );
};

const styles = {
  contextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    // padding: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
    position: 'relative',
  },
  iconButton: {
    padding: 20,
  },
  titleContainer: {
    flex: 1,
  },
  contextTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  contextSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  headerButtonsContainer: {
    alignItems: 'flex-end',
  },
  colorBarRight: {
    width: 6,
    height: '100%',
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
};

export default ContextHeader;
