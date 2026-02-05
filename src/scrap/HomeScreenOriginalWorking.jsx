// import {createMaterialTopTabNavigator} from '@react-navigation/material-top-tabs';
// import React, {useCallback, useRef} from 'react';
// import {Animated, SafeAreaView, StyleSheet, View} from 'react-native';
// import {Provider} from 'react-native-paper';
// import {
//   fetchNotebooksInCategory,
//   getAllCategories,
//   getDeviceFilesInCategory,
//   getFileItemsInCategory,
//   getYouTubeItemsInCategory,
// } from '../categories/catDB';
// import HomeFABBtn from '../components/buttons/HomeFABBtn';
// import {useAppState} from '../contexts/AppStateContext';
// import useDbStore from '../database/dbStore';
// import {
//   fetchNotebooks,
//   getAllDeviceFiles,
//   getItemsByParent,
//   loadYTItemsFromDB,
// } from '../database/R';
// import AllNotesScreen from '../notes/AllNotesList';
// import SearchWrapper from '../Search/HomeScreenHeader/SearchWrapper';
// import DeviceFilesView from '../StackScreens/DeviceFilesView';
// import DriveFilesView from '../StackScreens/DriveFilesView';
// import MainYouTubeView from '../StackScreens/MainYouTubeView';
// import NotebookScreen from '../StackScreens/NoteBook/NoteBookScreen';
// import useMentorMenteeStore from '../appMentor/useMentorMenteeStore';
// import {isAssignmentPending} from '../appMentorBackend/assignmentsMgt';
// import {BASE_URL} from '../appMentorBackend/userMgt';
// import {
//   fetchNotification,
//   updateNotificationCount,
// } from '../appNotification/notificationsMgt';

// const Tab = createMaterialTopTabNavigator();

// const HomeScreen = () => {
//   const {inserting, restoreInProgress} = useDbStore();

//   const [loading, setLoading] = React.useState(true);
//   const bottomSheetRef = useRef(null);

//   const {setDriveLinksList, setItems, items, setDeviceFiles} = useAppState();
//   const {setNotebooks, userInfo} = useAppState();
//   const {setCategories, selectedCategory, setSelectedCategory} = useAppState();
//   const {setMentors, setMentees} = useMentorMenteeStore();

//   // Load categories and default data
//   React.useEffect(() => {
//     const loadInitialData = async () => {
//       try {
//         const cats = await getAllCategories();
//         setCategories(cats);
//         setSelectedCategory(null); // default = null → all data
//       } catch (err) {
//         console.error('Failed to load categories', err);
//       }
//     };
//     const loadInitialNotifications = async () => {
//       try {
//         await fetchNotification();
//         await isAssignmentPending();
//         await updateNotificationCount();
//       } catch (err) {
//         console.error('Failed to load categories', err);
//       }
//     };
//     loadInitialData();
//     loadInitialNotifications();
//     fetchData();
//   }, []);

//   const fetchData = useCallback(async () => {
//     try {
//       const response = await fetch(`${BASE_URL}/mentorships/${userInfo?.id}/`);
//       const data = await response.json();
//       setMentors(data.mentors || []);
//       setMentees(data.mentees || []);
//       console.log(data);
//     } catch (err) {
//       console.error('Error:', err);
//     }
//   }, [userInfo?.id]);

//   // Load data based on selected category
//   React.useEffect(() => {
//     if (restoreInProgress === false) {
//       loadAllData(selectedCategory);
//     }
//   }, [selectedCategory, restoreInProgress]);

//   const loadAllData = async () => {
//     setLoading(true);
//     try {
//       await Promise.all([
//         loadMainYTFromDB((loader = false)),
//         loadDriveItemsfromDB((loader = false)),
//         loadFilesFromDB((loader = false)),
//         loadNotebooks((loader = false)),
//       ]);
//     } catch (err) {
//       console.error('Failed to load data', err);
//     } finally {
//       setLoading(false);
//     }
//   };

//   const loadFilesFromDB = async (loader = true) => {
//     loader && setLoading(loader);
//     try {
//       const files = selectedCategory
//         ? await getDeviceFilesInCategory(selectedCategory)
//         : await getAllDeviceFiles();
//       setDeviceFiles(files || []);
//     } catch (err) {
//       console.error('Error loading files from DB:', err);
//     } finally {
//       loader && setLoading(false);
//     }
//   };

