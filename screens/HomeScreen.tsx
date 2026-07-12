import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Image,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import Modal from "react-native-modal";
import { router } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { fetchRouteByCode, joinAsOrganiser } from "@/services/osrmService";

export default function HomeScreen() {
  const [isModalVisible, setModalVisible] = useState(false);
  const [itineraire, setItineraire] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isScannerOpen, setScannerOpen] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();

  const toggleModal = () => {
    setModalVisible(!isModalVisible);
    setScannerOpen(false);
    setHasScanned(false);
  };

  const handleOpenScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert("Permission refusée", "L'accès à la caméra est nécessaire pour scanner le QR code.");
        return;
      }
    }
    setHasScanned(false);
    setScannerOpen(true);
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (hasScanned) return;
    setHasScanned(true);
    setScannerOpen(false);
    setItineraire(data.trim());
  };

  const handleSubmit = async () => {
    const code = itineraire.trim();

    if (code.length === 0) {
      Alert.alert("Code requis", "Veuillez entrer un code d'itinéraire");
      return;
    }

    setIsLoading(true);

    // Tester d'abord si c'est un code organisateur
    const organiserToken = await joinAsOrganiser(code);

    if (organiserToken) {
      // Mode organisateur
      const result = await fetchRouteByCode(code);
      setIsLoading(false);

      if (!result.coordinates || !result.tourId) {
        Alert.alert("Erreur", "Impossible de charger l'itinéraire organisateur.");
        return;
      }

      setModalVisible(false);
      setItineraire("");

      router.push({
        pathname: "/route-preview",
        params: {
          tourId: result.tourId,
          coordinates: JSON.stringify(result.coordinates),
          steps: JSON.stringify(result.steps ?? []),
          totalDistance: result.totalDistance ?? 0,
          totalDuration: result.totalDuration ?? 0,
          waypoints: JSON.stringify(result.waypoints ?? []),
          segments: JSON.stringify(result.segments ?? []),
          isOrganiser: "true",
          organiserToken,
          routeCode: code,
        }
      });
      return;
    }

    // Mode participant normal
    const result = await fetchRouteByCode(code);
    setIsLoading(false);

    if (!result.coordinates || !result.tourId) {
      let errorMessage = "";
      if (result.error === 'not_found') {
        errorMessage = "Code d'itinéraire invalide. Veuillez vérifier le code et réessayer.";
      } else if (result.error === 'network') {
        errorMessage = "Erreur de connexion. Vérifiez votre connexion internet.";
      } else {
        errorMessage = "Erreur lors du chargement de l'itinéraire.";
      }
      Alert.alert("Erreur", errorMessage);
      return;
    }

    setModalVisible(false);
    setItineraire("");

    router.push({
      pathname: "/route-preview",
      params: {
        tourId: result.tourId,
        coordinates: JSON.stringify(result.coordinates),
        steps: JSON.stringify(result.steps ?? []),
        totalDistance: result.totalDistance ?? 0,
        totalDuration: result.totalDuration ?? 0,
        waypoints: JSON.stringify(result.waypoints ?? []),
        segments: JSON.stringify(result.segments ?? []),
        isOrganiser: "false",
        organiserToken: "",
        routeCode: code,
      }
    });
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

        <TouchableOpacity style={styles.button} onPress={toggleModal}>
          <Text style={styles.buttonText}>CHARGER UN ITINÉRAIRE</Text>
        </TouchableOpacity>

        <Modal
            isVisible={isModalVisible}
            onBackdropPress={toggleModal}
            style={styles.modal}
            swipeDirection="down"
            onSwipeComplete={toggleModal}
            avoidKeyboard
        >
          <View style={styles.modalContent}>
            <View style={styles.handle} />

            <Text style={styles.modalTitle}>CHARGER UN ITINÉRAIRE</Text>

            {isScannerOpen ? (
              <View style={styles.scannerContainer}>
                <CameraView
                  style={styles.camera}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={handleBarcodeScanned}
                />
                <View style={styles.scannerOverlay}>
                  <View style={styles.scannerFrame} />
                </View>
                <TouchableOpacity style={styles.cancelScanButton} onPress={() => setScannerOpen(false)}>
                  <Ionicons name="close-circle" size={36} color="white" />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.inputRow}>
                  <TextInput
                      style={styles.input}
                      value={itineraire}
                      onChangeText={setItineraire}
                      placeholder="Code de l'itinéraire"
                      placeholderTextColor="#bbb"
                      autoCapitalize="none"
                  />
                  <TouchableOpacity style={styles.cameraButton} onPress={handleOpenScanner}>
                    <Ionicons name="qr-code-outline" size={24} color="#C02C6C" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={[styles.submitButton, isLoading && { opacity: 0.6 }]}
                    onPress={handleSubmit}
                    disabled={isLoading}
                >
                  {isLoading
                      ? <ActivityIndicator color="#C02C6C" />
                      : <Text style={styles.submitButtonText}>EN ROUTE !</Text>
                  }
                </TouchableOpacity>
              </>
            )}
          </View>
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
  inputRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 25,
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#C02C6C',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 20,
    fontSize: 16,
  },
  cameraButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#C02C6C',
    alignItems: 'center',
    justifyContent: 'center',
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
  scannerContainer: {
    width: '100%',
    height: 280,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  scannerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerFrame: {
    width: 180,
    height: 180,
    borderWidth: 2,
    borderColor: '#C02C6C',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  cancelScanButton: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
});
