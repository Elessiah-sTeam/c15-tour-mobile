import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import MapView, { Polyline, Marker, UrlTile } from "react-native-maps";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { RoutePoint } from "@/utils/navigationUtils";
import { fetchRouteToStart, RouteToStartResult, Waypoint } from "@/services/osrmService";

export default function RoutePreviewScreen() {
    const mapRef = useRef<MapView | null>(null);

    const { routeCode, tourId, coordinates, steps, totalDistance, totalDuration, isOrganiser, organiserToken, waypoints, segments } =
        useLocalSearchParams<{
            routeCode: string;
            tourId: string;
            coordinates: string;
            steps: string;
            totalDistance: string;
            totalDuration: string;
            isOrganiser: string;
            organiserToken: string;
            waypoints: string;
            segments: string;
        }>();

    const route: RoutePoint[] = JSON.parse(coordinates ?? "[]");
    const parsedWaypoints: Waypoint[] = JSON.parse(waypoints ?? "[]");
    // Exclure le premier (départ) et le dernier (arrivée) déjà affichés par les marqueurs vert/rouge
    const intermediateWaypoints = parsedWaypoints.slice(1, -1);
    const parsedTourId = parseInt(tourId ?? "0");
    const parsedDistance = parseFloat(totalDistance ?? "0");
    const parsedDuration = parseFloat(totalDuration ?? "0");

    const [isLoadingStart, setIsLoadingStart] = useState(false);
    const [userLocation, setUserLocation] = useState<RoutePoint | null>(null);

    // Récupérer la position utilisateur au chargement
    useEffect(() => {
        const getLocation = async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") return;

            try {
                const loc = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                });
                setUserLocation({
                    latitude: loc.coords.latitude,
                    longitude: loc.coords.longitude,
                });
            } catch (e) {
                console.warn("Impossible de récupérer la position:", e);
            }
        };
        getLocation();
    }, []);

    // Centrer la carte sur le trajet complet une fois la route disponible
    useEffect(() => {
        if (route.length > 0 && mapRef.current) {
            mapRef.current.fitToCoordinates(route, {
                edgePadding: { top: 60, right: 40, bottom: 160, left: 40 },
                animated: true,
            });
        }
    }, [mapRef.current]);

    const handleEnRoute = async () => {
        if (!userLocation) {
            // Pas de position — partir directement sans trajet jusqu'au départ
            router.push({
                pathname: "/map",
                params: {
                    tourId: parsedTourId,
                    coordinates,
                    steps,
                    totalDistance,
                    totalDuration,
                    waypoints: waypoints ?? "[]",
                    segments: segments ?? "[]",
                    routeStartIndex: "0",
                    routeToStart: "[]",
                    routeToStartSteps: "[]",
                    isOrganiser: isOrganiser ?? "false",
                    organiserToken: organiserToken ?? "",
                    routeCode: routeCode ?? "",
                },
            });
            return;
        }

        setIsLoadingStart(true);

        const routeToStartResult: RouteToStartResult | null = await fetchRouteToStart(parsedTourId, userLocation);

        setIsLoadingStart(false);

        const routeToStartCoords = routeToStartResult?.coordinates ?? [];
        const routeToStartSteps = routeToStartResult?.steps ?? [];

        let finalCoordinates: RoutePoint[];

        if (routeToStartCoords.length > 0) {
            // Concaténer : trajet jusqu'au départ + trajet principal (sans doublon)
            finalCoordinates = [...routeToStartCoords, ...route.slice(1)];
        } else {
            // Pas de trajet vers le départ, partir directement depuis le trajet principal
            finalCoordinates = route;
        }

        router.push({
            pathname: "/map",
            params: {
                tourId: parsedTourId,
                coordinates: JSON.stringify(finalCoordinates),
                steps,
                totalDistance,
                totalDuration,
                waypoints: waypoints ?? "[]",
                segments: segments ?? "[]",
                routeStartIndex: routeToStartCoords.length > 0
                    ? String(routeToStartCoords.length - 1)
                    : "0",
                routeToStart: routeToStartCoords.length > 0
                    ? JSON.stringify(routeToStartCoords)
                    : "[]",
                routeToStartSteps: routeToStartSteps.length > 0
                    ? JSON.stringify(routeToStartSteps)
                    : "[]",
                isOrganiser: isOrganiser ?? "false",
                organiserToken: organiserToken ?? "",
                routeCode: routeCode ?? "",
            },
        });
    };

    const distanceText = parsedDistance < 1
        ? `${Math.round(parsedDistance * 1000)} m`
        : `${parsedDistance.toFixed(1)} km`;

    const durationText = parsedDuration < 60
        ? `${Math.round(parsedDuration)} min`
        : `${Math.floor(parsedDuration / 60)}h${Math.round(parsedDuration % 60).toString().padStart(2, "0")}`;

    return (
        <View style={styles.container}>
            <MapView
                ref={mapRef}
                style={styles.map}
                showsUserLocation={false}
            >
                <UrlTile
                    urlTemplate="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    maximumZ={19}
                />

                {route.length > 0 && (
                    <>
                        <Polyline
                            coordinates={route}
                            strokeColor="#BB487C"
                            strokeWidth={5}
                        />
                        {/* Marqueur de départ */}
                        <Marker
                            coordinate={route[0]}
                            title="Départ"
                            pinColor="green"
                        />
                        {/* Étapes intermédiaires */}
                        {intermediateWaypoints.map((wp, index) => (
                            <Marker
                                key={`wp-${index}`}
                                coordinate={{ latitude: wp.latitude, longitude: wp.longitude }}
                                title={wp.name}
                                pinColor="orange"
                            />
                        ))}
                        {/* Marqueur d'arrivée */}
                        <Marker
                            coordinate={route[route.length - 1]}
                            title="Arrivée"
                            pinColor="red"
                        />
                    </>
                )}
            </MapView>

            {/* Bouton retour */}
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>

            {/* Panneau du bas */}
            <View style={styles.bottomPanel}>
                <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Distance</Text>
                        <Text style={styles.statValue}>{distanceText}</Text>
                    </View>
                    <View style={styles.separator} />
                    <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Durée estimée</Text>
                        <Text style={styles.statValue}>{durationText}</Text>
                    </View>
                </View>

                <TouchableOpacity
                    style={[styles.button, isLoadingStart && styles.buttonDisabled]}
                    onPress={handleEnRoute}
                    disabled={isLoadingStart}
                >
                    {isLoadingStart ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.buttonText}>EN ROUTE !</Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    map: {
        flex: 1,
    },
    backButton: {
        position: "absolute",
        top: 50,
        left: 15,
        backgroundColor: "#BB487C",
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: "center",
        alignItems: "center",
        elevation: 5,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        zIndex: 1000,
    },
    bottomPanel: {
        backgroundColor: "#fff",
        padding: 20,
        paddingBottom: 36,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        elevation: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
    },
    statsRow: {
        flexDirection: "row",
        justifyContent: "space-around",
        marginBottom: 20,
    },
    statBox: {
        alignItems: "center",
        flex: 1,
    },
    separator: {
        width: 1,
        backgroundColor: "#eee",
        marginVertical: 4,
    },
    statLabel: {
        fontSize: 12,
        color: "#999",
        marginBottom: 4,
    },
    statValue: {
        fontSize: 22,
        fontWeight: "700",
        color: "#BB487C",
    },
    button: {
        backgroundColor: "#BB487C",
        borderRadius: 30,
        paddingVertical: 16,
        alignItems: "center",
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    buttonText: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "700",
        letterSpacing: 1,
    },
});