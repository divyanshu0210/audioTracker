import React from 'react';
import {useAppState} from '../contexts/AppStateContext';
import useMentorMenteeStore from './useMentorMenteeStore';
import UserList from './UserList';

const MentorList = ({refreshing, onRefresh}) => {
  const mentors = useMentorMenteeStore(state => state.mentors);
  const isLoading = useMentorMenteeStore(state => state.isLoading);

  return (
    <UserList
      users={mentors}
      refreshing={refreshing}
      onRefresh={onRefresh}
      loading={isLoading}
      listType="Mentors"
    />
  );
};

export default MentorList;
