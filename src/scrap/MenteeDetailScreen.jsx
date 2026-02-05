import React, {useEffect} from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import ReportScreen from '../report/ReportScreen';
import HomeTabs from '../TabScreens/HomeTabs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import useMentorMenteeStore from '../appMentor/useMentorMenteeStore';
import {useNavigation} from '@react-navigation/native';
import { useAppState } from '../contexts/AppStateContext';

const Tab = createBottomTabNavigator();

export default function MenteeDetailScreen() {
  const {activeMentee, setActiveMentee} = useMentorMenteeStore();
  const {setSelectedCategory} = useAppState()
  const navigation = useNavigation();

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', e => {
      setActiveMentee(null);
      setSelectedCategory(null)
    });

    return unsubscribe;
  }, [navigation]);

  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        tabBarLabelStyle: {fontSize: 12, fontWeight: '600'},
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: 'gray',
        tabBarIcon: ({color, size}) => {
          let iconName;

          if (route.name === 'Videos Assigned') {
            iconName = 'videocam-outline';
          } else if (route.name === 'Report') {
            iconName = 'document-text-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}>
      <Tab.Screen name="Report" component={ReportScreen} />
      <Tab.Screen name="Videos Assigned" component={HomeTabs} />
    </Tab.Navigator>
  );
}
