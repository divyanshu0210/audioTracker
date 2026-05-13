import React from 'react';


import {useShallow} from 'zustand/react/shallow';
import { useSelectionStore } from '../../stores/useSelectionStore';
import CreateCategoryModal from './CreateCategoryModal';
import CategorySelectionModal from './CategorySelectionModal';

function GlobalModals() {
  const {
    createCategoryModalVisible,
    setCreateCategoryModalVisible,
    setCategories,
  } = useSelectionStore(
    useShallow(state => ({
      createCategoryModalVisible: state.createCategoryModalVisible,
      setCreateCategoryModalVisible: state.setCreateCategoryModalVisible,
      setCategories: state.setCategories,
    })),
  );

  return (
    <>
      <CreateCategoryModal
        visible={createCategoryModalVisible}
        onClose={() => setCreateCategoryModalVisible(false)}
        onCategoryCreated={newCat => {
          setCategories(prev => [newCat, ...prev]);
        }}
      />

      <CategorySelectionModal />
    </>
  );
}

export default React.memo(GlobalModals);
