export const startTrackingTime = webViewRef => {
  if (webViewRef.current) {
    webViewRef.current.injectJavaScript(`
        (function() {
          if (window.timeTrackingInterval) return; // Prevent multiple intervals
          
          function trackAndSend() {
            const video = document.querySelector('video');
            if (!video) return;
            
            if (!video.paused || video.lastSentTime !== video.currentTime) { 
              // Send time if playing or if currentTime has changed (seeking)
              window.ReactNativeWebView.postMessage(JSON.stringify({ 
                currentTime: video.currentTime, 
                playbackSpeed: video.playbackRate 
              }));
              video.lastSentTime = video.currentTime;
            }
            
            // Set dynamic interval based on playback speed
            const interval = Math.max(500, 1000 / video.playbackRate); // Minimum 100ms
            window.timeTrackingInterval = setTimeout(trackAndSend, interval);
          }
  
          const video = document.querySelector('video');
          if (video) {
            video.addEventListener('play', () => {
              window.ReactNativeWebView.postMessage(JSON.stringify({ state: "PLAYING" }));
            });
  
            video.addEventListener('pause', () => {
              window.ReactNativeWebView.postMessage(JSON.stringify({ state: "PAUSED" }));
            });

             video.addEventListener('ended', () => {
            window.ReactNativeWebView.postMessage(JSON.stringify({ ended: "ENDED" }));
            });
  
            video.addEventListener('loadedmetadata', () => {
              window.ReactNativeWebView.postMessage(JSON.stringify({ 
                duration: video.duration ,
                event:'loadedmetadata'
              }));
            });

            video.addEventListener('canplay', () => {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                duration: video.duration,
                event: 'canplay'
              }));
            });

           
          }
  
          // Detect fullscreen changes
          document.addEventListener('fullscreenchange', () => {
            const isFullscreen = document.fullscreenElement !== null;
            window.ReactNativeWebView.postMessage(JSON.stringify({ fullscreen: isFullscreen }));
          });   
       document.addEventListener('fullscreenerror', () => {
  // Handle fullscreen error
  window.ReactNativeWebView.postMessage(JSON.stringify({
    error: "Failed to enter fullscreen mode"
  }));
});

  
          // For Webkit-based browsers (e.g., Safari)
          document.addEventListener('webkitfullscreenchange', () => {
            const isFullscreen = document.webkitFullscreenElement !== null;
            window.ReactNativeWebView.postMessage(JSON.stringify({ fullscreen: isFullscreen }));
          });
  
          // Start the tracking loop
          trackAndSend();
        })();
      `);
  }
};

export const getCurrentVideoTime = webViewRef => {
  if (webViewRef.current) {
    webViewRef.current.injectJavaScript(`
        (function() {
            const video = document.querySelector('video');
            if (!video) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ error: "No video found!" }));
                return;
            }
            // Get current time of video
            const currentTime = video.currentTime;
            window.ReactNativeWebView.postMessage(JSON.stringify({ time: currentTime, playBackSpped :  video.playbackRate }));
        })();
        `);
  }
};

export const seekVideoTo = (webViewRef, timeInSeconds) => {
  if (webViewRef?.current) {
    const safeTime = JSON.stringify(timeInSeconds);
    webViewRef.current.injectJavaScript(`
            (function() {
                const video = document.querySelector('video');
                if (video && !isNaN(video.duration)) {
                    const seekTime = ${safeTime};
                    if (seekTime >= 0 && seekTime <= video.duration) {
                        video.currentTime = seekTime;
                        window.ReactNativeWebView.postMessage(JSON.stringify({ 
                            status: "SEEK_SUCCESS", 
                            seekedTo: seekTime 
                        }));
                    } else {
                        window.ReactNativeWebView.postMessage(JSON.stringify({ 
                            status: "SEEK_FAILED", 
                            error: "Time out of range",
                            min: 0,
                            max: video.duration
                        }));
                    }
                }
                // else {
                // window.ReactNativeWebView.postMessage(JSON.stringify({ 
                //     status: "SEEK_FAILED", 
                //         error: "No valid video found or duration not available" 
                //     }));
                // }
            })();
        `);
  }
};


export const getFullDOMHTML = (webViewRef) => {
  if (webViewRef?.current) {
    webViewRef.current.injectJavaScript(`
      (function() {
        if (window._htmlInterval) clearInterval(window._htmlInterval); // Prevent multiple intervals
        window._htmlInterval = setInterval(() => {
          const html = document.documentElement.outerHTML;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "FULL_DOM_HTML",
            html: html
          }));
        }, 5000); // Every 5 seconds
      })();
    `);
  }
};

