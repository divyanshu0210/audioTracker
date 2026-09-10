import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Dimensions,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Modal from 'react-native-modal';
import useMentorMenteeStore from './useMentorMenteeStore';
import UserList from './UserList';
import {useAppState} from '../contexts/AppStateContext';
import {addCategory} from '../categories/catDB';
import {TabView, SceneMap} from 'react-native-tab-view';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useSelectionStore} from '../stores/useSelectionStore';
import { navigationRef } from '../handlers/navigationRef';
import useAssignmentStatusStore from './useAssignmentStatusStore';
import UserAvatar from './UserAvatar';
import useAssignmentInboxStore from './useAssignmentInboxStore';
import useSettingsStore from '../Settings/settingsStore';
import {
  loadMenteeAssignmentStatus,
  markAssignmentsSeen,
} from '../appMentorBackend/assignmentsMgt';

const CustomTabBar = ({navigationState, setIndex, onSwap}) => {
  return (
    <View style={styles.customTabBar}>
      {navigationState.routes.map((route, i) => (
        <TouchableOpacity
          key={route.key}
          style={[
            styles.customTab,
            navigationState.index === i && styles.customTabActive,
          ]}
          onPress={() => setIndex(i)}
          accessibilityLabel={route.title}
          accessibilityRole="tab">
          <Text
            style={[
              styles.customTabText,
              navigationState.index === i && styles.customTabTextActive,
            ]}>
            {route.title}
          </Text>
          {navigationState.index === i && <View style={styles.tabIndicator} />}
        </TouchableOpacity>
      ))}

      {/* Which list matters most depends on whether someone is mostly
          mentoring or being mentored, and that is not the same for everyone.
          Put next to the tabs rather than buried in Settings: it is a
          preference about this control, and it is only worth changing while
          looking at it. */}
      <TouchableOpacity
        style={styles.swapTabs}
        onPress={onSwap}
        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
        accessibilityLabel="Swap the order of the mentee and mentor tabs"
        accessibilityRole="button">
        <Ionicons name="swap-horizontal" size={18} color="#5f6368" />
      </TouchableOpacity>
    </View>
  );
};

