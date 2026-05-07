import {create} from 'zustand';

export const useSelectionStore = create((set, get) => ({
  selectedItems: [],
  selectionMode: false,
  categories: [],
  selectedCategory: null,
  homeReloadKey: 0,

  activeItem: null,
  createCategoryModalVisible: false,
  addToCategoryModalVisible: false,

  setSelectedItems: val =>
    set(s => ({
      selectedItems: typeof val === 'function' ? val(s.selectedItems) : val,
    })),
  setSelectionMode: val => set({selectionMode: val}),
  setCategories: val =>
    set(s => ({
      categories: typeof val === 'function' ? val(s.categories) : val,
    })),
  setSelectedCategory: val => set({selectedCategory: val}),
  setHomeReloadKey: val =>
    set(s => ({
      homeReloadKey: typeof val === 'function' ? val(s.homeReloadKey) : val,
    })),

  setActiveItem: val => set({activeItem: val}),
  setCreateCategoryModalVisible: val =>
    set({createCategoryModalVisible: val}),
  setAddToCategoryModalVisible: val =>
    set({addToCategoryModalVisible: val}),
}));