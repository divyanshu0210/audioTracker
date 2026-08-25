import React from 'react';

import {useShallow} from 'zustand/react/shallow';
import { useSelectionStore } from '../../stores/useSelectionStore';
import CreateCategoryModal from './CreateCategoryModal';
import CategorySelectionModal from './CategorySelectionModal';
import MoveNoteModal from './MoveNoteModal';

function GlobalModals() {
  const {
    createCategoryModalVisible,
    setCreateCategoryModalVisible,
    setCategories,
    editingCategory,
    setEditingCategory,
  } = useSelectionStore(
    useShallow(state => ({
      createCategoryModalVisible: state.createCategoryModalVisible,
      setCreateCategoryModalVisible: state.setCreateCategoryModalVisible,
      setCategories: state.setCategories,
      editingCategory: state.editingCategory,
      setEditingCategory: state.setEditingCategory,
    })),
  );

  return (
    <>
      <CreateCategoryModal
        visible={createCategoryModalVisible}
        onClose={() => {
          setCreateCategoryModalVisible(false);
          setEditingCategory(null);
        }}
        editingCategory={editingCategory}
        onCategoryCreated={newCat => {
          setCategories(prev => [newCat, ...prev]);
        }}
        onCategoryUpdated={updatedCat => {
          setCategories(prev =>
            prev.map(c => (c.id === updatedCat.id ? {...c, ...updatedCat} : c)),
          );
        }}
      />

      <CategorySelectionModal />

      <MoveNoteModal />
    </>
  );
}

export default React.memo(GlobalModals);
