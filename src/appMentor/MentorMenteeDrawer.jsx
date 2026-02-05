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
import {useNavigation} from '@react-navigation/core';
import Modal from 'react-native-modal';
import useMentorMenteeStore from './useMentorMenteeStore';
import UserList from './UserList';
import {useAppState} from '../contexts/AppStateContext';
import {addCategory} from '../categories/catDB';
import {TabView, SceneMap} from 'react-native-tab-view';
import Ionicons from 'react-native-vector-icons/Ionicons';

const CustomTabBar = ({navigationState, setIndex}) => {
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
    </View>
  );
};

const MentorMenteeDrawer = () => {
  const {
    mentors,
    mentees,
    setActiveMentee,
    setActiveMentor,
    activeMentor,
    activeMentee,
    isLoading,
  } = useMentorMenteeStore();
  const {setSelectedCategory} = useAppState();
  const navigation = useNavigation();

  const [drawerVisible, setDrawerVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedName, setSelectedName] = useState('You');
  const [selectedId, setSelectedId] = useState('you');
  const [index, setIndex] = useState(0);
  const [routes, setRoutes] = useState([
    {key: 'mentees', title: `Mentees (0)`},
    {key: 'mentors', title: `Mentors (0)`},
  ]);

  // Update tab counts when mentees or mentors change
  useEffect(() => {
    console.log('MentorMenteeStore Data:', {mentors, mentees}); // Debug log
    setRoutes([
      {key: 'mentees', title: `Mentees (${mentees?.length || 0})`},
      {key: 'mentors', title: `Mentors (${mentors?.length || 0})`},
    ]);
  }, [mentees, mentors]);

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

  const getDisplayName = useCallback(name => {
    if (!name || name === 'You') return 'You';
    const firstName = name.split(' ')[0];
    return firstName.length > 10
      ? `${firstName.substring(0, 10)}...`
      : firstName;
  }, []);

  const navigateToHome = () => {
    // Navigate immediately so UI feels responsive
    navigation.navigate('MainApp', {
      screen: 'Home', // Target the Home tab in MainApp
      params: {
        screen: 'HomeScreen', // Target the HomeScreen in HomeStack
        params: {
          screen: 'YouTube', // Target the YouTube tab in HomeTabs
        },
      },
    });
  };
  const selectAndClose = useCallback(
    (item, isYou = false, userType = null) => {
      setDrawerVisible(false);
      setActiveMentee(null);
      setActiveMentor(null);

      if (isYou) {
        setSelectedName('You');
        setSelectedId('you');
        setActiveMentee(null);
        setSelectedCategory(null);
        return;
      }

      const displayName = item.full_name || item.email;
      setSelectedName(displayName);
      setSelectedId(item.id);
      const defaultColor = '#007AFF';

      if (userType === 'mentee') {
        // === mentee-specific logic ===
        setActiveMentee(item);

        // Async category creation
        (async () => {
          try {
            const menteeKey = `[MENTEE_CAT_Filter] ${item.full_name} (${item.email}) [MENTEE_CAT_Filter]`;
            const categoryId = await addCategory(menteeKey, defaultColor);
            setSelectedCategory(categoryId);
          } catch (error) {
            console.error('Error adding mentee category:', error);
          }
        })();
      } else if (userType === 'mentor') {
        navigateToHome();
        navigateToHome();
        setActiveMentor(item);

        (async () => {
          try {
            const mentorKey = `${item.full_name} (${item.email})`;
            const categoryId = await addCategory(mentorKey, defaultColor);
            console.log('selectedCat', categoryId);
            setSelectedCategory(categoryId);
          } catch (error) {
            console.error('Error adding mentor category:', error);
          }
        })();
      }
    },
    [navigation, setActiveMentee, setSelectedCategory],
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
        onPress={item => selectAndClose(item, false, 'mentor')}
        selectedId={selectedId}
      />
    ),
    [mentors, searchText, selectedId, selectAndClose],
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
        onPress={item => selectAndClose(item, false, 'mentee')}
        selectedId={selectedId}
      />
    ),
    [mentees, searchText, selectedId, selectAndClose],
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
        <Ionicons
          name="people-outline"
          size={20}
          color="#000"
          style={styles.buttonIcon}
        />
        <Text style={styles.buttonText} numberOfLines={1}>
          {getDisplayName(selectedName)}
        </Text>
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
                <Ionicons
                  name="person-circle-outline"
                  size={24}
                  color={selectedId === 'you' ? '#fff' : '#333'}
                  style={styles.youIcon}
                />
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
                  <CustomTabBar {...props} setIndex={setIndex} />
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
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: {width: 0, height: 2},
    shadowRadius: 4,
    elevation: 4,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 120,
    maxWidth: 160,
    height: 44,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  buttonIcon: {
    marginRight: 8,
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
  customTabBar: {
    flexDirection: 'row',
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
