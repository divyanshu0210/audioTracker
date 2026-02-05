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
  
  const PlayerSettings = forwardRef((props, ref) => {
    const [playbackRate, setPlaybackRate] = useState(1.0);
    const [aspectRatio, setAspectRatio] = useState('9:16');
    const [showSettings, setShowSettings] = useState(false);
    const [showSpeedOptions, setShowSpeedOptions] = useState(false);
    const [showAspectOptions, setShowAspectOptions] = useState(false);
    const settingsAnimation = useRef(new Animated.Value(0)).current;
 
    

    useImperativeHandle(ref, () => ({
        openSettingsModal,
        closeSettingsModal,
        getPlaybackRate: () => playbackRate,
        getAspectRatio: () => aspectRatio,
      }));

    const openSettingsModal = () => {
      setShowSettings(true);
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
      });
    };
  
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
                          setPlaybackRate(speed);
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
                      { label: '1:1', value: '1:1' },
                      { label: '16:9', value: '16:9' },
                      { label: '9:16', value: '9:16' },
                    ].map(ratio => (
                      <TouchableOpacity
                        key={ratio.value}
                        style={[
                          styles.optionButton,
                          aspectRatio === ratio.value && styles.selectedOption,
                        ]}
                        onPress={() => {
                        
                          setAspectRatio(ratio.value);
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
      flexDirection: 'column',
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
  