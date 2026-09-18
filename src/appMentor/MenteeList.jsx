import React from 'react';
import UserList from './UserList';
import useMentorMenteeStore from './useMentorMenteeStore';

const MenteeList = ({refreshing, onRefresh, renderTrailing}) => {
  const mentees = useMentorMenteeStore(state => state.mentees);
  const isLoading = useMentorMenteeStore(state => state.isLoading);

  return (
    <UserList
      users={mentees}
      refreshing={refreshing}
      onRefresh={onRefresh}
      loading={isLoading}
      listType="Mentees"
      renderTrailing={renderTrailing}
    />
  );
};

export default MenteeList;
