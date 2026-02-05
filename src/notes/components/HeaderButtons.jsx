import React from 'react';
import {TouchableOpacity, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';

const HeaderButtons = ({ sourceId, sourceType, style, hideSearch }) => {
  const navigation = useNavigation();
  return (
    <View style={[styles.btnContainer, style]}>
      {!hideSearch && (
        <TouchableOpacity 
          onPress={() => navigation.navigate('SearchScreen', { sourceId, sourceType })} 
          style={styles.iconButton}
        >
          <MaterialIcons name="search" size={26} color="black" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = {
  btnContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
  },
  iconButton: {
    padding: 10,
  },
};

export default HeaderButtons;
