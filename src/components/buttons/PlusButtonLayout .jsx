import {StyleSheet, Text, View, Image} from 'react-native';
import React from 'react';

const PlusButtonLayout = ({style}) => {
  return (
    <View style={[styles.buttonContainer, style]}>
      <View style={styles.iconContainer}>
        <Image
          source={require('../../assets/PlusIcon.png')}
          style={styles.icon}
        />
      </View>
    </View>
  );
};

export default PlusButtonLayout;

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
