import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import ShareMenu from 'react-native-share-menu';
import { handleLinkSubmit } from './utils/handleLinkSubmit'; // The logic for handling the shared content
import { useAppState } from '../contexts/AppStateContext'; // Access app state, e.g., userInfo
import { useMediaStore } from '../stores/useMediaStore';
import { useShallow } from 'zustand/react/shallow';
import {
  handleIncomingNoteFile,
  resolvesToNoteFile,
} from '../notes/share/handleIncomingNoteFile';

const useSharedContentHandler = () => {
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
  const pendingSharedDataRef = useRef(null); // To store pending shared data
  const hasHandledInitialUrl = useRef(false); // <--- Add this
  useEffect(() => {
    // Function to handle shared content
    const handleShare = async (item) => {
      // Logged either way: a share arriving from audioTracker itself comes
      // through onNewIntent rather than a cold start, and "did the event even
      // fire" is the first thing worth knowing when nothing happens after a
      // share to self.
      console.log('Shared content received:', item);
      if (!item) return;
      const { data, mimeType } = item;

      // Note bundles are handled here rather than by handleLinkSubmit, and
      // without waiting for userInfo — importing into the local DB needs no
      // account, and holding it back would silently drop the file when the
      // share arrives on a cold start.
      //
      // Shared from Downloads or a chat app, the type is octet-stream and the
      // URI is opaque, so this falls back to the file's display name.
      if (await resolvesToNoteFile(data, mimeType)) {
        handleIncomingNoteFile(data);
        return;
      }

      if (userInfo && !hasHandledInitialUrl.current) {
        console.log('Shared data received for user:', data, mimeType);
        // hasHandledInitialUrl.current = true;
        handleLinkSubmit(data, { setDriveLinksList, setItems, setDeviceFiles });
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
  }, [userInfo, setDriveLinksList, setItems, setDeviceFiles]);

  // This effect runs when the user info becomes available
  useEffect(() => {
    if (userInfo && pendingSharedDataRef.current && !hasHandledInitialUrl.current) {
      console.log('User info is available, processing pending shared content:', userInfo, pendingSharedDataRef.current);
      // hasHandledInitialUrl.current = true;
      handleLinkSubmit(pendingSharedDataRef.current.data, { setDriveLinksList, setItems, setDeviceFiles });
      pendingSharedDataRef.current = null; // Clear pending shared data after processing
    }
  }, [userInfo, setDriveLinksList, setItems, setDeviceFiles]);
};

export default useSharedContentHandler;
