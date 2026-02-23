import {View, Text} from 'react-native';
import React, {useEffect} from 'react';
import HomeTabs from '../TabScreens/HomeTabs';
import {useAppState} from '../contexts/AppStateContext';
import AppHeader from '../components/headers/AppHeader';

const CategoryDetailScreen = ({navigation, route}) => {
  const {item} = route.params;
  const {setHomeReloadKey} = useAppState();

  const emailMatch = item.name.match(/\(([^)]+)\)/);
  const hasEmail = !!emailMatch;
  const displayName = hasEmail
    ? item.name.replace(/\s*\([^)]+\)/, '')
    : item.name;
  const email = hasEmail ? emailMatch[1] : null;

  useEffect(() => {
    return () => {
      setHomeReloadKey(prev => prev + 1);
    };
  }, []);

  return (
    <>
      <AppHeader
        title={displayName}
        subtitle={email}
        enableSearch={true}
        searchParams={{
          initialSearchActive: true,
          mode: 'all',
          categoryId: item.id,
        }}
      />
      <HomeTabs categoryId={item.id} />
    </>
  );
};
export default CategoryDetailScreen;
