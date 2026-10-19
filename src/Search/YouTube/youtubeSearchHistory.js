import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORY_KEY = '@audioTracker/youtubeSearchHistory';
const HISTORY_LIMIT = 17;

export async function getYouTubeSearchHistory() {
  try {
    const saved = await AsyncStorage.getItem(HISTORY_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed)
      ? parsed.filter(item => typeof item === 'string' && item.trim()).slice(0, HISTORY_LIMIT)
      : [];
  } catch (error) {
    console.warn('Could not load YouTube search history:', error?.message || error);
    return [];
  }
}

export async function addYouTubeSearchHistory(query) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return getYouTubeSearchHistory();

  const currentHistory = await getYouTubeSearchHistory();
  const nextHistory = [
    normalizedQuery,
    ...currentHistory.filter(
      item => item.toLocaleLowerCase() !== normalizedQuery.toLocaleLowerCase(),
    ),
  ].slice(0, HISTORY_LIMIT);

  try {
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
  } catch (error) {
    console.warn('Could not save YouTube search history:', error?.message || error);
  }

  return nextHistory;
}
