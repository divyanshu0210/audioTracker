import React from 'react';
import UserList from './UserList';
import useMentorMenteeStore from './useMentorMenteeStore';

const MenteeList = ({refreshing, onRefresh}) => {
  const {mentees} = useMentorMenteeStore();

  return (
    <UserList
      users={mentees}
      refreshing={refreshing}
      onRefresh={onRefresh}
      listType="Mentees"
    />
  );
};

export default MenteeList;
