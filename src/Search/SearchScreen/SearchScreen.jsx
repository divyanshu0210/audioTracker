import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  StyleSheet,
  View
} from 'react-native';
import { useAppState } from '../../contexts/AppStateContext';
import { fetchNotes } from '../../database/R';
import FilterBar from './FilterBar';
import SearchBar from './SearchBar';
import NotesListComponent from '../../notes/notesListing/NotesListComponent';

const SearchScreen = forwardRef(
  ({sourceId: propSourceId, sourceType: propSourceType}, ref) => {
    useImperativeHandle(ref, () => ({
      showSearchBar,
    }));
    useEffect(() => {
      navigation.setOptions({
        headerShown: !showSearchBar, // Hide header when search is visible
      });
    }, [showSearchBar, navigation]);

    const route = useRoute();
    const navigation = useNavigation();

    const {notesList,setNotesList} = useAppState();
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    const [showSearchBar, setShowSearchBar] = useState(true);
    const searchBarWidth = useRef(new Animated.Value(0)).current;

    //for filters
    const [sourceType, setSourceType] = useState(null);
    const [fileType, setFileType] = useState(null);

    // // Get parameters from route if they exist
    // const routeSourceId = route.params?.sourceId;
    // const routeSourceType = route.params?.sourceType;

    // Use props if provided, otherwise fall back to route params
    // Use props if provided and valid, otherwise fall back to route params
    const routeSourceId = isValidProp(propSourceId)
      ? propSourceId
      : route.params?.sourceId;
    const routeSourceType = isValidProp(propSourceType)
      ? propSourceType
      : route.params?.sourceType;
    // Helper function to check if prop is valid (not undefined or null)
    function isValidProp(prop) {
      return prop !== undefined && prop !== null;
    }

    //for filter purpose
    useEffect(() => {
      if (routeSourceType) {
        setSourceType(routeSourceType); // Ensure sourceType matches routeSourceType
      }
    }, [routeSourceType]);

    useFocusEffect(
      React.useCallback(() => {
        loadInitialData();

        // Optional: Cleanup function if needed
        return () => {
          // Any cleanup code when tab loses focus
        };
      }, [routeSourceId, routeSourceType]), // Dependencies
    );

    const loadInitialData = async () => {
      setLoading(true);
      try {
        const limit = 20;
        const params = {
          offset: 0,
          limit,
          sortBy: 'created_at',
          sortOrder: 'DESC',
        };

        // Apply route filters if they exist
        if (routeSourceId) {
          params.sourceId = routeSourceId;
        }
        if (routeSourceType) {
          params.sourceType = routeSourceType;
        }

        const notes = await fetchNotes(params);
        setNotesList(notes);
        setOffset(notes.length);
        setHasMore(notes.length === limit);
      } catch (error) {
        console.error('Error loading initial notes:', error);
      }
      setLoading(false);
    };

    const loadMoreData = async () => {
      if (loading || !hasMore) return;
      setLoading(true);
      try {
        const limit = 20;
        const params = {
          offset,
          limit,
          sortBy: 'created_at',
          sortOrder: 'DESC',
        };

        // Apply route filters if they exist
        if (routeSourceId) {
          params.sourceId = routeSourceId;
        }
        if (routeSourceType) {
          params.sourceType = routeSourceType;
        } else if (sourceType) {
          params.sourceType = sourceType;
        }

        // Only apply search and filter params if we're searching
        if (searchQuery.trim()) {
          params.searchQuery = searchQuery;
        }

        const newNotes = await fetchNotes(params);
        setNotesList(prev => [...prev, ...newNotes]);
        setOffset(prev => prev + newNotes.length);
        setHasMore(newNotes.length === limit);
      } catch (error) {
        console.error('Error loading more notes:', error);
      }
      setLoading(false);
    };

    const toggleSourceType = async type => {
      if (routeSourceType) return; //if routeSource exist you shouldnt be able to switch the source type

      setSourceType(prevSourceType => {
        const newSourceType = prevSourceType === type ? null : type;

        // if (searchQuery.trim() !== '' || newSourceType) {
        // if (searchQuery.trim() !== '' || newSourceType) {
        // handleSearch(searchQuery, newSourceType);
        // } else {
        //both empty
        // setNotesList([]);
        // }

        setFileType(prevFileType => {
          // const newFileType = newSourceType !== 'drive' ? null : prevFileType;
          const newFileType = null;
          console.log(newSourceType, newFileType);
          // Use searchQuery from ref or state
          // if (searchQuery.trim()) {
          handleSearch(searchQuery, newSourceType, newFileType);
          // }

          return newFileType;
        });

        return newSourceType;
      });
    };

    const toggleFileType = type => {
      if (sourceType === 'drive') {
        setFileType(prev => {
          const newFileType = prev === type ? null : type;
          console.log(sourceType, newFileType);
          // if (searchQuery.trim()) {
          handleSearch(searchQuery, sourceType, newFileType);
          // }

          return newFileType;
        });
      }
    };

    const handleSearch = async (query, latestSourceType, latestFileType) => {
      setSearchQuery(query);
      setOffset(0);
      setIsSearching(query.trim() !== '');
      setHasMore(true);

      try {
        const limit = 20;
        const params = {
          offset: 0,
          limit,
          sortBy: 'created_at',
          sortOrder: 'DESC',
        };

        // Apply route filters if they exist
        if (routeSourceId) {
          params.sourceId = routeSourceId;
        }
        if (routeSourceType) {
          params.sourceType = routeSourceType;
        } else if (latestSourceType) {
          params.sourceType = latestSourceType;
        }
        // else{
        //   params.sourceType = sourceType
        // }

        // if (query.trim()) {
        //   params.searchQuery = query;
        // }
        // Only apply search and filter params if we're searching
        if (query.trim()) {
          params.searchQuery = query;
        }

        if (latestFileType && sourceType === 'drive') {
          params.fileType = latestFileType;
        }

        console.log('Searching ', params);
        const results = await fetchNotes(params);
        setNotesList(results);

        setOffset(results.length);
        setHasMore(results.length === limit);
      } catch (error) {
        console.error('Error searching notes:', error);
        setNotesList([]);
      }
    };

    const toggleSearchBar = () => {
      if (showSearchBar) {
        Animated.timing(searchBarWidth, {
          toValue: 50, // Collapse back to icon size
          duration: 0,
          useNativeDriver: false,
        }).start(() => {
          setShowSearchBar(false);
          setNotesList([]);
          setSearchQuery(''); // Clear the search query when hiding
          setSourceType(null);
          setFileType(null);
          navigation.goBack();
          // loadInitialData();
        });
      } else {
        setShowSearchBar(true);
        Animated.timing(searchBarWidth, {
          toValue: 350, // Expand to full width
          duration: 300,
          useNativeDriver: false,
        }).start(() => {
          setNotesList([]);
        });
      }
    };

    return (
      <View style={[styles.container, showSearchBar && {flex: 1}]}>
        {/* Other Buttons - Only show when search is not active */}
        <View style={styles.headerContainer}>
          {/* {!showSearchBar && (
           
          )} */}

          {/* Search Bar - Full Width When Active */}
          {showSearchBar && (
            <>
              <SearchBar
                handleSearch={handleSearch}
                onToggle={toggleSearchBar}
                initialQuery={searchQuery}
                isVisible={showSearchBar}
                setNotesList={setNotesList}
                sourceType={sourceType}
                fileType={fileType}
              />

              {/* Filters */}
              <FilterBar
                sourceType={sourceType}
                fileType={fileType}
                toggleSourceType={toggleSourceType}
                toggleFileType={toggleFileType}
                routeSourceType={routeSourceType}
              />
            </>
          )}
        </View>

        <NotesListComponent
          loading={loading}
          loadMoreData={loadMoreData}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    // flex: 1,
    backgroundColor: '#fff',
    //  padding: 16
  },
  headerContainer: {
    flexDirection: 'column',
    padding: 10,
    backgroundColor: 'white',
  },
  btnContainer: {
    flexDirection: 'row',
    alignItems: 'center',

    backgroundColor: 'white',
  },
  iconButton: {
    padding: 10,
  },
});

export default SearchScreen;
