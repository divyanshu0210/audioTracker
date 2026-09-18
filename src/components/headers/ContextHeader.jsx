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

// menteeName is set only when this header sits over a mentee's notes, and it
// changes two things: the line under the title says whose writing this is, and
// the search box goes. Their notes are deliberately outside this user's search
// index - mentee_notes is a plain table while `notes` is the fts5 one the box
// queries - so searching here would quietly answer with the mentor's own notes
// on the same lecture.
const ContextHeader = ({menteeName = null}) => {
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

  const typeLabel = sourceTypeLabels[sourceType] || '';
  const subtitle = menteeName
    ? [typeLabel, 'Notes by ' + menteeName].filter(Boolean).join(' · ')
    : typeLabel;

  const barColor =
    sourceType === 'notebook'
      ? item?.color
      : sourceTypeColors[sourceType] || '#ccc';

  return (
    <AppHeader
      title={title}
      subtitle={subtitle}
      accentColor={barColor}
      enableSearch={!menteeName}
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
