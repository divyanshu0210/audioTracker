import { WebView } from 'react-native-webview';
import { useRef, useState } from 'react';
import { View, Button, Text, StyleSheet } from 'react-native';

export const GoogleDrivePlayer = ({ fileId }) => {
  const webViewRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  const injectedJavaScript = `
  (function() {
    let lastSentTime = 0;  // Variable to track the last sent time

    // Function to hide UI elements
    const hideElements = () => {
      // Hide Google Drive's UI elements
      const elementsToHide = [
        '#one-google-bar',
        '.ndfHFb-c4YZDc-Wrql6b',
        '.ndfHFb-c4YZDc-MZArnb-b0t70b',
        '.ndfHFb-c4YZDc-JNEHMb',
        '.ndfHFb-c4YZDc-dZssN-FVVVue-ORHb-haAclf',
        '.ndfHFb-c4YZDc-SjW3R-ORHb-haAclf',
        '.ndfHFb-c4YZDc-L7w45e-ORHb',
        '.ndfHFb-c4YZDc-oKM7Re-L7w45e-ORHb',
        '.ndfHFb-c4YZDc-Wrql6b-jfdpUb',
        '.ndfHFb-c4YZDc-Wrql6b-Bz112c',
        '.ndfHFb-c4YZDc-aTv5jf-bVEB4e',
        '.ndfHFb-c4YZDc-aTv5jf-NziyQe-LgbsSe',
        'svg',
        '.ndfHFb-c4YZDc-kODWGd-JUCs7e'
      ];
      
      elementsToHide.forEach(selector => {
        const el = document.querySelector(selector);
        if (el) el.style.display = 'none';
      });

      // Adjust player container styles
      const playerContainer = document.querySelector('.ndfHFb-c4YZDc-aTv5jf') || 
                             document.querySelector('.ndfHFb-c4YZDc-kODWGd');
      if (playerContainer) {
        playerContainer.style.width = '100%';
        playerContainer.style.height = '100%';
        playerContainer.style.margin = '0';
        playerContainer.style.padding = '0';
        playerContainer.style.left = '0';
        playerContainer.style.top = '0';
      }

      // Adjust main container
      const mainContainer = document.querySelector('.ndfHFb-c4YZDc-K9a4Re-nKQ6qf');
      if (mainContainer) {
        mainContainer.style.padding = '0';
        mainContainer.style.margin = '0';
        mainContainer.style.height = '100%';
      }
    };

    // Function to setup media listeners
    const setupMediaListeners = () => {
      const mediaElement = document.querySelector('video') || document.querySelector('audio');
      
      if (!mediaElement) {
        console.log('Media element not found yet, retrying...');
        setTimeout(setupMediaListeners, 500);
        return;
      }

      // Clear existing listeners to avoid duplicates
      mediaElement.removeEventListener('timeupdate', sendTimeUpdate);
      mediaElement.removeEventListener('play', sendPlayState);
      mediaElement.removeEventListener('pause', sendPlayState);
      if (window.timeTrackingInterval) clearInterval(window.timeTrackingInterval); // Prevent multiple intervals

      // Define listener functions
      function sendTimeUpdate() {
        // Only send the time update if it's 1 second ahead of the last sent time
        if (mediaElement.currentTime - lastSentTime >= 1) {
          lastSentTime = mediaElement.currentTime;
          window.ReactNativeWebView.postMessage(
            JSON.stringify({
              type: 'timeupdate',
              currentTime: mediaElement.currentTime,
              duration: mediaElement.duration,
              isPlaying: !mediaElement.paused,
              playbackRate: mediaElement.playbackRate
            })
          );
        }
      }

      function sendPlayState() {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: 'playstate',
            isPlaying: !mediaElement.paused
          })
        );
      }

      // Add new listeners
      mediaElement.addEventListener('timeupdate', sendTimeUpdate);
      mediaElement.addEventListener('play', sendPlayState);
      mediaElement.addEventListener('pause', sendPlayState);

      // Send initial state
      sendTimeUpdate();
      console.log('Media listeners setup complete');

      // Start sending time updates every 1 second
      window.timeTrackingInterval = setInterval(sendTimeUpdate, 1000);
    };

    // Initial setup
    hideElements();
    setupMediaListeners();

    // Observe DOM changes
    const observer = new MutationObserver((mutations) => {
      hideElements();
      setupMediaListeners();
    });
    
    observer.observe(document.body, { 
      childList: true, 
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'class', 'style']
    });

    // Control functions
    window.seekTo = (seconds) => {
      const mediaElement = document.querySelector('video') || document.querySelector('audio');
      if (mediaElement) {
        mediaElement.currentTime = seconds;
        return true;
      }
      return false;
    };

    window.seekForward = (seconds) => {
      const mediaElement = document.querySelector('video') || document.querySelector('audio');
      if (mediaElement) {
        mediaElement.currentTime = Math.min(mediaElement.currentTime + seconds, mediaElement.duration);
        return true;
      }
      return false;
    };

    window.seekBackward = (seconds) => {
      const mediaElement = document.querySelector('video') || document.querySelector('audio');
      if (mediaElement) {
        mediaElement.currentTime = Math.max(mediaElement.currentTime - seconds, 0);
        return true;
      }
      return false;
    };

    window.setPlaybackSpeed = (speed) => {
      const mediaElement = document.querySelector('video') || document.querySelector('audio');
      if (mediaElement) {
        mediaElement.playbackRate = speed;
        return true;
      }
      return false;
    };

    window.togglePlayback = () => {
      const mediaElement = document.querySelector('video') || document.querySelector('audio');
      if (mediaElement) {
        if (mediaElement.paused) {
          mediaElement.play();
        } else {
          mediaElement.pause();
        }
        return true;
      }
      return false;
    };
  })();
`;


  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === 'timeupdate') {
        console.log('WebView message:', data);
        setCurrentTime(data.currentTime);
        setDuration(data.duration);
        setIsPlaying(data.isPlaying);
        if (data.playbackRate) {
          setPlaybackRate(data.playbackRate);
        }
      } else if (data.type === 'playstate') {
        setIsPlaying(data.isPlaying);
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  };

  // Control functions
  const seekTo = (seconds) => {
    webViewRef.current?.injectJavaScript(`window.seekTo(${seconds}); true;`);
  };

  const seekForward = () => {
    webViewRef.current?.injectJavaScript(`window.seekForward(10); true;`);
  };

  const seekBackward = () => {
    webViewRef.current?.injectJavaScript(`window.seekBackward(10); true;`);
  };

  const togglePlayback = () => {
    webViewRef.current?.injectJavaScript(`window.togglePlayback(); true;`);
  };

  const setSpeed = (speed) => {
    setPlaybackRate(speed);
    webViewRef.current?.injectJavaScript(`window.setPlaybackSpeed(${speed}); true;`);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: `https://drive.google.com/file/d/${fileId}/view?usp=sharing` }}
        style={styles.webview}
        injectedJavaScript={injectedJavaScript}
        injectedJavaScriptBeforeContentLoaded={injectedJavaScript}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        mixedContentMode="compatibility"
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo={true}
        startInLoadingState={true}
        originWhitelist={['*']}
      />

      <View style={styles.controls}>
        <Text style={styles.timeText}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </Text>

        <View style={styles.buttonRow}>
          <Button
            title="« 10s"
            onPress={seekBackward}
            disabled={currentTime <= 0}
          />
          <Button
            title={isPlaying ? 'Pause' : 'Play'}
            onPress={togglePlayback}
          />
          <Button
            title="10s »"
            onPress={seekForward}
            disabled={currentTime >= duration}
          />
        </View>

        <View style={styles.buttonRow}>
          {[0.5, 1.0, 1.5, 2.0].map(speed => (
            <Button
              key={speed}
              title={`${speed}x`}
              onPress={() => setSpeed(speed)}
              disabled={playbackRate === speed}
            />
          ))}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  controls: {
    position:'absolute',
    top:150,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  timeText: {
    textAlign: 'center',
    marginBottom: 10,
    fontWeight: 'bold',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 5,  
  },
});