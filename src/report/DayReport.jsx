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
import ViewShot from 'react-native-view-shot';
import Share from 'react-native-share';
import useSettingsStore from '../Settings/settingsStore';
import {useAppState} from '../contexts/AppStateContext';
import {fetchWatchHistoryByDatefromBackend} from '../appMentorBackend/reportMgt';
import VideoReportItem from './VideoReportItem';
import SummaryCard from './SummaryCard';

const DayReport = ({route, navigation}) => {
  const [isLoading, setIsLoading] = useState(true);
  const {date, watchData, mentee} = route.params;
  const [videos, setVideos] = useState([]);
  const {notesList, setNotesList} = useAppState();
  const [showNotes, setShowNotes] = useState(false);
  const {settings} = useSettingsStore();

  const viewShotRef = useRef();

  useEffect(() => {
    fetchData();
  }, [date]);

  const fetchData = async () => {
    try {
      const videoList = mentee
        ? await fetchWatchHistoryByDatefromBackend(date, mentee.id)
        : await getWatchHistoryByDate(date);
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

  // The fixed scale for all progress bars (max time)
  const progressBarScale = totalUnfiltered;

  const renderVideoItem = ({item, index}) => {
    const totalSeconds = item.watchTimePerDay || 0;
    const newSeconds = item.newWatchTimePerDay || 0;
    const unfilteredSeconds = item.unfltrdWatchTimePerDay || 0;
    const revisedSeconds = totalSeconds - newSeconds;
    const repeatedSeconds = unfilteredSeconds - totalSeconds;
    return (
      <VideoReportItem
        item={item}
        newSeconds={newSeconds}
        unfilteredSeconds={unfilteredSeconds}
        revisedSeconds={revisedSeconds}
        repeatedSeconds={repeatedSeconds}
        progressBarScale={progressBarScale}
        intervals={item.todayIntervals}
      />
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
          <SummaryCard
            totalUnfiltered={totalUnfiltered}
            totalNew={totalNew}
            totalWatch={totalWatch}
          />

          {/* Videos Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                Videos ({sortedVideos.length})
              </Text>
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
        {!mentee && (
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
    padding: 5,
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
    shadowOffset: {width: 0, height: 2},
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

  // Empty state
  emptyText: {
    padding: 15,
    color: '#888',
    textAlign: 'center',
  },
});

export default DayReport;