const MentorMenteeDrawer = () => {
  const {userInfo} = useAppState();
  const menteesFirst = useSettingsStore(
    state => state.settings?.menteesFirst ?? true,
  );
  const updateSettings = useSettingsStore(state => state.updateSettings);
  const {
    mentors,
    mentees,
    setActiveMentee,
    setActiveMentor,
    activeMentor,
    activeMentee,
    isLoading,
    drawerVisible,
    setDrawerVisible,
    setActiveCategoryId,
  } = useMentorMenteeStore();
  const setSelectedCategory = useSelectionStore(
    state => state.setSelectedCategory,
  );

  const [searchText, setSearchText] = useState('');
  const [selectedName, setSelectedName] = useState('You');
  const [selectedId, setSelectedId] = useState('you');
  const [index, setIndex] = useState(0);
  const [routes, setRoutes] = useState([
    {key: 'mentees', title: `Mentees (0)`},
    {key: 'mentors', title: `Mentors (0)`},
  ]);

  // Badges are persisted across launches, so they have to be read back before
  // the drawer can draw them. Safe to call repeatedly - it no-ops once done.
  useEffect(() => {
    useAssignmentInboxStore.getState().hydrate();
  }, []);

  // Update tab counts when mentees or mentors change, in the order this user
  // asked for. SceneMap keys scenes by route key, so the order here is purely
  // presentational and nothing else has to know about it.
  useEffect(() => {
    const menteeTab = {key: 'mentees', title: `Mentees (${mentees?.length || 0})`};
    const mentorTab = {key: 'mentors', title: `Mentors (${mentors?.length || 0})`};
    setRoutes(menteesFirst ? [menteeTab, mentorTab] : [mentorTab, menteeTab]);
  }, [mentees, mentors, menteesFirst]);

  // The index is a position, so flipping the order would otherwise switch
  // which list is on screen. Flipping it too keeps the same tab selected and
  // makes the swap look like the tabs sliding past each other.
  const handleSwapTabs = useCallback(() => {
    setIndex(prev => (prev === 0 ? 1 : 0));
    updateSettings({menteesFirst: !menteesFirst});
  }, [menteesFirst, updateSettings]);

  // Sync selected state with active mentee
  useEffect(() => {
    if (activeMentee) {
      setSelectedName(activeMentee.full_name || activeMentee.email);
      setSelectedId(activeMentee.id);
    } else if (activeMentor) {
      setSelectedName(activeMentor.full_name || activeMentor.email);
      setSelectedId(activeMentor.id);
    } else {
      setSelectedName('You');
      setSelectedId('you');
    }
  }, [activeMentee, activeMentor]);

  // The pill has room for a full first name now, so the cut is only there for
  // the unusually long ones. It used to trim at 10, which was shorter than the
  // space actually available.
  const getDisplayName = useCallback(name => {
    if (!name || name === 'You') return 'You';
    const firstName = name.split(' ')[0];
    return firstName.length > 14
      ? `${firstName.substring(0, 14)}…`
      : firstName;
  }, []);

  // Null whenever the list is unfiltered - selectAndClose clears both for
  // "You" - which is exactly when the button should not show a face.
  const activeUser = activeMentee ?? activeMentor ?? null;

  const navigateToHome = () => {
    // Navigate immediately so UI feels responsive
    navigationRef.navigate('MainApp', {
      screen: 'Home', // Target the Home tab in MainApp
      params: {
        screen: 'HomeScreen', // Target the HomeScreen in HomeStack
        params: {
          screen: 'IDT',
        },
      },
    });
  };
  const selectAndClose = useCallback(
    (item, isYou = false, userType = null) => {
      setDrawerVisible(false);
      setActiveMentee(null);
      setActiveMentor(null);

      // Ticks and progress belong to one mentee's assignments; anyone else's
      // list must not inherit them.
      useAssignmentStatusStore.getState().clear();

      if (isYou) {
        setSelectedName('You');
        setSelectedId('you');
        setActiveMentee(null);
        setSelectedCategory(null);
        setActiveCategoryId(null);
        return;
      }

      const displayName = item.full_name || item.email;
      setSelectedName(displayName);
      setSelectedId(item.id);
      const defaultColor = '#007AFF';

      if (userType === 'mentee') {
        // === mentee-specific logic ===
        setActiveMentee(item);

        // Not awaited: the drawer closes immediately and the rows fill in
        // their ticks when the answer arrives.
        loadMenteeAssignmentStatus(userInfo?.id, item.id);

        // Async category creation
        (async () => {
          try {
            const menteeKey = `[MENTEE_CAT_Filter] ${item.full_name} (${item.email}) [MENTEE_CAT_Filter]`;
            const categoryId = await addCategory(menteeKey, defaultColor);
            setSelectedCategory(categoryId);
            setActiveCategoryId(categoryId);
          } catch (error) {
            console.error('Error adding mentee category:', error);
          }
        })();
      } else if (userType === 'mentor') {
        // Opening a mentor is the act of reading what they sent, so the badge
        // goes now rather than waiting for anything to be played.
        useAssignmentInboxStore.getState().clearUnread(item.email);
        // Opening a mentor is a person choosing to look, which is what the
        // blue tick on the mentor's row claims - unlike the background sync
        // that merely built the items.
        markAssignmentsSeen(userInfo?.id, item.id);

        navigateToHome();
        setActiveMentor(item);

        (async () => {
          try {
            const mentorKey = `${item.full_name} (${item.email})`;
            const categoryId = await addCategory(mentorKey, defaultColor);
            setSelectedCategory(categoryId);
            setActiveCategoryId(categoryId);
          } catch (error) {
            console.error('Error adding mentor category:', error);
          }
        })();
      }
    },
    [setActiveMentee, setSelectedCategory, setActiveCategoryId, userInfo?.id],
  );

  const MentorList = useCallback(
    () => (
      <UserList
        users={mentors?.filter(
          p =>
            !searchText ||
            p.full_name?.toLowerCase().includes(searchText.toLowerCase()) ||
            p.email?.toLowerCase().includes(searchText.toLowerCase()),
        )}
        listType="Mentors"
        loading={isLoading}
        onPress={item => selectAndClose(item, false, 'mentor')}
        selectedId={selectedId}
      />
    ),
    [mentors, searchText, selectedId, selectAndClose, isLoading],
  );

  const MenteeList = useCallback(
    () => (
      <UserList
        users={mentees?.filter(
          p =>
            !searchText ||
            p.full_name?.toLowerCase().includes(searchText.toLowerCase()) ||
            p.email?.toLowerCase().includes(searchText.toLowerCase()),
        )}
        listType="Mentees"
        loading={isLoading}
        onPress={item => selectAndClose(item, false, 'mentee')}
        selectedId={selectedId}
      />
    ),
    [mentees, searchText, selectedId, selectAndClose, isLoading],
  );

  const renderScene = SceneMap({
    mentees: MenteeList,
    mentors: MentorList,
  });

  return (
    <>
      <TouchableOpacity
        style={styles.selectionButton}
        onPress={() => {
          setSearchText('');
          setDrawerVisible(true);
        }}>
        {activeUser ? (
          <>
            <View style={styles.buttonIcon}>
              <UserAvatar user={activeUser} size={32} />
            </View>
            <Text style={styles.buttonText} numberOfLines={1}>
              {getDisplayName(selectedName)}
            </Text>
          </>
        ) : (
          <Ionicons
            name="people-outline"
            size={22}
            color="#000"
            style={styles.buttonIcon}
          />
        )}
        <Ionicons name="chevron-down" size={16} color="#000" />
      </TouchableOpacity>

      <Modal
        isVisible={drawerVisible}
        animationIn="slideInLeft"
        animationOut="slideOutLeft"
        onBackdropPress={() => setDrawerVisible(false)}
        backdropOpacity={0.4}
        style={styles.drawerModal}
        animationInTiming={300}
        animationOutTiming={300}>
        <View style={styles.drawerContent}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={[
                  styles.youButton,
                  selectedId === 'you' && styles.selectedItem,
                ]}
                onPress={() => selectAndClose(null, true)}
                accessibilityLabel="Select You"
                accessibilityRole="button">
                {/* Your own face belongs here, where it sits alongside the
                    mentors and mentees as one more thing to pick. It was only
                    a duplicate out on the trigger button, which shows whoever
                    is currently selected next to the account button. */}
                <View style={styles.youIcon}>
                  <UserAvatar user={userInfo} size={28} />
                </View>
                <Text
                  style={[
                    styles.youText,
                    selectedId === 'you' && styles.selectedItemText,
                  ]}>
                  You
                </Text>
              </TouchableOpacity>

              <View style={styles.searchContainer}>
                <Ionicons
                  name="search"
                  size={20}
                  color="#666"
                  style={styles.searchIcon}
                />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search users..."
                  placeholderTextColor="#999"
                  value={searchText}
                  onChangeText={setSearchText}
                  autoCorrect={false}
                  autoCapitalize="none"
                  accessibilityLabel="Search users"
                />
                {searchText ? (
                  <TouchableOpacity onPress={() => setSearchText('')}>
                    <Ionicons name="close-circle" size={20} color="#666" />
                  </TouchableOpacity>
                ) : null}
              </View>

              <TabView
                navigationState={{index, routes}}
                renderScene={renderScene}
                onIndexChange={setIndex}
                initialLayout={{width: Dimensions.get('window').width * 0.8}}
                renderTabBar={props => (
                  <CustomTabBar
                    {...props}
                    setIndex={setIndex}
                    onSwap={handleSwapTabs}
                  />
                )}
                style={styles.tabView}
              />
              {/* <DrawerFooterRow setDrawerVisible={setDrawerVisible} /> */}
            </>
          )}
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  selectionButton: {
    backgroundColor: '#fff',
    // The avatar is 32 in a 44-tall pill, so 6 top and bottom is exactly what
    // is left - any more and the circle has to shrink. Asymmetric across:
    // the avatar carries its own visual padding on the left, only text and the
    // chevron need real space on the right.
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: {width: 0, height: 2},
    shadowRadius: 4,
    elevation: 4,
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
    // 140 left roughly 60px for the label once the avatar, the gap and the
    // chevron had taken their share - about eight characters, so most first
    // names were cut. This is sized so a full first name fits instead.
    maxWidth: 190,
    height: 44,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  buttonIcon: {
    marginRight: 10,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    flexShrink: 1,
    marginRight: 8,
    fontFamily: 'Roboto', // Google-like typography
  },
  drawerModal: {
    margin: 0,
    justifyContent: 'flex-start',
  },
  drawerContent: {
    width: '80%',
    height: '100%',
    backgroundColor: '#fff',
    padding: 10,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  youButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 25,
    // borderTopRightRadius:50,
    // borderBottomRightRadius:50,
    marginBottom: 16,
    backgroundColor: '#f8f8f8',
    width: '60%',
  },
  youIcon: {
    marginRight: 12,
  },
  youText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    fontFamily: 'Roboto',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f3f4',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    height: 44,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    height: '100%',
    fontFamily: 'Roboto',
  },
  selectedItem: {
    backgroundColor: '#1a73e8', // Google Blue
  },
  selectedItemText: {
    color: '#fff',
  },
  swapTabs: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  customTabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f3f4',
    borderRadius: 12,
    marginBottom: 16,
    padding: 4,
  },
  customTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  customTabActive: {
    // backgroundColor: '#fff',
  },
  customTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    fontFamily: 'Roboto',
  },
  customTabTextActive: {
    color: '#1a73e8',
    fontWeight: '600',
  },
  tabIndicator: {
    height: 3,
    backgroundColor: '#1a73e8',
    position: 'absolute',
    bottom: 0,
    left: '10%',
    right: '10%',
    borderRadius: 2,
  },
  tabView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#666',
    fontFamily: 'Roboto',
  },
});

export default React.memo(MentorMenteeDrawer);
