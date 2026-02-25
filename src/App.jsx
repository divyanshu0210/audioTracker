// import 'react-native-gesture-handler';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createDrawerNavigator} from '@react-navigation/drawer';
import {NavigationContainer, useNavigation} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import React, {useEffect} from 'react';
import {ActivityIndicator, Button, StyleSheet, Text, View} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {MenuProvider} from 'react-native-popup-menu';
import 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Feather from 'react-native-vector-icons/Feather';
import FontAwesome6 from 'react-native-vector-icons/FontAwesome6';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import GoogleLoginScreen from './auth/GoogleLoginScreen';
import CategoryDetailScreen from './categories/CategoryDetailScreen';
import AddNotebookBottomSheet from './components/bottomsheets/AddNotebookBottomSheet';
import NoteInfoBottomMenu from './components/bottomsheets/NoteInfoBottomMenu';
import {AppStateProvider, useAppState} from './contexts/AppStateContext';
import useDbStore from './database/dbStore';
import useLinkHandler from './Linking/LinkHandler';
import useSharedContentHandler from './Linking/ShareHandler';
import BacePlayer from './music/BacePlayer';
import NotebookNotesScreen from './StackScreens/NoteBook/NotebookNotesScreen';
import NotesListScreen from './notes/NotesListScreen';
import NotesSectionWithBack from './notes/NotesSectionWithBack';
import RichTextEditor from './notes/richEditor/RichTextEditor';
import DayReport from './report/DayReport';
import SettingsScreen from './Settings/Settings';
import DeviceFilesView from './StackScreens/DeviceFilesView';
import GDriveFolderOverview from './StackScreens/GDriveFolderOverview';
import GoogleDriveViewer from './StackScreens/GoogleDriveViewer';
import PlaylistView from './StackScreens/PlaylistView';
import HomeScreen from './TabScreens/HomeScreen';
import ProfileTab from './TabScreens/ProfileTab';
import ReportScreen from './report/ReportScreen';
import copyDatabaseToAccessibleLocation from './database/dbCopyUtil';
import MenteeList from './appMentor/MenteeList';
import AssignScreen from './appMentor/AssignScreen';
import CreateCategoryModal from './components/modals/CreateCategoryModal';
import CategorySelectionModal from './components/modals/CategorySelectionModal';
import {debugAsyncStorage} from './contexts/utils';
import NotificationList from './appNotification/screens/NotificationList';
import notifee, {AndroidImportance, EventType} from '@notifee/react-native';
import ReportTab from './TabScreens/ReportTab';
import useMentorMenteeStore from './appMentor/useMentorMenteeStore';
import MentorshipRequestBottomSheet from './appMentor/MentorshipRequestBottomSheet';
import {BottomSheetModalProvider} from '@gorhom/bottom-sheet';
import {GlobalBottomSheets} from './components/bottomsheets/GlobalBottomSheets';
import MainHeader from './components/headers/MainHeader';
import SearchWrapper from './Search/SearchWrapper';
import FullHistoryScreen from './history/FullHistoryScreen';
import CategoriesView from './categories/CategoriesView';
import { initDatabase, resetDatabase } from './database/database';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function RootNavigator() {
  useLinkHandler(); // Now has access to navigation + context
  useSharedContentHandler();
  const {
    createCategoryModalVisible,
    setCreateCategoryModalVisible,
    setCategories,
  } = useAppState();
  const navigation = useNavigation();
  // debugAsyncStorage()

  useEffect(() => {
    // Handle foreground notification press events
    const unsubscribe = notifee.onForegroundEvent(({type, detail}) => {
      if (
        type === EventType.PRESS &&
        detail.pressAction?.id === 'open-notifications'
      ) {
        // Navigate to NotificationList screen
        navigation.navigate('Notifications');
      }
    });

    return () => unsubscribe(); // Cleanup the event listener
  }, [navigation]);

  return (
    <>
      <Stack.Navigator>
        <Stack.Screen
          name="GoogleLoginScreen"
          component={GoogleLoginScreen}
          options={{headerShown: false}}
        />
        <Stack.Screen
          name="MainApp"
          component={MainApp}
          options={{headerShown: false}}
        />

        <Stack.Screen
          name="DayReport"
          component={DayReport}
          options={{headerShown: false}}
        />
        <Stack.Screen
          name="NotesSectionWithBack"
          component={NotesSectionWithBack}
          options={{headerShown: false}}
        />
        <Stack.Screen
          name="RichTextEditor"
          component={RichTextEditor}
          options={{headerShown: false}}
        />

        <Stack.Screen
          name="GDriveFolderOverview"
          component={GDriveFolderOverview}
        />
        <Stack.Screen
          name="GoogleDriveViewer"
          component={GoogleDriveViewer}
          options={{headerShown: false}}
        />
        <Stack.Screen
          name="PlaylistView"
          component={PlaylistView}
          options={{headerShown: false}}
        />
        <Stack.Screen
          name="NotebookNotesScreen"
          component={NotebookNotesScreen}
          options={{headerShown: false}}
        />
        <Stack.Screen name="BacePlayer" component={BacePlayer} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="DeviceFilesView" component={DeviceFilesView} />
        <Stack.Screen name="NotesListScreen" component={NotesListScreen} />
        <Stack.Screen
          name="AssignScreen"
          component={AssignScreen}
          options={{headerShown: false}}
        />

        <Stack.Screen
          name="MyReportScreen"
          component={ReportScreen}
          options={{headerShown: false}}
        />
        <Stack.Screen
          name="CategoryDetailScreen"
          component={CategoryDetailScreen}
          options={{headerShown: false}}
        />

        <Stack.Screen
          name="Notifications"
          component={NotificationList}
          // options={{headerShown: false}}
        />

        <Stack.Screen
          name="FullHistoryScreen"
          component={FullHistoryScreen}
          options={{title: 'Watch History'}}
        />
        <Stack.Screen
          name="CategoriesView"
          component={CategoriesView}
          options={{headerShown: false}}
        />
        <Stack.Screen
          name="ProfileTab"
          component={ProfileTab}
          options={{headerShown: false}}
        />
        <Stack.Screen
          name="SearchWrapper"
          component={SearchWrapper}
          options={{headerShown: false, unmountOnBlur: true}}
        />
      </Stack.Navigator>

      <CreateCategoryModal
        visible={createCategoryModalVisible}
        onClose={() => setCreateCategoryModalVisible(false)}
        onCategoryCreated={newCat => {
          setCategories(prev => [newCat, ...prev]);
        }}
      />

      <CategorySelectionModal />
    </>
  );
}

