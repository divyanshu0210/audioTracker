import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import ShareMenu from 'react-native-share-menu';
import { handleLinkSubmit } from './utils/handleLinkSubmit'; // The logic for handling the shared content
import { useAppState } from '../contexts/AppStateContext'; // Access app state, e.g., userInfo
import { useNavigation } from '@react-navigation/native';

const useSharedContentHandler = () => {
  const { setDriveLinksList, setItems, setDeviceFiles, userInfo } = useAppState();
  const navigation = useNavigation();
  
  const pendingSharedDataRef = useRef(null); // To store pending shared data
  const hasHandledInitialUrl = useRef(false); // <--- Add this
  useEffect(() => {
    // Function to handle shared content
    const handleShare = (item) => {
      if (!item) return;
console.log(item)
      const { data, mimeType } = item;

      if (userInfo && !hasHandledInitialUrl.current) {
        console.log('Shared data received for user:', data, mimeType);
        // hasHandledInitialUrl.current = true;
        handleLinkSubmit(data, { setDriveLinksList, setItems, setDeviceFiles, navigation });
      } else {
        console.log('Waiting for user info, storing shared data:', data, mimeType);
        pendingSharedDataRef.current = item; // Store shared content until user is available
      }
    };

    // Get initial shared data (if any) when the app is first opened with shared content
    ShareMenu.getInitialShare(handleShare);

    // Listen for new shared content while the app is running
    const shareListener = ShareMenu.addNewShareListener(handleShare);

    // Cleanup the listener when the component unmounts
    return () => {
      shareListener?.remove();
    };
  }, [userInfo, setDriveLinksList, setItems, setDeviceFiles, navigation]);

  // This effect runs when the user info becomes available
  useEffect(() => {
    if (userInfo && pendingSharedDataRef.current && !hasHandledInitialUrl.current) {
      console.log('User info is available, processing pending shared content:', userInfo, pendingSharedDataRef.current);
      // hasHandledInitialUrl.current = true;
      handleLinkSubmit(pendingSharedDataRef.current.data, { setDriveLinksList, setItems, setDeviceFiles, navigation });
      pendingSharedDataRef.current = null; // Clear pending shared data after processing
    }
  }, [userInfo, setDriveLinksList, setItems, setDeviceFiles, navigation]);
};

export default useSharedContentHandler;
