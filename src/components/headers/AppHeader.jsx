// AppHeader.jsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useSelectionStore } from '../../stores/useSelectionStore';
import { navigationRef } from '../../handlers/navigationRef';
import BreadcrumbComponent from '../BreadcrumbComponent';

const AppHeader = ({
  title,
  titleStyle = {},
  headerStyle = {},
  subtitle,
  showBack = true,
  onBackPress,
  rightComponent,
  accentColor,
  breadcrumbs = null,
  onBreadcrumbPress,
  enableSearch = false,
  searchParams = null,
}) => {
  const selectionMode = useSelectionStore(state => state.selectionMode);

  if (selectionMode) return null;

  return (
    <View style={[styles.container, headerStyle]}>
      {showBack && (
        <TouchableOpacity
          onPress={onBackPress || navigationRef.goBack}
          style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#222" />
        </TouchableOpacity>
      )}

      <View style={styles.centerSection}>
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <BreadcrumbComponent
            breadcrumbs={breadcrumbs} 
            onBreadcrumbPress={onBreadcrumbPress} 
          />
        ) : (
          <>
            <Text style={[styles.title, titleStyle]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </>
        )}
      </View>

      <View style={styles.rightSection}>
        {enableSearch && (
          <TouchableOpacity
            onPress={() =>
              navigationRef.navigate('SearchWrapper', {
                ...searchParams,
                title: breadcrumbs ? breadcrumbs[breadcrumbs.length-1].title : title,
              })
            }
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
    minHeight: 60,
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
    justifyContent: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
  },
  accentBar: {
    width: 4,
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
  },
  iconButton: {
    padding: 8,
  },
});