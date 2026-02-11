import React, {
  useState,
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  AppState,
  NativeModules,
} from 'react-native';
import {WebView} from 'react-native-webview';
import RNFS from 'react-native-fs';
import {updateDurationIfNotSet} from '../../database/U.js';
import {
  getFullDOMHTML,
  startTrackingTime,
} from '../progressTrackingUtils.js';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
// const {PipModule} = NativeModules;

const YouTubePlayerComponent = forwardRef(
  (
    {
      item,
      onBack,
      notesSectionRef,
      onCurrentTimeChange,
      onIsPausedChange,
      onPlayBackRateChange,
      pauseOnStart,
      startTime,
      onEnd,
    },
    ref,
  ) => {
    const [isLoading, setIsLoading] = useState(true);
    const [isInPipMode, setIsInPipMode] = useState(false);

    const webViewRef = useRef(null);
    const durationRef = useRef(0);
    const currentTimeRef = useRef(0);
    // Expose captureScreenshot through the forwarded ref
    useImperativeHandle(ref, () => ({
      captureScreenshot,
      webViewRef,
      togglePlayPause,
      getDuration: () => durationRef.current,
      getCurrentTime: () => currentTimeRef.current,
    }));

    useEffect(() => {
      console.log(startTime);
    }, [startTime]);


    const captureScreenshot = async () => {
      if (webViewRef.current && !isLoading) {
        webViewRef.current.injectJavaScript(`
          (function() {
            const video = document.querySelector('video');
            if (!video) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ error: "No video found!" }));
              return;
            }

             const currentTime = video.currentTime;
  
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = canvas.toDataURL('image/jpeg');
            window.ReactNativeWebView.postMessage(JSON.stringify({ screenshot: imageData , timeStamp: currentTime }));
          })();
        `);
      }
    };

    const togglePlayPause = () => {
      console.log('youtube trying to toggle');
      if (webViewRef?.current) {
        webViewRef.current.injectJavaScript(`
              (function() {
                  const video = document.querySelector('video');
                  if (video) {
                      if (video.paused) {
                          video.play().catch(e => {
                              window.ReactNativeWebView.postMessage(JSON.stringify({
                                  status: "PLAY_FAILED",
                                  error: e.message
                              }));
                          });
                      } else {
                          video.pause();
                      }
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                          status: "TOGGLE_SUCCESS",
                          isPlaying: !video.paused
                      }));
                  } else {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                          status: "TOGGLE_FAILED",
                          error: "No video element found"
                      }));
                  }
              })();
          `);
      }
    };

    const pausePlayerOnStart =()=>{
      if (webViewRef?.current) {
        webViewRef.current.injectJavaScript(`
          (function() {
            function pauseWhenReady() {
              const video = document.querySelector('video');
              if (video) {
                // If video is already ready, pause it immediately
                if (video.readyState >= 2) {
                  video.pause();
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    status: "PAUSE_SUCCESS",
                    reason: "Video already ready"
                  }));
                } else {
                  // Otherwise, listen for the 'canplay' event
                  video.addEventListener('canplay', function handler() {
                    video.pause();
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      status: "PAUSE_SUCCESS",
                      reason: "Paused on canplay"
                    }));
                    video.removeEventListener('canplay', handler); // Clean up
                  });
                }
              } else {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  status: "PAUSE_FAILED",
                  error: "No video element found"
                }));
              }
            }
      
            // Delay briefly to allow DOM to stabilize
            setTimeout(pauseWhenReady, 4998);
          })();
        `);
      }
      
    }

    const handleWebViewMessage = async event => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (
          data?.screenshot &&
          notesSectionRef?.current?.handleImagePickerResult
        ) {
          await notesSectionRef.current.handleImagePickerResult({
            data: data.screenshot.split(',')[1], // extract base64 data
            mime: 'image/jpeg',
            timestamp: data.timeStamp,
          });
        } else if (data.time !== undefined) {
          notesSectionRef?.current?.addTimestamp?.(data.time);
        } else if (data.currentTime !== undefined) {
          onPlayBackRateChange(data.playbackSpeed);
          onCurrentTimeChange(data.currentTime);
          currentTimeRef.current = data.currentTime;
        } else if (data.state != undefined) {
          onIsPausedChange(data.state !== 'PLAYING');
        } else if (data.duration !== undefined) {
          console.log('video duration on event',data.event, item?.source_id, data.duration);
          durationRef.current = data.duration;
          updateDurationIfNotSet({
            sourceType: 'youtube_video',
            id: item?.source_id,
            duration: data.duration,
          });
        } else if (data.status !== undefined) {
          switch (data.status) {
            case 'SEEK_SUCCESS':
              console.log(`Successfully seeked to ${data.seekedTo} seconds`);
              onCurrentTimeChange(data.seekedTo);
              break;
            case 'SEEK_FAILED':
              console.error('Seek failed:', data.error);
              if (data.min !== undefined && data.max !== undefined) {
                console.log(`Valid range: 0 to ${data.max} seconds`);
              }
              break;
            default:
              console.log('Unknown seek status:', data.status);
          }
        } else if (data.fullscreen !== undefined) {
          // Handle fullscreen state change
          console.log(
            'Fullscreen state:',
            data.fullscreen ? 'Entered' : 'Exited',
          );
          // Optionally, you can trigger any updates in React Native here
        } else if (data.error !== undefined) {
          // Handle fullscreen state change
          console.log('Fullscreen error:', data.error);
          // Optionally, you can trigger any updates in React Native here
        } else if (data.type !== undefined) {
          // Handle fullscreen state change
          // console.log('html:', data.html );
          // Optionally, you can trigger any updates in React Native here
        } else if (data.ended === 'ENDED') {
          // Add this case for ended event
          if (onEnd) {
            onEnd(); // Notify parent that playback ended
          }
        }
      } catch (error) {
        console.error('Screenshot capture failed:', error);
      }
    };

    return (
      <View style={styles.container}>
        {!isInPipMode && (
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <MaterialIcons name={'arrow-back'} size={24} color="white" />
          </TouchableOpacity>
        )}

        {isLoading && (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color="#ffffff" />
          </View>
        )}
        <WebView
          ref={webViewRef}
          source={{
            uri: `https://www.youtube.com/embed/${item?.source_id || ''}?autoplay=1${pauseOnStart ? '&mute=1' : ''}${startTime ? `&start=${startTime}` : ''}`,
            headers: {Referer: `https://com.youtube`},
          }}
          style={styles.webview}
          javaScriptEnabled
          allowsFullscreenVideo
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false} 
          allowsPictureInPictureMediaPlayback
          domStorageEnabled
          originWhitelist={['*']}
          onMessage={handleWebViewMessage}
          onLoadEnd={() => {
            setIsLoading(false);
            startTrackingTime(webViewRef);
            getFullDOMHTML(webViewRef);
            console.log('pauseOnStart',pauseOnStart)
           pauseOnStart&& pausePlayerOnStart()
            
          }}
        />
      </View>
    );
  },
);

export default YouTubePlayerComponent;
 
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  loaderContainer: {
    margin: 5,
    height:'100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webview: {
    width: '100%',
    backgroundColor: 'black',
  },
  backButton: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 100,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    // padding:10
  },
});
