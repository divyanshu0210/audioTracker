import {upsertItem} from '../../database/C';

const durationToSeconds = duration => {
  if (Number.isFinite(duration)) return duration;
  if (typeof duration !== 'string') return null;

  const parts = duration.trim().split(':');
  if (!parts.length || parts.some(part => !/^\d+$/.test(part))) return null;

  return parts.reduce((seconds, part) => seconds * 60 + Number(part), 0);
};

// Search results are not library items until playback is requested. Persist
// the current YouTube queue as hidden items so watch history can join against
// the normal items table when each video is played.
export const persistYouTubeVideosForPlayback = async videos =>
  Promise.all(
    videos.map(async video => {
      if (!video) return video;
      const sourceId = video.source_id || video.id;
      if (!sourceId) return video;

      try {
        const item = await upsertItem({
          source_id: sourceId,
          type: 'youtube_video',
          title: video.title || 'YouTube video',
          duration: durationToSeconds(video.duration),
          out_show: 0,
          in_show: 0,
        });

        return item
          ? {
              ...video,
              ...item,
              source_id: sourceId,
              thumbnail: video.thumbnail,
              channelTitle: video.channelTitle,
              channel_title: video.channel_title,
            }
          : video;
      } catch (error) {
        console.warn('Could not save YouTube video for playback:', error?.message || error);
        return video;
      }
    }),
  );
