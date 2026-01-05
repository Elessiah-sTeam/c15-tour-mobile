import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Platform } from "react-native";
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
        { latitude: 47.238055, longitude: -1.508867 },   // arrivée
    ]);

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
                showsUserLocation={true}
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
            </MapView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    map: { flex: 1 },
});
