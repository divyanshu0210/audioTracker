import React from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useAppState} from '../../contexts/AppStateContext';
import AppHeader from '../../components/headers/AppHeader';

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

const ContextHeader = ({}) => {
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
    <AppHeader
      title={title}
      subtitle={subtitle}
      accentColor={barColor}
      enableSearch
      searchParams={{
        initialSearchActive: true,
        mode: 'notes',
        initialNoteFilters: [sourceType.split('_')[0] + '_notes'],
        sourceId: sourceId,
      }}
      rightComponent={null}
    />
  );
};

export default ContextHeader;
