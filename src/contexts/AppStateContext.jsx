import React, {createContext, useContext, useRef, useState} from 'react';

const AppStateContext = createContext(null);

export const AppStateProvider = ({children}) => {
  const [userInfo, setUserInfo] = useState(null);
  const bottomSheetRef = useRef(null);
  const addNBbottomSheetRef = useRef(null);
  const mentorMenteeRequestBottomSheetRef = useRef(null);

  return (
    <AppStateContext.Provider
      value={{
        userInfo,
        setUserInfo,
        bottomSheetRef,
        addNBbottomSheetRef,
        mentorMenteeRequestBottomSheetRef,
      }}>
      {children}
    </AppStateContext.Provider>
  );
};

export const useAppState = () => useContext(AppStateContext);