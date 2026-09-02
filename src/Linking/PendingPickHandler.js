// PendingPickHandler.js
//
// The other half of MediaPickerModule's stash. When Android kills audioTracker
// while the system file picker is in front, the picker's result arrives at a
// process that has no JS in it, and the selection would simply be gone — the
// user comes back to the app and nothing has happened, with nothing to show
// for it. The module keeps those files instead; this drains them.
//
// Drained on mount (the killed-and-relaunched case, where the stash was written
// before JS was even loaded) and on the module's event (the rarer case where
// React was already back up when the result landed).

import {useEffect} from 'react';
import {DeviceEventEmitter} from 'react-native';

import {useMediaStore} from '../stores/useMediaStore';
import {importPendingPickedFiles} from './utils/handleLinkSubmit';

const usePendingPickHandler = () => {
  const setDeviceFiles = useMediaStore(state => state.setDeviceFiles);

  useEffect(() => {
    importPendingPickedFiles(setDeviceFiles);

    const subscription = DeviceEventEmitter.addListener(
      'mediaPickerPendingFiles',
      () => importPendingPickedFiles(setDeviceFiles),
    );
    return () => subscription.remove();
  }, [setDeviceFiles]);
};

export default usePendingPickHandler;
