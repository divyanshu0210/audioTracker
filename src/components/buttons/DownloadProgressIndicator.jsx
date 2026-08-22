// DownloadProgressIndicator.jsx
//
// Circular progress + tap-to-cancel (×), shown in place of a row's normal
// action (download button, menu, ...) while a file is queued/downloading.
// Shared by Drive's DownloadButton and the ISKCON row so both sources show
// the same in-progress UI.

import React from 'react';
import {ActivityIndicator, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import CircularProgress from 'react-native-circular-progress-indicator';

export const DownloadProgressIndicator = ({progress, onCancel, size = 30}) => {
  // Rounded to the nearest 5% so CircularProgress (which re-animates on
  // every `value` change) doesn't get a new value on every single 1% tick.
  const displayProgress =
    progress == null ? progress : Math.round(progress / 5) * 5;

  return (
    <TouchableOpacity
      onPress={onCancel}
      style={{width: size, height: size, alignItems: 'center', justifyContent: 'center'}}>
      {displayProgress === null || displayProgress === 0 ? (
        <ActivityIndicator size="small" />
      ) : (
        <View style={{width: size, height: size, justifyContent: 'center', alignItems: 'center'}}>
          <CircularProgress
            value={displayProgress}
            radius={size / 2}
            duration={100}
            progressValueColor="transparent"
            activeStrokeColor="#2196F3"
            inActiveStrokeColor="#e0e0e0"
            inActiveStrokeWidth={4}
            activeStrokeWidth={4}
            maxValue={100}
          />
          <Ionicons name="close" size={22} color="#000" style={{position: 'absolute'}} />
        </View>
      )}
    </TouchableOpacity>
  );
};

export default DownloadProgressIndicator;
