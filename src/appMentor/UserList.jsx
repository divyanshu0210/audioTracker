import React, {useState} from 'react';
import {View, Text, FlatList, StyleSheet, TouchableOpacity} from 'react-native';
import useMentorMenteeStore from './useMentorMenteeStore';
import {useAppState} from '../contexts/AppStateContext';

export default UserList = ({
  users = [],
  refreshing,
  onRefresh,
  listType = 'Users',
  onPress,
}) => {
  const {
    selectedUsers,
    setSelectedUsers,
    userSelectionMode,
    setUserSelectionMode,
    activeMentee,
    activeMentor,
  } = useMentorMenteeStore();

  const {selectedItems, setSelectedCategory} = useAppState();
  const getUserId = item => item.id?.toString() ?? item.email;

  const isSelected = id => {
    // console.log(selectedUsers);
    if (selectedUsers.length > 0) {
      return selectedUsers.some(u => u.id === id && u.userType === listType);
    } else return false;
  };

  const handleLongPress = item => {
    const id = getUserId(item);
    setUserSelectionMode(true);
    setSelectedUsers([{id, userType: listType, user: item}]);
  };

  const handlePress = async item => {
    if (selectedItems.length > 0 || selectedUsers.length > 0) {
      const id = getUserId(item);

      let updatedSelectedUsers = [...selectedUsers];
      const exists = updatedSelectedUsers.find(
        u => u.id === id && u.userType === listType,
      );

      if (exists) {
        updatedSelectedUsers = updatedSelectedUsers.filter(
          u => !(u.id === id && u.userType === listType),
        );
      } else {
        updatedSelectedUsers.push({id, userType: listType, user: item});
      }

      if (
        !userSelectionMode &&
        selectedUsers.length === 0 &&
        updatedSelectedUsers.length > 0
      ) {
        setUserSelectionMode(true);
      }

      setSelectedUsers(updatedSelectedUsers);

      if (updatedSelectedUsers.length === 0 && userSelectionMode) {
        !(selectedItems.length > 0) && setUserSelectionMode(false);
      }
    } else {
      onPress?.(item);
    }
  };

  const cancelSelection = () => {
    setSelectedUsers([]);
    setUserSelectionMode(false);
  };

  const renderItem = ({item}) => {
    const id = getUserId(item);
    const selected = isSelected(id);
    const isActiveMenteeOrMentor =
      (activeMentee && id === activeMentee.id?.toString()) ||
      (activeMentor && id === activeMentor.id?.toString());

    return (
      <TouchableOpacity
        onPress={() => handlePress(item)}
        onLongPress={() => handleLongPress(item)}
        style={[
          styles.item,
          selected && styles.selectedItem,
          isActiveMenteeOrMentor && styles.activeMenteeItem,
        ]}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
          <View style={{flexDirection: 'column'}}>
            <Text
              style={[styles.name, isActiveMenteeOrMentor && styles.activeMenteeText]}>
              {item.full_name}
            </Text>
            <Text
              style={[styles.email, isActiveMenteeOrMentor && styles.activeMenteeText]}>
              {item.email}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };
  return (
    <View style={styles.container}>
      {userSelectionMode && (
        <View style={styles.selectionHeader}>
          <TouchableOpacity onPress={cancelSelection}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.count}>{selectedUsers.length} selected</Text>
        </View>
      )}
      <FlatList
        data={users}
        renderItem={renderItem}
        keyExtractor={item => getUserId(item)}
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={{paddingBottom: 20}}
        ListEmptyComponent={
          <Text style={styles.empty}>No {listType.toLowerCase()} found.</Text>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, padding: 0, backgroundColor: '#fff'},
  selectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingVertical: 5,

    borderBottomWidth: 1,
    borderColor: '#ccc',
  },
  cancel: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  count: {
    color: '#333',
    fontWeight: 'bold',
  },
  item: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 0.5,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    borderRadius: 5,
    marginBottom: 5,
  },
  selectedItem: {
    backgroundColor: '#e6f0ff',
  },
  activeMenteeItem: {
    backgroundColor: '#1a73e8', // Google Blue
    borderWidth: 1,
    borderRadius: 25,
    borderBottomEndRadius: 35,
    borderTopEndRadius: 35,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  email: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  activeMenteeText: {
    color: '#fff',
    fontWeight: '700',
  },
  empty: {
    fontStyle: 'italic',
    color: '#777',
    marginTop: 40,
    textAlign: 'center',
  },

  menteeButtonsRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  actionButton: {
    // backgroundColor: '#007AFF',
    paddingVertical: 5,
    // paddingHorizontal: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  buttonText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '500',
  },
});
