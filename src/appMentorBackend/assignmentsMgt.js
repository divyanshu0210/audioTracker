import {getYouTubeIdType} from '../contexts/utils';
import {fetchYTData, handleDriveLink} from '../Linking/utils/handleLinkSubmit';
import useMentorMenteeStore from '../appMentor/useMentorMenteeStore';
import {ToastAndroid} from 'react-native';
import useDbStore from '../database/dbStore';
import {BASE_URL} from './userMgt';
import {addCategory} from '../categories/catDB';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useNotificationStore from '../appNotification/useNotificationStore';

const {setNewAssignmentsFlag} = useNotificationStore.getState();

export const fetchAssignmentsForMentee = async (
  setDriveLinksList,
  setItems,
  setCategories,
  setSelectedCategory,
  userInfo,
) => {
  const {setInserting} = useDbStore.getState();
  try {
    setNewAssignmentsFlag(false);

    const response = await fetch(
      `${BASE_URL}/assign/assignments-for-mentee/?mentee_id=${userInfo?.id}`,
    );
    const data = await response.json();
    console.log(data);
    if (response.ok) {
      // loader bar ON
      setInserting(true);
      const assignmentsByMentor = data?.assignments_by_mentor || {};

      for (const mentorKey of Object.keys(assignmentsByMentor)) {
        try {
          const defaultColor = '#007AFF';
          const categoryId = await addCategory(mentorKey, defaultColor);
          // setCategories(prev => {
          //   const exists = prev.some(category => category.id === categoryId);
          //   if (exists) return prev;
          //   return [{id: categoryId, name: mentorKey}, ...prev];
          // });
          // setSelectedCategory(categoryId);

          console.log(
            `✅ Category created for ${mentorKey}, ID: ${categoryId}`,
          );

          // Process all videos for this mentor
          const videos = assignmentsByMentor[mentorKey];
          for (const video of videos) {
            const extracted = {
              id: video.video_id,
              type: video.video_type,
            };

            if (extracted.type === 'youtube') {
              extracted.type = getYouTubeIdType(extracted.id);
              await fetchYTData(extracted, setItems, null, categoryId);
            } else if (extracted.type === 'drive') {
              await handleDriveLink(
                extracted.id,
                setDriveLinksList,
                null,
                categoryId,
              );
            }
          }
          //Create toast here . ..
          videos.length > 0 &&
            ToastAndroid.show(`${videos.length} New Assignments Added`, ToastAndroid.SHORT);
        } catch (error) {
          console.warn(
            `❌ Error processing category for ${mentorKey}:`,
            error.message,
          );
        }
      }

      console.log('✅ All assignments fetched and categorized');
    } else {
      console.log(
        '❌ Error fetching assignments:',
        data?.error || 'Unknown error occurred.',
      );
    }
  } catch (error) {
    console.error(
      '❌ Fetch error:',
      error.message || 'Failed to fetch assignments.',
    );
  } finally {
    //loader off
    setInserting(false);
  }
};

// to display the assignment btn on app start
export const isAssignmentPending =async ()=>{
  const count = await  pendingAssignmentCount();
   setNewAssignmentsFlag(count>0);

}

export const pendingAssignmentCount =async ()=>{

  const userId = await AsyncStorage.getItem('userId');

    const response = await fetch(
      `${BASE_URL}/assign/assignments-count-for-mentee/?mentee_id=${userId}`,
    );
    const data = await response.json();
    // console.log(data);
    if (response.ok) {
      return data.pending_assignments_count
    }
    return 0;

}
