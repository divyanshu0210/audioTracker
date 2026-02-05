import { StyleSheet, TouchableOpacity, View } from 'react-native';
import React from 'react';

const BottomRightButton = ({ iconComponent, buttonStyle, onPress }) => {
  return (
    <TouchableOpacity style={[styles.buttonContainer, buttonStyle]} onPress={onPress}>
      <View style={styles.iconContainer}>
        {iconComponent}
      </View>
    </TouchableOpacity>
  );
};

export default BottomRightButton;

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
});


// import BottomRightButton from './BottomRightButton';
// import Icon from 'react-native-vector-icons/MaterialIcons';
// import { Image } from 'react-native';

// // Example 1: Using react-native-vector-icons
// <BottomRightButton
//   iconComponent={<Icon name="add" size={20} color="#FFFFFF" />}
//   buttonStyle={{ backgroundColor: 'blue' }}
//   onPress={() => console.log('Button pressed')}
// />

// // Example 2: Using Image
// <BottomRightButton
//   iconComponent={
//     <Image
//       source={require('../../assets/PlusIcon.png')}
//       style={{ width: 15, height: 15 }}
//     />
//   }
//   buttonStyle={{ backgroundColor: 'red' }}
//   onPress={() => console.log('Image button pressed')}
// />

// // Example 3: Using a custom component
// const CustomIcon = () => (
//   <View style={{ width: 20, height: 20, backgroundColor: 'yellow', borderRadius: 10 }} />
// );