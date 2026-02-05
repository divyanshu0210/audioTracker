// LinkHandler.jsx

import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { handleLinkSubmit } from './utils/handleLinkSubmit';
import { useNavigation } from '@react-navigation/native';
import { useAppState } from '../contexts/AppStateContext';

const useLinkHandler = () => {
  const { setDriveLinksList, setItems,setDeviceFiles, userInfo } = useAppState();
  const navigation = useNavigation();
  const hasHandledInitialUrl = useRef(false); // <--- Add this
  const pendingUrlRef = useRef(null);

  useEffect(() => {
    const checkInitialURL = async () => {
      const url = await Linking.getInitialURL();
      if (url) {
        if (userInfo && !hasHandledInitialUrl.current) {
          console.log('Initial URL got user:', url);
          // hasHandledInitialUrl.current = true;
          handleLinkSubmit(url, { setDriveLinksList, setItems,setDeviceFiles,navigation });
        } else {
          console.log('Initial URL waiting for user:', url);
          pendingUrlRef.current = url;
        }
      }
    };

    const handleURL = ({ url }) => {
      console.log('URL opened while running:', url,userInfo);
      if (userInfo && !hasHandledInitialUrl.current) {
        // hasHandledInitialUrl.current = true;
        handleLinkSubmit(url, { setDriveLinksList, setItems, setDeviceFiles,navigation });
      } else {
        pendingUrlRef.current = url;
      }
    };

    checkInitialURL();
    const subscription = Linking.addListener('url', handleURL);

    return () => subscription.remove();
  }, [userInfo, setDriveLinksList, setItems,setDeviceFiles, navigation]);

  // useEffect(() => {
  //   if (userInfo && pendingUrlRef.current && !hasHandledInitialUrl.current) {
  //     console.log('User info now available, handling pending URL:',userInfo, pendingUrlRef.current);
  //     // hasHandledInitialUrl.current = true;
  //     handleLinkSubmit(pendingUrlRef.current, { setDriveLinksList, setItems,setDeviceFiles, navigation });
  //     pendingUrlRef.current = null;
  //   }
  // }, [userInfo, setDriveLinksList, setItems, navigation]);
};

export default useLinkHandler;
