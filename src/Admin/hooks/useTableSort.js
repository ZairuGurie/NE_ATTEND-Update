import { useState, useMemo } from 'react';
import { SORT_DIRECTIONS } from '../constants/adminConfig';

/**
 * Custom hook for table sorting
 * @param {Array} data - The data to sort
 * @param {String} initialSortKey - Initial sort column key
 * @param {String} initialSortDirection - Initial sort direction
 * @returns {Object} Sorting state and handlers
 */
export const useTableSort = (
  data,
  initialSortKey = null,
  initialSortDirection = SORT_DIRECTIONS.ASC
) => {
  const [sortKey, setSortKey] = useState(initialSortKey);
  const [sortDirection, setSortDirection] = useState(initialSortDirection);

  // Sort the data
  const sortedData = useMemo(() => {
    if (!sortKey) return data;

    return [...data].sort((a, b) => {
      let aValue = getNestedValue(a, sortKey);
      let bValue = getNestedValue(b, sortKey);

      // Handle null/undefined values
      if (aValue == null) aValue = '';
      if (bValue == null) bValue = '';

      // Convert to strings for comparison if not numbers
      if (typeof aValue === 'string') aValue = aValue.toLowerCase();
      if (typeof bValue === 'string') bValue = bValue.toLowerCase();

      let comparison = 0;
      if (aValue > bValue) {
        comparison = 1;
      } else if (aValue < bValue) {
        comparison = -1;
      }

      return sortDirection === SORT_DIRECTIONS.ASC ? comparison : -comparison;
    });
  }, [data, sortKey, sortDirection]);

  // Helper function to get nested object values
  const getNestedValue = (obj, path) => {
    return path.split('.').reduce((value, key) => value?.[key], obj);
  };

  // Handle column header click
  const handleSort = (key) => {
    if (sortKey === key) {
      // Toggle direction if same column
      setSortDirection(
        sortDirection === SORT_DIRECTIONS.ASC ? SORT_DIRECTIONS.DESC : SORT_DIRECTIONS.ASC
      );
    } else {
      // New column, default to ascending
      setSortKey(key);
      setSortDirection(SORT_DIRECTIONS.ASC);
    }
  };

  // Reset sorting
  const resetSort = () => {
    setSortKey(initialSortKey);
    setSortDirection(initialSortDirection);
  };

  return {
    sortedData,
    sortKey,
    sortDirection,
    handleSort,
    resetSort,
    isSorted: sortKey !== null,
  };
};

