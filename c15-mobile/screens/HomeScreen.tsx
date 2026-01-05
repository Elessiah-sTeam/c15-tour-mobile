import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Image,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import Modal from "react-native-modal";
import { router } from "expo-router";

export default function HomeScreen() {
    const [isModalVisible, setModalVisible] = useState(false);
    const [itineraire, setItineraire] = useState("");

  const toggleModal = () => setModalVisible(!isModalVisible);
  const handleSubmit = () => {
    if (itineraire.trim().length > 0) {
      setModalVisible(false);
      router.push("/map");
    }
  };

  return (
    <ImageBackground
      source={require("../assets/background.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.logoContainer}>
          <Image
            source={require("../assets/logo.png")}
            resizeMode="contain"
          />
      </View>

      {/* Bouton */}
      <TouchableOpacity style={styles.button} onPress={toggleModal}>
        <Text style={styles.buttonText}>CHARGER UN ITINÉRAIRE</Text>
      </TouchableOpacity>

      <Modal
          isVisible={isModalVisible}
          onBackdropPress={toggleModal}
          style={styles.modal}
          swipeDirection="down"
          onSwipeComplete={toggleModal}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalContent}
          >
            <View style={styles.handle} />

            <Text style={styles.modalTitle}>CHARGER UN ITINÉRAIRE</Text>

            <TextInput
              style={styles.input}
              value={itineraire}
              onChangeText={setItineraire}
            />

            <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
              <Text style={styles.submitButtonText}>EN ROUTE !</Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
      </Modal>
    </ImageBackground>
  );
}
const styles = StyleSheet.create({
  background: {
    flex: 1,
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 60,
  },

  logoContainer: {
    marginTop: 80,
    alignItems: "center",
    flexDirection: "row",
  },

  logoText: {
    fontSize: 48,
    color: "#FFFFFF",
    fontWeight: "700",
  },

  logoNumber: {
    fontSize: 48,
    color: "#FFFFFF",
    fontWeight: "700",
    marginLeft: 5,
  },

  logoExclamation: {
    fontSize: 48,
    color: "#FFFFFF",
    fontWeight: "700",
    marginLeft: 5,
  },

  button: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 30,
    marginBottom: 40,
  },

  buttonText: {
    color: "#C02C6C",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 1,
  },
  modal: {
      justifyContent: 'flex-end',
      margin: 0,
    },
    modalContent: {
      backgroundColor: '#fff',
      padding: 30,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      alignItems: 'center',
      minHeight: '40%',
    },
    handle: {
      width: 50,
      height: 5,
      backgroundColor: '#ccc',
      borderRadius: 3,
      marginBottom: 20,
    },
    modalTitle: {
      fontSize: 20,
      color: '#C02C6C',
      fontWeight: '700',
      marginBottom: 15,
    },
    input: {
      width: '100%',
      borderWidth: 1,
      borderColor: '#C02C6C',
      borderRadius: 25,
      paddingVertical: 12,
      paddingHorizontal: 20,
      marginBottom: 25,
      fontSize: 16,
    },
    submitButton: {
      backgroundColor: '#fff',
      borderWidth: 1,
      borderColor: '#C02C6C',
      borderRadius: 25,
      paddingVertical: 14,
      width: '60%',
      alignItems: 'center',
    },
    submitButtonText: {
      color: '#C02C6C',
      fontWeight: '700',
      fontSize: 20,
    },
});