//   const loadMainYTFromDB = async (loader = true) => {
//     loader && setLoading(true);
//     try {
//       const storedItems =
//         (selectedCategory
//           ? await getYouTubeItemsInCategory(selectedCategory)
//           : await loadYTItemsFromDB()) || []; // Ensure it's an array
//       setItems(storedItems);
//     } catch (error) {
//       console.error('Error loading folders from DB:', error);
//     } finally {
//       loader && setLoading(false);
//     }
//   };
//   const loadDriveItemsfromDB = async (loader = true) => {
//     loader && setLoading(true);
//     try {
//       const storedItems = selectedCategory
//         ? await getFileItemsInCategory(selectedCategory)
//         : await getItemsByParent(null);
//       setDriveLinksList(storedItems);
//     } catch (error) {
//       console.error('Error loading folders from DB:', error);
//     } finally {
//       loader && setLoading(false);
//     }
//   };

//   const loadNotebooks = async (loader = true) => {
//     loader && setLoading(true);
//     try {
//       selectedCategory
//         ? fetchNotebooksInCategory(selectedCategory, setNotebooks)
//         : fetchNotebooks(setNotebooks);
//     } catch (error) {
//       console.error('Error fetching notebooks:', error);
//     } finally {
//       loader && setLoading(false);
//     }
//   };

//   const translateX = React.useRef(new Animated.Value(-100)).current;

//   React.useEffect(() => {
//     if (inserting) {
//       Animated.loop(
//         Animated.timing(translateX, {
//           toValue: 300, // adjust this based on screen width
//           duration: 1200,
//           useNativeDriver: true,
//         }),
//       ).start();
//     } else {
//       translateX.stopAnimation();
//       translateX.setValue(-100);
//     }
//   }, [inserting]);

//   const renderTabContent = (ScreenComponent, componentProps) => (
//     <>
//       {inserting && (
//         <View style={styles.loaderBarContainer}>
//           <Animated.View
//             style={[styles.loaderSegment, {transform: [{translateX}]}]}
//           />
//         </View>
//       )}
//       <ScreenComponent {...componentProps} />
//     </>
//   );

//   return (
//     <Provider>
//       <SafeAreaView style={styles.container}>
//         <SearchWrapper />

//         <View style={{flex: 1, padding: 10}}>
//           <Tab.Navigator
//             screenOptions={{
//               tabBarActiveTintColor: '#000',
//               tabBarIndicatorStyle: {backgroundColor: '#000'},
//               tabBarStyle: {
//                 backgroundColor: '#f0f0f0',
//                 marginBottom: 5,
//                 borderRadius: 10,
//               },
//               tabBarLabelStyle: {
//                 fontWeight: 'bold',
//                 fontSize: 12,
//                 marginHorizontal: -15,
//               },
//             }}>
//             <Tab.Screen name="YouTube">
//               {() =>
//                 renderTabContent(MainYouTubeView, {
//                   loading,
//                   onRefresh: () => loadMainYTFromDB(),
//                 })
//               }
//             </Tab.Screen>

//             <Tab.Screen name="Device">
//               {() =>
//                 renderTabContent(DeviceFilesView, {
//                   loading,
//                   onRefresh: () => loadFilesFromDB(),
//                 })
//               }
//             </Tab.Screen>

//             <Tab.Screen name="Drive">
//               {() =>
//                 renderTabContent(DriveFilesView, {
//                   loading,
//                   onRefresh: () => loadDriveItemsfromDB(),
//                 })
//               }
//             </Tab.Screen>
//             <Tab.Screen name="Notebooks">
//               {() =>
//                 renderTabContent(NotebookScreen, {
//                   loading,
//                   onRefresh: () => loadNotebooks(),
//                 })
//               }
//             </Tab.Screen>

//             <Tab.Screen name={selectedCategory ? `Notes` : 'All Notes'}>
//               {() => renderTabContent(AllNotesScreen, {})}
//             </Tab.Screen>
//           </Tab.Navigator>
//         </View>

//         <HomeFABBtn nbSheetRef={bottomSheetRef} />
//       </SafeAreaView>
//     </Provider>
//   );
// };

// export default HomeScreen;

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: '#fff',
//   },
//   customHeader: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'space-between',
//     padding: 8,
//     backgroundColor: '#0F56B3',
//     borderBottomWidth: 1,
//     borderBottomColor: '#ddd',
//     zIndex: 2,
//   },

//   headerTitle: {
//     fontSize: 20,
//     fontWeight: 'bold',
//     color: '#333',
//   },
//   loaderBarContainer: {
//     height: 2,
//     backgroundColor: '#e0e0e0',
//     overflow: 'hidden',
//     marginBottom: 5,
//     borderRadius: 2,
//   },

//   loaderSegment: {
//     height: 4,
//     width: 100, // width of the animated segment
//     backgroundColor: '#007aff',
//     borderRadius: 2,
//   },
//   overlayWrapper: {
//     position: 'absolute',
//     top: 0,
//     left: 0,
//     right: 0,
//     bottom: 0,
//     zIndex: 3,
//   },

//   overlay: {
//     ...StyleSheet.absoluteFillObject,
//     backgroundColor: 'rgba(0,0,0,0.3)', // Dark semi-transparent
//   },
// });