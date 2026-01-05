import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Image, TouchableOpacity, Text } from "react-native";
import MapView, { Marker, Polyline, UrlTile, Region } from "react-native-maps";
import * as Location from "expo-location";

export default function MapScreen() {
    const mapRef = useRef<MapView | null>(null);

    // 1️⃣ Region contrôlée par la position GPS
    const [region, setRegion] = useState<Region | null>(null);

    // 2️⃣ Position utilisateur (pour marker rouge)
    const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

    // 3️⃣ Itinéraire (polyline)
    const [route, setRoute] = useState([
        { latitude: 47.240227 , longitude: -1.512108 }, // départ
        { latitude: 47.239347 , longitude: -1.512600 },   // point intermédiaire
        { latitude: 47.241208, longitude: -1.509439 },   // arrivée
    ]);

    const [heading, setHeading] = useState(0);

    // 4️⃣ Récupérer la position initiale de l'utilisateur et permission GPS
    useEffect(() => {
        const initLocation = async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") {
                console.log("Permission GPS refusée");
                return;
            }

            const loc = await Location.getCurrentPositionAsync({});
            const { latitude, longitude } = loc.coords;

            setRegion({
                latitude,
                longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
            });

            setUserLocation({ latitude, longitude });
        };

        initLocation();
    }, []);

    // 5️⃣ Suivi GPS en temps réel
    useEffect(() => {
        let subscription: Location.LocationSubscription;

        const startWatching = async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") return;

            subscription = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.Highest,
                    distanceInterval: 5, // mettre à jour toutes les 5 mètres
                },
                (pos) => {
                    const { latitude, longitude } = pos.coords;
                    setUserLocation({ latitude, longitude });

                    // recentrer la carte sur l'utilisateur
                    if (mapRef.current) {
                        if (mapRef.current instanceof MapView) {
                            mapRef.current.animateCamera({center: {latitude, longitude}});
                        }
                    }
                }
            );
        };

        startWatching();

        return () => subscription?.remove();
    }, []);

    // 🔹 Suivi direction (heading)
    useEffect(() => {
        let headingSubscription: any = null;

        const startHeading = async () => {
            headingSubscription = await Location.watchHeadingAsync((headingObj) => {
                setHeading(headingObj.trueHeading); // rotation en degrés
            });
        };

        startHeading();

        return () => headingSubscription?.remove();
    }, []);

    // 6️⃣ Afficher MapView seulement quand region est définie
    if (!region) {
        return <View style={styles.container} />; // écran vide en attendant la GPS
    }

    return (
        <View style={styles.container}>
            <MapView
                ref={mapRef}
                style={styles.map}
                region={region}
                showsUserLocation={false}
            >
                {/* Tuiles OpenStreetMap */}
                <UrlTile
                    urlTemplate="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    maximumZ={19}
                />

                {/* Polyline pour l’itinéraire */}
                <Polyline coordinates={route} strokeColor="blue" strokeWidth={4} />

                {/* Marker départ */}
                <Marker coordinate={route[0]} title="Départ" />

                {/* Marker arrivée */}
                <Marker coordinate={route[route.length - 1]} title="Arrivée" />

                {userLocation && (
                    <Marker
                        coordinate={userLocation}
                        anchor={{ x: 0.5, y: 0.5 }} // centre de l'image
                        rotation={heading}          // angle en degrés
                        flat={true}                 // rotation appliquée
                    >
                        <Image
                            source={require("../assets/fleche.png")}
                            style={{ width: 40, height: 40 }}
                        />
                    </Marker>
                )}
            </MapView>
            {userLocation && (
                <TouchableOpacity
                    style={styles.recenterButton}
                    onPress={() => {
                        if (!userLocation) return;
                        mapRef.current?.animateCamera({
                            center: userLocation,
                            pitch: 0,
                            heading: 0,
                            altitude: 1000,
                            zoom: 17,
                        });
                    }}
                >
                    <Text style={{ color: "white", fontWeight: "bold" }}>Recentrer</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    map: { flex: 1 },
    recenterButton: {
        position: "absolute",
        bottom: 20,
        right: 20,
        backgroundColor: "#C02C6C",
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 30,
        elevation: 5, // Android shadow
        shadowColor: "#000", // iOS shadow
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
    },
});
