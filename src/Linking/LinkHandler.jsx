// LinkHandler.jsx

import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { handleLinkSubmit } from './utils/handleLinkSubmit';
import { useAppState } from '../contexts/AppStateContext';
import { useMediaStore } from '../stores/useMediaStore';
import { useShallow } from 'zustand/react/shallow';

const useLinkHandler = () => {
 const {
  setDriveLinksList,
  setItems,
  setDeviceFiles,
} = useMediaStore(
  useShallow(state => ({
    setDriveLinksList: state.setDriveLinksList,
    setItems: state.setItems,
    setDeviceFiles: state.setDeviceFiles,
  })),
);

const {userInfo} = useAppState();
  const hasHandledInitialUrl = useRef(false); // <--- Add this
  const pendingUrlRef = useRef(null);

  useEffect(() => {
    const checkInitialURL = async () => {
      const url = await Linking.getInitialURL();
      if (!url || url.startsWith('audiotracker://')) return;
      if (userInfo && !hasHandledInitialUrl.current) {
        console.log('Initial URL got user:', url);
        handleLinkSubmit(url, { setDriveLinksList, setItems, setDeviceFiles });
      } else {
        console.log('Initial URL waiting for user:', url);
        pendingUrlRef.current = url;
      }
    };

    const handleURL = ({ url }) => {
      if (url.startsWith('audiotracker://')) return;
      console.log('URL opened while running:', url, userInfo);
      if (userInfo && !hasHandledInitialUrl.current) {
        handleLinkSubmit(url, { setDriveLinksList, setItems, setDeviceFiles });
      } else {
        pendingUrlRef.current = url;
      }
    };

    checkInitialURL();
    const subscription = Linking.addListener('url', handleURL);

    return () => subscription.remove();
  }, [userInfo, setDriveLinksList, setItems,setDeviceFiles]);

  // useEffect(() => {
  //   if (userInfo && pendingUrlRef.current && !hasHandledInitialUrl.current) {
  //     console.log('User info now available, handling pending URL:',userInfo, pendingUrlRef.current);
  //     // hasHandledInitialUrl.current = true;
  //     handleLinkSubmit(pendingUrlRef.current, { setDriveLinksList, setItems,setDeviceFiles });
  //     pendingUrlRef.current = null;
  //   }
  // }, [userInfo, setDriveLinksList, setItems]);
};

export default useLinkHandler;
