import React, {useCallback, useMemo, useState} from 'react';
import {Text, TouchableOpacity, StyleSheet} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

export const sortByName = (items, direction) => {
  if (!Array.isArray(items) || !direction) return items || [];

  const collator =
    typeof Intl !== 'undefined' && Intl.Collator
      ? new Intl.Collator(undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      : null;

  return [...items].sort((a, b) => {
    const aName = String(a?.title ?? a?.name ?? '').trim();
    const bName = String(b?.title ?? b?.name ?? '').trim();
    const result = collator
      ? collator.compare(aName, bName)
      : aName.localeCompare(bName);
    return direction === 'desc' ? -result : result;
  });
};

export const useNameSort = items => {
  const [sortDirection, setSortDirection] = useState(null);

  const sortedItems = useMemo(
    () => sortByName(items, sortDirection),
    [items, sortDirection],
  );

  const toggleSort = useCallback(() => {
    setSortDirection(current =>
      current === null ? 'asc' : current === 'asc' ? 'desc' : null,
    );
  }, []);

  return {sortDirection, sortedItems, toggleSort};
};

const SortNameButton = ({direction, onPress}) => {
  const label = direction === 'asc' ? 'A-Z' : direction === 'desc' ? 'Z-A' : '';

  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel={
        direction === 'asc'
          ? 'Sorted by name, A to Z'
          : direction === 'desc'
          ? 'Sorted by name, Z to A'
          : 'Sort by name'
      }
      hitSlop={6}>
      <MaterialIcons name="sort" size={21} color="#000" />
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
};

export default SortNameButton;

const styles = StyleSheet.create({
  button: {
    minHeight: 36,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  label: {
    marginLeft: 2,
    fontSize: 11,
    fontWeight: '600',
    color: '#222',
  },
});