// 🔹 Main App (Tabs)
function MainApp({route}) {
  const user = route.params?.user; // Get user data
  const {checkingAvailableBackup} = useDbStore();

  console.log(route);
  return (
    <>
      <MainHeader />
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#000',
          tabBarInactiveTintColor: '#999',
          tabBarLabelStyle: {fontSize: 16},
          tabBarShowLabel: false, // <-- This hides the labels
        }}>
        <Tab.Screen
          name="Home"
          options={{
            tabBarIcon: () => (
              <MaterialCommunityIcons name="home" size={25} color="#000" />
            ),
          }}>
          {/* {(props) => <HomeDrawer {...props} user={user} />}  */}
          {props => <HomeStack {...props} user={user} />}
        </Tab.Screen>
        <Tab.Screen
          name="Report"
          component={ReportTab}
          options={{
            tabBarIcon: () => (
              <Ionicons name="stats-chart" size={20} color="#000" />
            ),
          }}
        />

        {/* <Tab.Screen
            name="Category"
            component={CategoriesStack}
            options={{
              tabBarIcon: () => (
                <MaterialCommunityIcons
                  name="account-circle"
                  size={26}
                  color="#000"
                />
              ),
            }}
          /> */}
      </Tab.Navigator>

      <GlobalBottomSheets />
      {checkingAvailableBackup && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Checking for backups..</Text>
        </View>
      )}
    </>
  );
}

// 🔹 Home Stack Navigator (Stack inside Home)
function HomeStack({user}) {
  const navigation = useNavigation(); // <-- this is missing in your code
  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', e => {
      // Reset to a specific screen when Home tab is pressed
      navigation.navigate('Home', {
        screen: 'HomeScreen', // <-- name of the screen inside HomeStack
      });
    });

    return unsubscribe;
  }, [navigation]);
  return (
    <Stack.Navigator>
      <Stack.Screen name="HomeScreen" options={{headerShown: false}}>
        {props => <HomeScreen {...props} user={user} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

const CategoriesStack = () => {
  const navigation = useNavigation(); // <-- this is missing in your code
  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', e => {
      // Reset to a specific screen when Home tab is pressed
      navigation.navigate('Category', {
        screen: 'ProfileTab', // <-- name of the screen inside HomeStack
      });
    });

    return unsubscribe;
  }, [navigation]);
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="ProfileTab"
        component={ProfileTab}
        options={{headerShown: false}}
      />
    </Stack.Navigator>
  );
};

// 🔹 Root Stack Navigator (Login + MainApp)
export default function App() {
  const {loading, backupInProgress, restoreInProgress} = useDbStore();

  // useEffect(() => {
  //   resetDatabase();
  //   initDatabase();

  // }, []);

  return (
    <>
      <AppStateProvider>
        <GestureHandlerRootView>
          <MenuProvider>
            <NavigationContainer>
              <RootNavigator />
{/* 
             <Button
                title="Debug"
                onPress={() => {
                  copyDatabaseToAccessibleLocation();
                }}></Button>  */}
            </NavigationContainer>
          </MenuProvider>
        </GestureHandlerRootView>
      </AppStateProvider>

      {loading && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>
            {backupInProgress ? 'Saving your Progress' : 'Signing out...'}
          </Text>
        </View>
      )}
      {restoreInProgress && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Getting things ready..</Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#fff',
  },
});
