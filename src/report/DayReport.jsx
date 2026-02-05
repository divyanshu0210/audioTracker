import React, {useState, useEffect, useRef, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import {fetchNotes, getWatchHistoryByDate} from '../database/R';
import NotesListComponent from '../notes/notesListing/NotesListComponent';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import Entypo from 'react-native-vector-icons/Entypo';
import ViewShot from 'react-native-view-shot';
import Share from 'react-native-share';
import useSettingsStore from '../Settings/settingsStore';
import {useAppState} from '../contexts/AppStateContext';
import { fetchWatchHistoryByDatefromBackend } from '../appMentorBackend/reportMgt';

const DayReport = ({route, navigation}) => {
  const [isLoading, setIsLoading] = useState(true);
  const {date, watchData,mentee} = route.params;
  const [videos, setVideos] = useState([]);
  const {notesList, setNotesList} = useAppState();
  const [showNotes, setShowNotes] = useState(false);
  const [expandedVideoId, setExpandedVideoId] = useState(null);
  const {settings} = useSettingsStore();

  const viewShotRef = useRef();

  useEffect(() => {
    fetchData();
  }, [date]);

  const fetchData = async () => {
    try {
      const videoList =mentee?await fetchWatchHistoryByDatefromBackend(date,mentee.id): await getWatchHistoryByDate(date);
      setVideos(videoList || []);

      const notes = await fetchNotes({date: date});
      setNotesList(notes || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Sort videos by new watch time (descending)
  const sortedVideos = useMemo(() => {
    return [...videos].sort(
      (a, b) => (b.newWatchTimePerDay || 0) - (a.newWatchTimePerDay || 0),
    );
  }, [videos]);

  // Calculate max unfiltered time across all videos (in seconds)
  // const maxUnfilteredTime = useMemo(() => {
  //   return Math.max(...sortedVideos.map(v => v.unfltrdWatchTimePerDay || 0), 0);
  // }, [sortedVideos]);

  
  // Calculate summary times (convert minutes to seconds)
  const totalUnfiltered = (watchData?.totalUnfltrdWatchTime || 0) * 60;
  const totalNew = (watchData?.totalNewWatchTime || 0) * 60;
  const totalWatch = (watchData?.totalWatchTime || 0) * 60;
  const totalRevised = totalWatch - totalNew;
  const totalRepeated = totalUnfiltered - totalWatch;

  // The fixed scale for all progress bars (max time)
  const progressBarScale = totalUnfiltered;

  const formatTime = seconds => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };
  const formatDuration = seconds => {
    if (!seconds || isNaN(seconds)) return '00:00:00';

    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const pad = n => n.toString().padStart(2, '0');

    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  };

  const renderVideoItem = ({item, index}) => {
    const totalSeconds = item.watchTimePerDay || 0;
    const newSeconds = item.newWatchTimePerDay || 0;
    const unfilteredSeconds = item.unfltrdWatchTimePerDay || 0;
    const revisedSeconds = totalSeconds - newSeconds;
    const repeatedSeconds = unfilteredSeconds - totalSeconds;

    const isExpanded = expandedVideoId === item.id;

    return (
      <View style={styles.videoContainer}>
         <TouchableOpacity
          onPress={() =>
            navigation.navigate(
              // item.source_type === 'youtube' ? 'YTubePlayer' : 'VLCPlayer',
              'BacePlayer',
              {item: item.sourceDetails},
            )
          }>
        <View style={{padding: 12}}>
          <View style={styles.videoHeader}>
            {/* Video Icon and Title (smaller) */}
            <View style={styles.videoInfo}>
              {item.source_type === 'drive' ? (
                <Entypo name="google-drive" size={14} color="orange" />
              ) : item.source_type === 'youtube' ? (
                <FontAwesome name="youtube-play" size={14} color="red" />
              ) : item.source_type === 'device' ? (
                <FontAwesome name="mobile" size={14} color="green" />
              ) : (
                <FontAwesome name="file" size={14} color="blue" />
              )}
              <Text style={styles.videoTitle} numberOfLines={1}>
                {item.videoNameInfo || 'Untitled Video'}
              </Text>
            </View>
          </View>

          <View style={styles.timeRowContainer}>
            {/* Time Distribution Bar */}
            <View style={styles.timeDistributionBar}>
              {newSeconds > 0 && (
                <View
                  style={[
                    styles.timeSegment,
                    {
                      width: `${(newSeconds / progressBarScale) * 100}%`,
                      backgroundColor: '#4CAF50',
                    },
                  ]}
                />
              )}
              {revisedSeconds > 0 && (
                <View
                  style={[
                    styles.timeSegment,
                    {
                      width: `${(revisedSeconds / progressBarScale) * 100}%`,
                      backgroundColor: '#2196F3',
                    },
                  ]}
                />
              )}
              {repeatedSeconds > 0 && (
                <View
                  style={[
                    styles.timeSegment,
                    {
                      width: `${(repeatedSeconds / progressBarScale) * 100}%`,
                      backgroundColor: '#F44336',
                    },
                  ]}
                />
              )}
              <View
                style={[
                  styles.timeSegment,
                  {
                    width: `${((progressBarScale - unfilteredSeconds) / progressBarScale) * 100}%`,
                    backgroundColor: '#e0e0e0',
                  },
                ]}
              />
            </View>

            <Text style={styles.totalTimeText}>
              {formatTime(unfilteredSeconds)}
            </Text>

            <View style={{flex: 1}} />

            <View style={styles.badgerow}>
              {/* Badges */}
              {newSeconds > 0 && (
                <View style={[styles.badge, {backgroundColor: '#4CAF50'}]}>
                  <Text style={styles.badgeText}>{formatTime(newSeconds)}</Text>
                </View>
              )}
              {revisedSeconds > 0 && (
                <View style={[styles.badge, {backgroundColor: '#2196F3'}]}>
                  <Text style={styles.badgeText}>
                    {formatTime(revisedSeconds)}
                  </Text>
                </View>
              )}
              {repeatedSeconds > 0 && (
                <View style={[styles.badge, {backgroundColor: '#F44336'}]}>
                  <Text style={styles.badgeText}>
                    {formatTime(repeatedSeconds)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
          </TouchableOpacity>

        <View style={styles.videoProgress}>
          <Text style={styles.totalDurationText}>{formatDuration(0)}</Text>
          {/* Details Button*/}
          <TouchableOpacity
            style={styles.badge}
            onPress={() => setExpandedVideoId(isExpanded ? null : item.id)}>
            <Text style={styles.detailsButtonText}>
              {isExpanded ? 'Hide' : 'More Details'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.totalDurationText}>
            {formatDuration(item.duration)}
          </Text>
        </View>

        {/* Expanded Segments */}
        {isExpanded && (
          <View style={styles.expandedDetails}>
            {item.todayIntervals?.map((interval, idx) => (
              <View key={idx} style={styles.segmentItem}>
                <Text style={styles.intervalText}>
                  {formatTime(interval[0])} - {formatTime(interval[1])}
                </Text>
                <Text style={styles.intervalDuration}>
                  {formatTime(interval[1] - interval[0])}
                </Text>
              </View>
            ))}
          </View>
        )}
        {/* Always-visible Progress Bar showing watched intervals */}

        <View style={styles.progressBar}>
          {item.todayIntervals?.map((interval, idx) => {
            const startPercentage = (interval[0] / item.duration) * 100;
            const widthPercentage =
              ((interval[1] - interval[0]) / item.duration) * 100;

            return (
              <View
                key={idx}
                style={{
                  position: 'absolute',
                  left: `${startPercentage}%`,
                  width: `${widthPercentage}%`,
                  height: '100%',
                  backgroundColor: '#4CAF50',
                }}
              />
            );
          })}
        </View>
        
      </View>
    );
  };

  const handleDeleteNoteCallback = noteId => {
    setNotesList(prev => prev.filter(note => note.rowid !== noteId));
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{marginTop: 20, textAlign: 'center'}}>Loading...</Text>
      </SafeAreaView>
    );
  }

  const handleShareScreenshot = async () => {
    try {
      const uri = await viewShotRef.current.capture();
      await Share.open({
        url: uri,
        type: 'image/png',
        failOnCancel: false,
        title: 'Share Daily Report',
        message: `Here's my report for ${date}`,
        social: Share.Social.WHATSAPP,
      });
    } catch (error) {
      console.error('Error sharing screenshot:', error);
    }
  };


  
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.iconButton}>
          <MaterialIcons name={'arrow-back'} size={24} color="black" />
        </TouchableOpacity>
        <Text style={styles.title}>Daily Report for {date}</Text>
        <View style={{flex: 1}} />
        <TouchableOpacity
          onPress={handleShareScreenshot}
          style={styles.shareButton}>
          <MaterialIcons name={'share'} size={24} color="black" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}>
        <ViewShot
          ref={viewShotRef}
          options={{format: 'png', quality: 0.9}}
          style={styles.screenshotContainer}>
          
          {/* Summary Card */}
          <View style={styles.card}>
            {/* <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Summary</Text>
            </View> */}
            <View style={styles.cardContent}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total: </Text>
                <Text style={styles.summaryValue}>
                  {formatTime(totalUnfiltered)}
                </Text>
              </View>

              <View style={styles.timeBadgeContainer}>
                <View style={[styles.timeBadge, {backgroundColor: '#E8F5E9'}]}>
                  <Text style={[styles.timeBadgeText, {color: '#4CAF50'}]}>
                    New: {formatTime(totalNew)}
                  </Text>
                </View>

                <View style={[styles.timeBadge, {backgroundColor: '#E3F2FD'}]}>
                  <Text style={[styles.timeBadgeText, {color: '#2196F3'}]}>
                    Revised: {formatTime(totalRevised)}
                  </Text>
                </View>

                <View style={[styles.timeBadge, {backgroundColor: '#FFEBEE'}]}>
                  <Text style={[styles.timeBadgeText, {color: '#F44336'}]}>
                    Repeated: {formatTime(totalRepeated)}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Videos Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Videos ({sortedVideos.length})</Text>
            </View>
            <View style={styles.cardContent}>
              <FlatList
                data={sortedVideos}
                keyExtractor={item =>
                  item.id?.toString() || Math.random().toString()
                }
                renderItem={renderVideoItem}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>No videos watched</Text>
                }
                scrollEnabled={false}
              />
            </View>
          </View>
        </ViewShot>

        {/* Notes Card */}
        {!mentee&&(

        
        <View style={styles.card}>
          <TouchableOpacity
            onPress={() => setShowNotes(!showNotes)}
            style={styles.cardHeader}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <Text style={styles.cardTitle}>Notes ({notesList.length})</Text>
              <MaterialIcons
                name={showNotes ? 'arrow-drop-down' : 'arrow-right'}
                size={30}
                color="#000"
                style={{marginTop: 1}}
              />
            </View>
          </TouchableOpacity>
          {showNotes && (
            <View style={styles.cardContent}>
              <NotesListComponent
                isLoading={false}
                loadMoreData={() => {}}
                onDeleteNote={handleDeleteNoteCallback}
                scrollEnabled={false}
              />
            </View>
          )}
        </View>
      )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
    backgroundColor: '#f5f5f5', // Lighter background for contrast
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  iconButton: {
    paddingRight: 10,
  },
  title: {
    padding:5,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  shareButton: {
    paddingHorizontal: 10,
  },
  screenshotContainer: {
    backgroundColor: 'transparent',
  },
  scrollContainer: {
    paddingBottom: 20,
  },

  // Card Styles
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  cardContent: {
    padding: 10,
  },

  // Summary Section Styles
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
  },
  timeBadgeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
  },
  timeBadge: {
    flex: 1,
    minWidth: '30%',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  timeBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },

  // Video Section Styles
  videoContainer: {
    backgroundColor: '#fafafa',
    borderRadius: 8,
    marginBottom: 10,
    overflow: 'hidden',
  },
  videoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  videoInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  videoTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#000',
    marginLeft: 6,
  },

  // Time distribution bar (new/revised/repeated)
  timeRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  timeDistributionBar: {
    flex: 1,
    height: 12,
    flexDirection: 'row',
    borderRadius: 4,
    overflow: 'hidden',
    marginRight: 8,
  },
  timeSegment: {
    height: '100%',
  },
  badgerow: {
    flexDirection: 'row',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  totalTimeText: {
    fontSize: 10,
    color: '#555',
    fontWeight: 'bold',
  },

  // Expanded Segments Styles
  expandedDetails: {
    paddingTop: 10,
  },
  segmentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
    paddingHorizontal: 5,
  },
  intervalText: {
    fontSize: 11,
    color: '#555',
  },
  intervalDuration: {
    fontSize: 11,
    color: '#777',
    fontWeight: '500',
  },

  // Progress bar showing watched intervals
  videoProgress: {
    flexDirection: 'row',
    justifyContent:'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  progressBar: {
    height: 4,
    width: '100%',
    backgroundColor: '#ddd',
    position: 'relative',
    overflow: 'hidden',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  totalDurationText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#444',
  },
  detailsButtonText: {
    fontSize: 10,
    color: '#333',
  },

  // Empty state
  emptyText: {
    padding: 15,
    color: '#888',
    textAlign: 'center',
  },
});

export default DayReport;