import {Pressable, StyleSheet, Text, View, Image} from 'react-native';
import React from 'react';

const PlusButton = ({handlePress,style}) => {
  return (
 

    <Pressable
      style={[styles.buttonContainer,style]}
      onPress= {handlePress}// Fix here
      >
      <View style={[styles.iconContainer]}>
        <Image
          source={require('../../assets/PlusIcon.png')}
          style={styles.icon}
          />
      </View>
    </Pressable>
          
  );
};

export default PlusButton;

const styles = StyleSheet.create({
  buttonContainer: {
    backgroundColor: '#0F56B3',
    position: 'absolute',
    bottom: 20,
    right: 20,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  iconContainer: {
    width: 55,
    height: 55,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    width: 15,
    height: 15,
  },
});
