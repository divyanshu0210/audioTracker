// BreadcrumbComponent.jsx
import React, { useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, LayoutAnimation, UIManager, Platform } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const BreadcrumbComponent = ({ breadcrumbs, onBreadcrumbPress }) => {
  const breadcrumbListRef = useRef(null);
  const previousLengthRef = useRef(0);

  // Improved scrolling with animation and smart positioning
  useEffect(() => {
    if (!breadcrumbs || breadcrumbs.length === 0) return;

    const currentLength = breadcrumbs.length;
    const isAddingItem = currentLength > previousLengthRef.current;
    previousLengthRef.current = currentLength;

    // Animate the breadcrumb change
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    // Smart scrolling based on what changed
    const scrollToPosition = () => {
      if (!breadcrumbListRef.current) return;

      if (isAddingItem) {
        // When adding a new folder, scroll to show the new item
        setTimeout(() => {
          breadcrumbListRef.current?.scrollToEnd({ animated: true });
        }, 50);
      } else if (currentLength > 0) {
        // When going back, scroll to show the last item (which is now the current folder)
        setTimeout(() => {
          breadcrumbListRef.current?.scrollToIndex({
            index: currentLength - 1,
            animated: true,
            viewPosition: 0.5, // Center the item
          });
        }, 50);
      }
    };

    scrollToPosition();
  }, [breadcrumbs]);

  // Helper function to estimate item width
  const getItemWidth = useCallback((title) => {
    // Rough estimate: 8px per character + padding + icon width
    const charWidth = 8;
    const iconWidth = 20; // For chevron icon
    const padding = 16;
    return Math.min(title.length * charWidth + iconWidth + padding, 200);
  }, []);

  // Function to handle scroll to specific crumb
  const scrollToCrumb = useCallback((index) => {
    if (breadcrumbListRef.current && index >= 0) {
      try {
        breadcrumbListRef.current.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.3, // Show item 30% from left
        });
      } catch (error) {
        // Fallback if scrollToIndex fails
        setTimeout(() => {
          breadcrumbListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    }
  }, []);

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
        // Access the item through data array
        const item = data[index];
        if (!item) return { length: 100, offset: 100 * index, index };
        
        const width = getItemWidth(item.title);
        return {
          length: width,
          offset: width * index,
          index,
        };
      }}
      onScrollToIndexFailed={(info) => {
        // Fallback if scrollToIndex fails
        const wait = new Promise(resolve => setTimeout(resolve, 500));
        wait.then(() => {
          breadcrumbListRef.current?.scrollToIndex({
            index: info.index,
            animated: true,
            viewPosition: 0.5,
          });
        });
      }}
      renderItem={({ item, index }) => {
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