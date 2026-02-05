import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet } from "react-native";

const FeedbackModal = ({closeModal }) => {
  const [feedback, setFeedback] = useState("");

  const handleDeleteAccount = () => {
    Alert.alert("Confirm", "Are you sure you want to submit feedback?", [
      { text: "Cancel", style: "cancel" },
      { text: "Submit", onPress: () => console.log("Feedback Submitted"), style: "destructive" },
    ]);
  };

  return (
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.title}>Send Feedback</Text>
          <Text style={styles.subtitle}>Share your feedback, ideas, or any bugs you faced with us!</Text>
          <TextInput
            style={styles.input}
            placeholder="I would like to suggest..."
            multiline
            value={feedback}
            onChangeText={setFeedback}
          />
          <TouchableOpacity style={styles.submitButton} onPress={handleDeleteAccount}>
            <Text style={styles.submitText}>Submit Feedback</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeButton} onPress={closeModal}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    // flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    width: 300,
    backgroundColor: "white",
    padding: 20,
    borderRadius: 10,
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: 14,
    color: "gray",
    textAlign: "center",
    marginVertical: 10,
  },
  input: {
    width: "100%",
    height: 80,
    borderColor: "gray",
    borderWidth: 1,
    borderRadius: 5,
    padding: 10,
    marginBottom: 15,
    textAlignVertical: "top",
  },
  submitButton: {
    backgroundColor: "blue",
    padding: 10,
    borderRadius: 5,
    width: "100%",
    alignItems: "center",
  },
  submitText: {
    color: "white",
    fontWeight: "bold",
  },
  closeButton: {
    marginTop: 10,
  },
  closeText: {
    color: "blue",
  },
});

export default FeedbackModal;
