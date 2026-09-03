// LinkHandler.jsx

import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { handleLinkSubmit, LinkOrigin } from './utils/handleLinkSubmit';
import { useAppState } from '../contexts/AppStateContext';
import { useMediaStore } from '../stores/useMediaStore';
import { useShallow } from 'zustand/react/shallow';
import { navigationRef } from '../handlers/navigationRef';
import { markExternalLaunch, setPendingRoute } from '../handlers/navigationIntent';
import {
  handleIncomingNoteFile,
  resolvesToNoteFile,
} from '../notes/share/handleIncomingNoteFile';

// The download foreground-service notification opens this URL.
const DOWNLOADS_URL = 'audiotracker://downloads';

// Cold start: the login → MainApp redirect hasn't happened yet, so record the
// intent and let navigateToMain land with DownloadsView already on top (no
// flash of Home first). Warm start (app already past login): just navigate.
const routeToDownloads = ({cold}) => {
  const current = navigationRef.isReady()
    ? navigationRef.getCurrentRoute()?.name
    : null;

  if (cold && (!current || current === 'GoogleLoginScreen')) {
    setPendingRoute('DownloadsView');
    return;
  }
  if (current !== 'DownloadsView') {
    navigationRef.navigate('DownloadsView');
  }
};

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
      if (url === DOWNLOADS_URL) return routeToDownloads({cold: true});
      if (!url || url.startsWith('audiotracker://')) return;
      // Said before any of the async work below, so that whatever is deciding
      // what to put on screen first already knows this launch has a target.
      markExternalLaunch();
      // A .atnote bundle is ours to import, not a media link — intercept
      // before handleLinkSubmit tries to make a library item out of it.
      // Awaited: a bundle opened from Downloads is only identifiable by its
      // display name, which takes a trip through the content resolver.
      if (await resolvesToNoteFile(url)) return handleIncomingNoteFile(url);
      if (userInfo && !hasHandledInitialUrl.current) {
        console.log('Initial URL got user:', url);
        handleLinkSubmit(url, {
          setDriveLinksList,
          setItems,
          setDeviceFiles,
          origin: LinkOrigin.EXTERNAL,
        });
      } else {
        console.log('Initial URL waiting for user:', url);
        pendingUrlRef.current = url;
      }
    };

    const handleURL = async ({ url }) => {
      if (url === DOWNLOADS_URL) return routeToDownloads({cold: false});
      if (url.startsWith('audiotracker://')) return;
      if (await resolvesToNoteFile(url)) return handleIncomingNoteFile(url);
      console.log('URL opened while running:', url, userInfo);
      if (userInfo && !hasHandledInitialUrl.current) {
        handleLinkSubmit(url, {
          setDriveLinksList,
          setItems,
          setDeviceFiles,
          origin: LinkOrigin.EXTERNAL,
        });
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
