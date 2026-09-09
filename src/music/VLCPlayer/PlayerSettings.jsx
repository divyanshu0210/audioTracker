import React, {
    useRef,
    useState,
    useImperativeHandle,
    forwardRef,
    useEffect,
  } from 'react';
  import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Animated,
  } from 'react-native';
  import Icon from 'react-native-vector-icons/MaterialIcons';
  
  // Controlled on purpose. This component is rendered inside BottomControls,
  // which unmounts whenever the player's controls auto-hide, so anything it
  // held in local state lasted only until the next hide — the speed and ratio
  // now belong to VLCPlayerComponent and are passed back down.
  const PlayerSettings = forwardRef((
    {
      playbackRate,
      onSelectPlaybackRate,
      aspectRatio,
      onSelectAspectRatio,
      onVisibilityChange,
    },
    ref,
  ) => {
    const [showSettings, setShowSettings] = useState(false);
    const [showSpeedOptions, setShowSpeedOptions] = useState(false);
    const [showAspectOptions, setShowAspectOptions] = useState(false);
    const settingsAnimation = useRef(new Animated.Value(0)).current;
 
    

    useImperativeHandle(ref, () => ({
        openSettingsModal,
        closeSettingsModal,
      }));

    // Told on open, and again once the close animation has finished, so the
    // player knows not to run its auto-hide timer while a choice is in
    // progress.
    const openSettingsModal = () => {
      setShowSettings(true);
      onVisibilityChange?.(true);
      Animated.timing(settingsAnimation, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    };
  
    const closeSettingsModal = () => {
    
      Animated.timing(settingsAnimation, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setShowSettings(false);
        setShowSpeedOptions(false);
        setShowAspectOptions(false);
        onVisibilityChange?.(false);
      });
    };

    // Should the panel be torn down while still open — a screen rotation, the
    // player closing — the flag has to be cleared anyway, or the controls
    // would never auto-hide again. Only then, though: this component is
    // unmounted by every ordinary controls hide, and reporting a close on
    // those would be reporting something that never happened.
    const showSettingsRef = useRef(false);
    showSettingsRef.current = showSettings;
    useEffect(() => {
      return () => {
        if (showSettingsRef.current) onVisibilityChange?.(false);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  
    const toggleSettingsModal = () => {
      showSettings ? closeSettingsModal() : openSettingsModal();
    };
  
    const toggleSpeedOptions = () => {
      setShowAspectOptions(false);
      setShowSpeedOptions(!showSpeedOptions);
    };
  
    const toggleAspectOptions = () => {
      setShowSpeedOptions(false);
      setShowAspectOptions(!showAspectOptions);
    };
  

  
    return (
      <>
        {/* Settings button */}
        <TouchableOpacity style={styles.controlButton} onPress={toggleSettingsModal}>
          <Icon name="settings" size={24} color="white" />
        </TouchableOpacity>
  
        {/* Settings modal */}
        {showSettings && (
          <Animated.View
            style={[
              styles.settingsContainer,
              {
                opacity: settingsAnimation,
                transform: [
                  {
                    translateY: settingsAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [20, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {/* Main Settings */}
            {!showSpeedOptions && !showAspectOptions && (
              <ScrollView
                contentContainerStyle={styles.mainSettingsScroll}
                showsVerticalScrollIndicator={false}
              >
                <TouchableOpacity
                  style={styles.settingsButton}
                  onPress={toggleSpeedOptions}
                >
                  <Icon name="speed" size={20} color="white" />
                  <Text style={styles.settingsButtonText}>Speed</Text>
                </TouchableOpacity>
  
                <TouchableOpacity
                  style={styles.settingsButton}
                  onPress={toggleAspectOptions}
                >
                  <Icon name="aspect-ratio" size={20} color="white" />
                  <Text style={styles.settingsButtonText}>Aspect Ratio</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
  
            {/* Speed Options */}
            {showSpeedOptions && (
        
                <View style={styles.optionsContainer}>
                  <View style={styles.optionsHeader}>
                    <TouchableOpacity onPress={toggleSpeedOptions}>
                      <Icon name="arrow-back" size={20} color="white" />
                    </TouchableOpacity>
                    <Text style={styles.optionsTitle}>Playback Speed</Text>
                  </View>
  
                  <View style={styles.speedOptions}>
                    {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map(speed => (
                      <TouchableOpacity
                        key={speed}
                        style={[
                          styles.optionButton,
                          playbackRate === speed && styles.selectedOption,
                        ]}
                        onPress={() => {
                          onSelectPlaybackRate?.(speed);
                          closeSettingsModal();
                        }}
                      >
                        <Text style={styles.optionText}>{speed}x</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
         
            )}
  
            {/* Aspect Ratio Options */}
            {showAspectOptions && (
              <View style={styles.optionsContainer}>
                <View style={styles.optionsHeader}>
                  <TouchableOpacity onPress={toggleAspectOptions}>
                    <Icon name="arrow-back" size={20} color="white" />
                  </TouchableOpacity>
                  <Text style={styles.optionsTitle}>Aspect Ratio</Text>
                </View>
  
               
                  <View style={styles.aspectOptions}>
                    {[
                      // null = leave the file's own ratio alone. Without a way
                      // back to it, picking any ratio was a one-way door.
                      { label: 'Original', value: null },
                      { label: '1:1', value: '1:1' },
                      { label: '16:9', value: '16:9' },
                      { label: '9:16', value: '9:16' },
                    ].map(ratio => (
                      <TouchableOpacity
                        key={ratio.label}
                        style={[
                          styles.optionButton,
                          aspectRatio === ratio.value && styles.selectedOption,
                        ]}
                        onPress={() => {
                          onSelectAspectRatio?.(ratio.value);
                          closeSettingsModal();
                        }}
                      >
                        <Text style={styles.optionText}>{ratio.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
          
              </View>
            )}
          </Animated.View>
        )}
      </>
    );
  });
  
  const styles = StyleSheet.create({
    controlButton: {
      padding: 8,
    },
    settingsContainer: {
      position: 'absolute',
      bottom: 35,
      right: 15,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      borderRadius: 8,
      padding: 12,
      width: 160,
      zIndex: 20,
    },
    settingsButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 8,
    },
    settingsButtonText: {
      color: 'white',
      marginLeft: 10,
      fontSize: 14,
    },
    optionsContainer: {
      width: '100%',
    },
    optionsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    optionsTitle: {
      color: 'white',
      marginLeft: 10,
      fontSize: 14,
      fontWeight: 'bold',
    },
    speedOptions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    aspectOptions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    optionButton: {
      padding: 8,
      marginVertical: 4,
      borderRadius: 4,
      alignItems: 'center',
      width: '48%',
    },
    selectedOption: {
      backgroundColor: 'rgba(255, 0, 0, 0.7)',
    },
    optionText: {
      color: 'white',
      fontSize: 13,
    },
    mainSettingsScroll: {
      paddingVertical: 4,
    },
    optionsScroll: {
      paddingBottom: 16,
    },
  });
  
  export default PlayerSettings;
  