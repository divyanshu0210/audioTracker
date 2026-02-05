import React, {useEffect, useState} from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import {fetchNotebooks} from '../../database/R';
import Icon from 'react-native-vector-icons/MaterialIcons';

const SelectNotebookModal = ({
  visible,
  onClose,
  onSelect,
  selectedNotebookId,
}) => {
  const [notebooks, setNotebooks] = useState([]);
  const [chosenNotebookId, setChosenNotebookId] = useState(null);
  const [scaleValue] = useState(new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      Animated.timing(scaleValue, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      
      fetchNotebooks(allNotebooks => {
        const sorted = allNotebooks.sort((a, b) => {
          if (String(a.id) === String(selectedNotebookId)) return -1;
          if (String(b.id) === String(selectedNotebookId)) return 1;
          return 0;
        });
        setNotebooks(sorted);
        setChosenNotebookId(null);
      });
    } else {
      scaleValue.setValue(0);
    }
  }, [visible, selectedNotebookId]);

  const handleChoose = (notebookId) => {
    // Toggle selection - if clicking the already chosen notebook, deselect it
    setChosenNotebookId(prevId => prevId === notebookId ? null : notebookId);
  };

  const handleMove = () => {
    if (chosenNotebookId && chosenNotebookId !== selectedNotebookId) {
      onSelect(chosenNotebookId);
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      >
      <View style={styles.modalOverlay}>
        <Animated.View 
          style={[
            styles.modalContainer,
            {
              transform: [{ scale: scaleValue }],
              opacity: scaleValue
            }
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Select Notebook</Text>
            <TouchableOpacity onPress={()=>{onClose()}} style={styles.closeButton}>
              <Icon name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.notebookListContainer}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {notebooks.map(notebook => {
                const isSelected = String(notebook.id) === String(selectedNotebookId);
                const isChosen = notebook.id === chosenNotebookId;

                return (
                  <TouchableOpacity
                    key={notebook.id}
                    style={[
                      styles.notebookItem,
                      isSelected && styles.selectedNotebookItem,
                      isChosen && styles.chosenNotebookItem,
                    ]}
                    disabled={isSelected}
                    onPress={() => handleChoose(notebook.id)}
                  >
                    <View
                      style={[
                        styles.colorCircle,
                        {backgroundColor: notebook.color || '#6200ee'},
                      ]}
                    />
                    <Text
                      style={[
                        styles.notebookText,
                        isSelected && styles.selectedNotebookText,
                      ]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {notebook.name}
                    </Text>

                    {isSelected ? (
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>Current</Text>
                      </View>
                    ) : isChosen ? (
                      <Icon
                        name="check-circle"
                        size={24}
                        color="#4CAF50"
                        style={styles.checkIcon}
                      />
                    ) : (
                      <Icon
                        name="chevron-right"
                        size={24}
                        color="#ccc"
                        style={styles.arrowIcon}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity 
              onPress={handleMove}
              disabled={!chosenNotebookId || chosenNotebookId === selectedNotebookId}
              style={[
                styles.moveButton,
                (!chosenNotebookId || chosenNotebookId === selectedNotebookId) && 
                  styles.moveButtonDisabled
              ]}
            >
              <Text style={styles.moveButtonText}>Move to Notebook</Text>
              <Icon name="arrow-forward" size={20} color="white" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default SelectNotebookModal;

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 0,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  notebookListContainer: {
    maxHeight: '70%',
    paddingHorizontal: 16,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  notebookItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'white',
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  selectedNotebookItem: {
    backgroundColor: '#f0f7ff',
    borderColor: '#d0ebff',
  },
  chosenNotebookItem: {
    borderColor: '#4CAF50',
    backgroundColor: '#f0fff0',
  },
  colorCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  notebookText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    marginRight: 8,
  },
  selectedNotebookText: {
    fontWeight: '600',
    color: '#0066cc',
  },
  currentBadge: {
    backgroundColor: '#e6f2ff',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  currentBadgeText: {
    fontSize: 12,
    color: '#0066cc',
    fontWeight: '500',
  },
  checkIcon: {
    marginLeft: 8,
  },
  arrowIcon: {
    marginLeft: 8,
    opacity: 0.7,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  moveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6200ee',
    paddingVertical: 14,
    borderRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#6200ee',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  moveButtonDisabled: {
    backgroundColor: '#ccc',
    ...Platform.select({
      ios: {
        shadowColor: '#999',
      },
    }),
  },
  moveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
});