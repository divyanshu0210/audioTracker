import React from 'react';
import AppHeader from '../../components/headers/AppHeader';
import {useSelectionStore} from '../../stores/useSelectionStore';

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
  notebook: null,
};

const ContextHeader = ({}) => {
  const activeItem = useSelectionStore(state => state.activeItem);

  const isNoteSource = activeItem?.sourceType === 'note';
  const resolvedItem = isNoteSource ? activeItem?.item : activeItem;

  const sourceId = isNoteSource
    ? resolvedItem?.source_id
    : resolvedItem?.sourceId;

  const sourceType = isNoteSource
    ? resolvedItem?.source_type
    : resolvedItem?.sourceType;

  const item = isNoteSource ? resolvedItem?.relatedItem : resolvedItem?.item;

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
        initialNoteFilters: sourceType ? [sourceType.split('_')[0] + '_notes'] : [],
        sourceId: sourceId,
      }}
      rightComponent={null}
    />
  );
};

export default ContextHeader;
