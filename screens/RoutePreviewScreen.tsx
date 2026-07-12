import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { Map as MapView, Camera, GeoJSONSource, Layer, type CameraRef } from "@maplibre/maplibre-react-native";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { RoutePoint } from "@/utils/navigationUtils";
import { fetchRouteToStart, RouteToStartResult, Waypoint } from "@/services/osrmService";
import { MAP_STYLE_URL, routeToLineString, computeBounds } from "@/utils/mapConfig";
import { MapPin } from "@/components/MapPin";

export default function RoutePreviewScreen() {
    const cameraRef = useRef<CameraRef>(null);

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

    const route: RoutePoint[] = useMemo(() => JSON.parse(coordinates ?? "[]"), [coordinates]);
    const parsedWaypoints: Waypoint[] = useMemo(() => JSON.parse(waypoints ?? "[]"), [waypoints]);
    // Exclure le premier (départ) et le dernier (arrivée) déjà affichés par les marqueurs vert/rouge
    const intermediateWaypoints = useMemo(() => parsedWaypoints.slice(1, -1), [parsedWaypoints]);
    const routeLine = useMemo(() => routeToLineString(route), [route]);
    const routeBounds = useMemo(() => computeBounds(route), [route]);
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

    // Centrer la carte sur le trajet complet une fois la carte prête
    const handleMapReady = () => {
        if (routeBounds) {
            cameraRef.current?.fitBounds(routeBounds, {
                padding: { top: 80, right: 50, bottom: 200, left: 50 },
                duration: 600,
            });
        }
    };

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
                style={styles.map}
                mapStyle={MAP_STYLE_URL}
                onDidFinishLoadingMap={handleMapReady}
                attributionPosition={{ bottom: 180, left: 8 }}
                compassPosition={{ top: 60, right: 12 }}
            >
                <Camera ref={cameraRef} />

                {route.length > 0 && (
                    <>
                        <GeoJSONSource id="route" data={routeLine}>
                            <Layer
                                id="route-line"
                                type="line"
                                layout={{ "line-cap": "round", "line-join": "round" }}
                                paint={{ "line-color": "#BB487C", "line-width": 5 }}
                            />
                        </GeoJSONSource>

                        {/* Marqueur de départ */}
                        <MapPin id="depart" point={route[0]} color="#2E7D32" label="Départ" />

                        {/* Étapes intermédiaires */}
                        {intermediateWaypoints.map((wp, index) => (
                            <MapPin
                                key={`wp-${index}`}
                                id={`wp-${index}`}
                                point={{ latitude: wp.latitude, longitude: wp.longitude }}
                                color="#F57C00"
                                label={wp.name}
                                size={30}
                            />
                        ))}

                        {/* Marqueur d'arrivée */}
                        <MapPin id="arrivee" point={route[route.length - 1]} color="#C62828" label="Arrivée" />
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