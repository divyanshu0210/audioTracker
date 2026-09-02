import React, {createContext, useContext, useRef, useState} from 'react';

const AppStateContext = createContext(null);

export const AppStateProvider = ({children}) => {
  const [userInfo, setUserInfo] = useState(null);
  const bottomSheetRef = useRef(null);
  const addNBbottomSheetRef = useRef(null);
  const mentorMenteeRequestBottomSheetRef = useRef(null);
  const continueWatchingSheetRef = useRef(null);

  return (
    <AppStateContext.Provider
      value={{
        userInfo,
        setUserInfo,
        bottomSheetRef,
        addNBbottomSheetRef,
        mentorMenteeRequestBottomSheetRef,
        continueWatchingSheetRef,
      }}>
      {children}
    </AppStateContext.Provider>
  );
};

export const useAppState = () => useContext(AppStateContext);