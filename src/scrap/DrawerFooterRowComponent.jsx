// import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
// import React from 'react';
// import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';
// import {useAppState} from '../contexts/AppStateContext';

// const DrawerFooterRow = ({setDrawerVisible}) => {
//   const {mentorMenteeRequestBottomSheetRef} = useAppState();

//   return (
//     <View style={styles.footerRow}>
//           <TouchableOpacity style={styles.iconButton}>
//         {/* <FontAwesome5 name="sync-alt" size={22} color="#333" />
//         <Text style={styles.footerBtnText}>Refresh</Text> */}
//       </TouchableOpacity>
   
//          <TouchableOpacity
//         style={styles.iconButton}
//         onPress={() => {
//           setDrawerVisible(false);
//           mentorMenteeRequestBottomSheetRef.current?.expand();
//         }}>
//         <FontAwesome5 name="user-plus" size={22} color="#333" />
//         <Text style={styles.footerBtnText}>Add User</Text>
//       </TouchableOpacity>
  

//       <TouchableOpacity style={styles.iconButton}>
//         {/* <FontAwesome5 name="cog" size={22} color="#333" />
//         <Text style={styles.footerBtnText}>Settings</Text> */}
//       </TouchableOpacity>

//     </View>
//   );
// };

// export default DrawerFooterRow;

// const styles = StyleSheet.create({
//   footerRow: {
//     flexDirection: 'row',
//     justifyContent: 'space-around',
//     alignItems: 'center',
//     paddingVertical: 12,
//     borderTopWidth: 1,
//     borderColor: '#e0e0e0',
//     backgroundColor: '#fafafa',
//   },
//   iconButton: {
//     alignItems: 'center',
//     justifyContent: 'center',
//   },
//   footerBtnText: {
//     fontSize: 12,
//     marginTop: 4,
//     color: '#333',
//     fontFamily: 'Roboto',
//   },
// });
