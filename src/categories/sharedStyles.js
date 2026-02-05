import { StyleSheet } from 'react-native';

export default StyleSheet.create({
  container: {
    flex: 1,
    // padding: 16,
    marginTop: 8,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  colorBar: {
    width: 8,
    height: '100%',
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  categoryContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  categoryName: {
    fontWeight: '600',
    fontSize: 14,
    color: '#000',
  },
  categoryEmail: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  selectedItem: {
    opacity: 0.7,
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  checkmark: {
    color: 'white',
    fontWeight: 'bold',
  },
  categoryList: {
    gap: 10,
  },
  moreCategoriesContainer: {
    paddingHorizontal: 8,
  },
  moreCategoriesText: {
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
  },
  emptyText: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
    textAlign: 'center',
    marginTop: 20,
    color: '#888',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
     fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  viewAll: {
    color: '#2196F3',
    fontWeight: '500',
    fontSize: 14,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#E3F2FD',
  },
  selectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f8f8f8',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  headerButton: {
    color: '#007AFF',
    fontSize: 16,
  },
  disabledButton: {
    color: '#ccc',
  },
  headerTitle: {
    fontWeight: 'bold',
    color: '#777',
  },
});