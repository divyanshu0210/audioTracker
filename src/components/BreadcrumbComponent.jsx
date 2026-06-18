import React, {useEffect, useRef, useCallback} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

const BreadcrumbComponent = ({breadcrumbs, onBreadcrumbPress}) => {
  const breadcrumbListRef = useRef(null);
  const previousLengthRef = useRef(0);

  useEffect(() => {
    if (!breadcrumbs || breadcrumbs.length === 0) return;

    const currentLength = breadcrumbs.length;
    const isAddingItem = currentLength > previousLengthRef.current;
    previousLengthRef.current = currentLength;

    setTimeout(() => {
      if (!breadcrumbListRef.current) return;
      if (isAddingItem) {
        breadcrumbListRef.current.scrollToEnd({animated: true});
      } else {
        breadcrumbListRef.current.scrollToEnd({animated: true});
      }
    }, 50);
  }, [breadcrumbs]);

  const getItemWidth = useCallback(title => {
    return Math.min(title.length * 8 + 36, 200);
  }, []);

  const scrollToCrumb = useCallback(
    index => {
      if (!breadcrumbListRef.current || index < 0) return;
      if (!breadcrumbs || index >= breadcrumbs.length) return;
      try {
        breadcrumbListRef.current.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.3,
        });
      } catch (_) {
        breadcrumbListRef.current?.scrollToEnd({animated: true});
      }
    },
    [breadcrumbs],
  );

  if (!breadcrumbs || breadcrumbs.length === 0) {
    return null;
  }

  return (
    <FlatList
      ref={breadcrumbListRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      data={breadcrumbs}
      keyExtractor={item => item.id}
      getItemLayout={(data, index) => {
        const item = data?.[index];
        const width = item ? getItemWidth(item.title) : 100;
        return {length: width, offset: width * index, index};
      }}
      onScrollToIndexFailed={() => {
        breadcrumbListRef.current?.scrollToEnd({animated: true});
      }}
      renderItem={({item, index}) => {
        const isLast = index === breadcrumbs.length - 1;
        return (
          <View style={styles.breadcrumbItem}>
            {index > 0 && (
              <MaterialIcons
                name="chevron-right"
                size={14}
                color="#bbb"
                style={styles.separator}
              />
            )}
            <TouchableOpacity
              disabled={isLast}
              onPress={() => {
                onBreadcrumbPress?.(item.id);
                scrollToCrumb(index);
              }}>
              <Text
                style={[
                  styles.breadcrumbText,
                  isLast && styles.activeBreadcrumb,
                ]}
                numberOfLines={1}
                ellipsizeMode="tail">
                {item.title}
              </Text>
            </TouchableOpacity>
          </View>
        );
      }}
      contentContainerStyle={styles.breadcrumbContent}
    />
  );
};

const styles = StyleSheet.create({
  breadcrumbContent: {
    paddingVertical: 4,
  },
  breadcrumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  separator: {
    marginHorizontal: 2,
  },
  breadcrumbText: {
    fontSize: 14,
    color: '#666',
    marginHorizontal: 4,
    maxWidth: 150,
  },
  activeBreadcrumb: {
    fontWeight: '700',
    color: '#111',
  },
});

export default BreadcrumbComponent;
