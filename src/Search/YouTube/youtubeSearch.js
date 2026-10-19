import './textEncodingPolyfill';
import {Innertube} from 'youtubei.js';

let clientPromise;

const randomUUID = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });

// Some React Native JavaScript runtimes do not expose crypto.randomUUID yet.
function ensureRandomUUID() {
  if (globalThis.crypto?.randomUUID) return;
  try {
    if (globalThis.crypto) {
      globalThis.crypto.randomUUID = randomUUID;
    } else {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: {randomUUID},
      });
    }
  } catch (_error) {
    // Leave the platform object alone if the host has locked it.
  }
}

export async function getYouTubeClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      ensureRandomUUID();
      return Innertube.create({
        retrieve_player: false,
        lang: 'en',
        location: 'US',
      });
    })().catch(error => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

const readText = value => {
  if (typeof value === 'string') return value;
  return value?.text || value?.simpleText || '';
};

const readNodeTitle = node =>
  readText(node?.title) || readText(node?.metadata?.title);

const bestThumbnail = thumbnails => {
  if (typeof thumbnails === 'string') return thumbnails;
  const candidates = Array.isArray(thumbnails)
    ? thumbnails
    : Array.isArray(thumbnails?.thumbnails)
      ? thumbnails.thumbnails
      : Array.isArray(thumbnails?.sources)
        ? thumbnails.sources
        : thumbnails?.url
          ? [thumbnails]
          : [];
  const url = candidates
    .slice()
    .sort((left, right) => (right?.width || 0) - (left?.width || 0))
    .find(candidate => typeof candidate?.url === 'string')?.url || null;
  return url?.startsWith('//') ? `https:${url}` : url;
};

const nodeThumbnail = node =>
  bestThumbnail(node?.thumbnails) ||
  bestThumbnail(node?.thumbnail) ||
  bestThumbnail(node?.content_image?.primary_thumbnail?.image) ||
  bestThumbnail(node?.content_image?.image);

export function normalizeYouTubeNode(node, forcedType) {
  if (!node) return null;
  const nodeType = String(node.type || '').toLowerCase();
  const type = forcedType ||
    (nodeType.includes('channel') ? 'channel' :
      nodeType.includes('playlist') ? 'playlist' : 'video');

  if (type === 'channel') {
    const author = node.author || {};
    const channelId = node.id || author.id;
    if (!channelId) return null;
    const channelThumbnail =
      bestThumbnail(author.thumbnails) ||
      bestThumbnail(node.thumbnails) ||
      bestThumbnail(node.thumbnail) ||
      bestThumbnail(node.avatar) ||
      author.avatar_thumbnail_url ||
      null;
    return {
      key: `channel:${channelId}`,
      kind: 'channel',
      id: channelId,
      title: author.name || readNodeTitle(node) || 'YouTube channel',
      thumbnail: channelThumbnail,
      channelTitle: author.name || readNodeTitle(node) || '',
      subtitle:
        readText(node.subscribers) ||
        readText(node.subscriber_count) ||
        readText(node.video_count),
    };
  }

  if (type === 'playlist') {
    const playlistId = node.id || node.playlist_id || node.content_id;
    if (!playlistId) return null;
    const author = node.author || {};
    return {
      key: `playlist:${playlistId}`,
      kind: 'playlist',
      id: playlistId,
      title: readNodeTitle(node) || 'YouTube playlist',
      thumbnail: nodeThumbnail(node),
      channelTitle: author.name || '',
      subtitle: readText(node.video_count_short) || readText(node.video_count),
    };
  }

  const videoId = node.video_id || node.id || node.content_id;
  if (!videoId) return null;
  const author = node.author || {};
  return {
    key: `video:${videoId}`,
    kind: 'video',
    id: videoId,
    source_id: videoId,
    type: 'youtube_video',
    title: readNodeTitle(node) || 'YouTube video',
    thumbnail:
      nodeThumbnail(node) ||
      `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    channelTitle: author.name || '',
    channel_title: author.name || '',
    duration: readText(node.length_text) || readText(node.duration?.text),
    views: readText(node.view_count) || readText(node.short_view_count),
    published: readText(node.published),
  };
}

export function normalizeSearchFeed(feed, requestedType = 'all') {
  const searchResults = Array.from(feed?.results || []);
  if (searchResults.length) {
    const normalized = searchResults.flatMap(node => {
      const nodeType = String(node?.type || '').toLowerCase();
      const contentType = String(node?.content_type || '').toLowerCase();
      const type = nodeType.includes('channel')
        ? 'channel'
        : nodeType.includes('playlist') || contentType === 'playlist'
          ? 'playlist'
          : nodeType.includes('video') || contentType === 'video'
            ? 'video'
            : null;

      if (!type || (requestedType !== 'all' && type !== requestedType)) {
        return [];
      }

      const item = normalizeYouTubeNode(node, type);
      return item ? [item] : [];
    });

    if (normalized.length) return normalized;
  }

  const groups = requestedType === 'all'
    ? [
        ['video', feed?.videos],
        ['playlist', feed?.playlists],
        ['channel', feed?.channels],
      ]
    : [[requestedType, feed?.[`${requestedType}s`]]];
  const seen = new Set();

  return groups.flatMap(([type, nodes]) =>
    Array.from(nodes || []).reduce((items, node) => {
      const normalized = normalizeYouTubeNode(node, type);
      if (normalized && !seen.has(normalized.key)) {
        seen.add(normalized.key);
        items.push(normalized);
      }
      return items;
    }, []),
  );
}

export async function searchYouTube(query, type = 'all') {
  const client = await getYouTubeClient();
  const feed = await client.search(query, type === 'all' ? {} : {type});
  return {feed, items: normalizeSearchFeed(feed, type)};
}

export async function continueYouTubeSearch(feed, type = 'all') {
  if (!feed?.has_continuation) return {feed, items: []};
  const nextFeed = await feed.getContinuation();
  return {feed: nextFeed, items: normalizeSearchFeed(nextFeed, type)};
}

export async function getYouTubeCollection(id, kind) {
  const client = await getYouTubeClient();
  if (kind === 'channel') {
    const channel = await client.getChannel(id);
    const [videosResult, playlistsResult] = await Promise.allSettled([
      channel.getVideos(),
      channel.getPlaylists(),
    ]);
    const videoFeed =
      videosResult.status === 'fulfilled' ? videosResult.value : channel;
    const playlistFeed =
      playlistsResult.status === 'fulfilled' ? playlistsResult.value : null;
    const headerAvatar = channel.header?.author?.thumbnails;

    return {
      title: channel.metadata?.title || channel.header?.author?.name || '',
      thumbnail:
        bestThumbnail(channel.metadata?.avatar) ||
        bestThumbnail(headerAvatar) ||
        bestThumbnail(channel.header?.avatar),
      description: channel.metadata?.description || '',
      videos: normalizeSearchFeed(videoFeed, 'video'),
      playlists: playlistFeed
        ? normalizeSearchFeed(playlistFeed, 'playlist')
        : [],
      feed: videoFeed,
      playlistFeed,
    };
  }

  const entity = await client.getPlaylist(id);

  return {
    title:
      entity?.metadata?.title ||
      entity?.info?.title ||
      entity?.header?.title?.text ||
      '',
    thumbnail:
      bestThumbnail(entity?.metadata?.avatar) ||
      bestThumbnail(entity?.metadata?.thumbnail) ||
      bestThumbnail(entity?.info?.thumbnails),
    description: entity?.metadata?.description || '',
    videos: normalizeSearchFeed(entity, 'video'),
    playlists:
      kind === 'channel' ? normalizeSearchFeed(entity, 'playlist') : [],
    feed: entity,
    playlistFeed: null,
  };
}
