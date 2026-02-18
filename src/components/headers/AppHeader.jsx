import React from 'react';
import {View, Text, TouchableOpacity, FlatList, StyleSheet} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useAppState} from '../../contexts/AppStateContext';

const AppHeader = ({
  title,
  subtitle,
  showBack = true,
  onBackPress,
  rightComponent,
  accentColor,
  breadcrumbs = null, // [{id, title}]
  onBreadcrumbPress,
  enableSearch = false,
  searchParams = null,
}) => {
  const navigation = useNavigation();

  const {selectionMode} = useAppState();

  if (selectionMode) return null;

  return (
    <View style={styles.container}>
      {showBack && (
        <TouchableOpacity
          onPress={onBackPress || navigation.goBack}
          style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#222" />
        </TouchableOpacity>
      )}

      <View style={styles.centerSection}>
        {breadcrumbs ? (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={breadcrumbs}
            keyExtractor={item => item.id}
            renderItem={({item, index}) => {
              const isLast = index === breadcrumbs.length - 1;

              return (
                <View style={styles.breadcrumbItem}>
                  {index > 0 && (
                    <MaterialIcons
                      name="chevron-right"
                      size={14}
                      color="#bbb"
                    />
                  )}

                  <TouchableOpacity
                    disabled={isLast}
                    onPress={() => onBreadcrumbPress?.(item.id)}>
                    <Text
                      style={[
                        styles.breadcrumbText,
                        isLast && styles.activeBreadcrumb,
                      ]}
                      numberOfLines={1}>
                      {item.title}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        ) : (
          <>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </>
        )}
      </View>

      <View style={styles.rightSection}>
        {enableSearch && (
          <TouchableOpacity
            onPress={() => navigation.navigate('SearchWrapper', searchParams)}
            style={styles.iconButton}>
            <MaterialIcons name="search" size={22} color="#000" />
          </TouchableOpacity>
        )}

        {rightComponent}
      </View>
      {accentColor && (
        <View style={[styles.accentBar, {backgroundColor: accentColor}]} />
      )}
    </View>
  );
};

export default AppHeader;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderColor: '#eee',
    position: 'relative',
  },
  backButton: {
    height: 36,
    width: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    marginRight: 10,
  },
  centerSection: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  subtitle: {
    fontSize: 13,
    color: '#777',
    marginTop: 2,
  },
  rightSection: {
    marginLeft: 10,
    flexDirection:'row'
  },
  accentBar: {
    width: 4,
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
  },
  breadcrumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breadcrumbText: {
    fontSize: 14,
    color: '#666',
    marginHorizontal: 4,
  },
  activeBreadcrumb: {
    fontWeight: '700',
    color: '#111',
  },
  iconButton: {
    padding: 8,
  },
});
