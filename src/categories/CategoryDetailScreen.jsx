import {View, Text} from 'react-native';
import React, {useEffect, useLayoutEffect} from 'react';
import HomeTabs from '../TabScreens/HomeTabs';
import {useAppState} from '../contexts/AppStateContext';

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

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={{flexDirection: 'column'}}>
          <Text style={{fontSize: 20}}>{displayName}</Text>
          <Text style={{fontSize: 12, color: '#777'}}>{email || ''}</Text>
        </View>
      ),
    });
  }, [navigation]);

  return <HomeTabs categoryId={item.id} />;
};
export default CategoryDetailScreen;
