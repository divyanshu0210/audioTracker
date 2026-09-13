import React from 'react';
import UserList from './UserList';
import useMentorMenteeStore from './useMentorMenteeStore';

const MenteeList = ({refreshing, onRefresh}) => {
  const mentees = useMentorMenteeStore(state => state.mentees);
  const isLoading = useMentorMenteeStore(state => state.isLoading);

  return (
    <UserList
      users={mentees}
      refreshing={refreshing}
      onRefresh={onRefresh}
      loading={isLoading}
      listType="Mentees"
    />
  );
};

export default MenteeList;
