export const ItemTypes = Object.freeze({
  YOUTUBE: 'youtube',
  DEVICE: 'device',
  DRIVE: 'drive',
  NOTEBOOK: 'notebook',
  NOTE: 'note',
});
export const ScreenTypes = Object.freeze({
  MAIN: 'out',
  IN: 'in',
});

export const ITEM_TYPES_THAT_USE_ITEMS_TABLE = [
  'youtube_video',
  'youtube_playlist',
  'device_file',
  'drive_file',
  'drive_folder',
] ;

export const convertTypetoItemType = type => {
  return ItemTypes[type.split('_')[0].toUpperCase()];
};