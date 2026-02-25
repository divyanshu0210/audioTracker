import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {isAudioOrVideo} from '../Linking/utils/handleLinkSubmit';
import RNFS from 'react-native-fs';

const AppStateContext = createContext(null);

export const AppStateProvider = ({children}) => {
  const [driveLinksList, setDriveLinksList] = useState([]);
  const [items, setItems] = useState([]);
  const [deviceFiles, setDeviceFiles] = useState([]);

  const [nonFolderFiles, setNonFolderFiles] = useState([]);
  const [nonFolderFilesInside, setNonFolderFilesInside] = useState([]);
  const [videos, setVideos] = useState([]); //for playlist inside videos
  const [data, setData] = useState([]); //for drive nested view
  const [validDeviceFiles, setValidDeviceFiles] = useState([]);

  const [folderStack, setFolderStack] = useState([]);

  const [userInfo, setUserInfo] = useState(null);
  const [activeItem, setActiveItem] = useState(null);

  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);

  const [notesList, setNotesList] = useState([]);
  const [mainNotesList, setMainNotesList] = useState([]);

  const [selectedNote, setSelectedNote] = useState(null);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [notebooks, setNotebooks] = useState([]);
  const [editingNotebook, setEditingNotebook] = useState(null);

  const [selectedItems, setSelectedItems] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  //refs
  const bottomSheetRef = useRef(null);
  const addNBbottomSheetRef = useRef(null);
  const mentorMenteeRequestBottomSheetRef = useRef(null);

  const [homeReloadKey, setHomeReloadKey] = useState(0);

  //modals
  const [createCategoryModalVisible, setCreateCategoryModalVisible] =
    useState(false);
  const [addToCategoryModalVisible, setAddToCategoryModalVisible] =
    useState(false); // for add category model

  const defaultNotebookId = useRef(null);


  useEffect(() => {
    const checkFilesExistence = async () => {
      const valid = [];
      for (const file of deviceFiles) {
        if (file.file_path) {
          const exists = await RNFS.exists(file.file_path);
          if (exists) valid.push(file);
        }
      }
      setValidDeviceFiles(valid);
    };

    checkFilesExistence();
  }, [deviceFiles]);

  useEffect(() => {
    const filtered = driveLinksList.filter(
      item =>
        item.file_path &&
        item.mimeType !== 'application/vnd.google-apps.folder' &&
        isAudioOrVideo(item.mimeType),
    );
    setNonFolderFiles(filtered);
  }, [driveLinksList]);

  useEffect(() => {
    const filterFiles = async () => {
      if (!data || data.length === 0) {
        setNonFolderFilesInside([]);
        return;
      }

      const filtered = await Promise.all(
        data.map(async item => {
          if (
            item.file_path &&
            item.mimeType !== 'application/vnd.google-apps.folder' &&
            isAudioOrVideo(item.mimeType)
          ) {
            const exists = await RNFS.exists(item.file_path);
            return exists ? item : null;
          }
          return null;
        }),
      );

      // Remove nulls
      setNonFolderFilesInside(filtered.filter(Boolean));
    };

    filterFiles();
  }, [data]);

  useEffect(() => {
    console.log('active note id', activeNoteId);
    // console.log(selectedNote);
  }, [activeNoteId, selectedNote]);

  const filterAndSet = (type, id, screen = null) => {
    switch (type) {
      case 'youtube':
        setItems(prev => prev.filter(f => f.ytube_id !== id));
        break;
      case 'device':
        setDeviceFiles(prev => prev.filter(f => f.driveId !== id));
        break;
      case 'note':
        setNotesList(prev => prev.filter(i => i.rowid !== id));
      case 'notebook':
        setNotebooks(prev => prev.filter(i => i.id !== id));
        break;
      case 'drive':
        setDriveLinksList(prev => prev.filter(f => f.driveId !== id));
    }
  };

  return (
    <AppStateContext.Provider
      value={{
        driveLinksList,
        setDriveLinksList,
        nonFolderFiles, //in drive link list
        setNonFolderFiles,
        data, //for drive nested
        setData,
        nonFolderFilesInside, //in drive nested
        setNonFolderFilesInside,

        folderStack,
        setFolderStack,

        items,
        setItems,
        videos, //for inside playlist
        setVideos,

        deviceFiles,
        setDeviceFiles,
        validDeviceFiles,
        setValidDeviceFiles,

        userInfo,
        setUserInfo,
        categories,
        setCategories,
        selectedCategory,
        setSelectedCategory,
        //notes
        notesList,
        setNotesList,
        mainNotesList,
        setMainNotesList,

        selectedNote,
        setSelectedNote,

        activeNoteId,
        setActiveNoteId,

        //notebooks
        notebooks,
        setNotebooks,
        editingNotebook,
        setEditingNotebook,
        defaultNotebookId,

        selectedItems,
        setSelectedItems,
        selectionMode,
        setSelectionMode,

        addNBbottomSheetRef,
        mentorMenteeRequestBottomSheetRef,
        bottomSheetRef,

        createCategoryModalVisible,
        setCreateCategoryModalVisible,
        addToCategoryModalVisible,
        setAddToCategoryModalVisible,

        activeItem,
        setActiveItem, // got common item menu

        filterAndSet,

        homeReloadKey,
        setHomeReloadKey,
      }}>
      {children}
    </AppStateContext.Provider>
  );
};

export const useAppState = () => useContext(AppStateContext);
