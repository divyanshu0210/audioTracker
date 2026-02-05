import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import React from 'react';

const colors = [
  '#000000', // Black
  // "#808080", // Gray
  '#FF0000', // Red
  '#FF1493', //Pink
  '#A020F0', // Magenta
  '#007AFF', // Blue
  '#00BFFF', // Deep Sky Blue
  '#00FF00', // Lime Green
  '#ADFF2F', // Green Yellow
  '#FFD700', // Gold
  '#FFA500', // Orange
];

const ColorPallete = ({color, onColorChange}) => {
  return (
    <View style={{flex: 1}}>
      <View style={styles.colorPalette}>
        {colors.map(col => (
          <TouchableOpacity
            key={col}
            style={[
              styles.colorButton,
              {
                backgroundColor: col,
                borderWidth: color === col ? 3 : 1,
              },
            ]}
            onPress={() => onColorChange(col)}
          />
        ))}
      </View>
    </View>
  );
};

export default ColorPallete;

const styles = StyleSheet.create({

  colorPalette: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  colorButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
});
