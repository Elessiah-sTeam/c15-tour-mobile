import React, { useEffect, useRef, useState } from "react";
import { View, Image, TouchableOpacity, Text } from "react-native";
import MapView, { Marker, Polyline, UrlTile, Region } from "react-native-maps";
import * as Location from "expo-location";

// Imports
import { mapStyles } from "@/styles/MapStyles";
import { fetchRouteFromOSRM } from "@/services/osrmService";
import {
    RoutePoint,
    NavigationInstruction as NavigationInstructionType,
    calculateBearing,
    smoothHeading,
    findClosestRoutePoint,
    calculateRemainingDistance,
    getNavigationInstruction,
    checkIfOffRoute,
} from "@/utils/navigationUtils";
import { NavigationStats } from "@/components/NavigationStats";
import { NavigationInstruction } from "@/components/NavigationInstruction";
import { LoadingScreen } from "@/components/LoadingScreen";

interface NavigationStats {
    speed: number;
    remainingDistance: number;
    estimatedTime: number;
    averageSpeed: number;
}

export default function MapScreen() {
    const mapRef = useRef<MapView | null>(null);

    // États de base
    const [region, setRegion] = useState<Region | null>(null);
    const [userLocation, setUserLocation] = useState<RoutePoint | null>(null);
    const [heading, setHeading] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    // Itinéraire
    const [route, setRoute] = useState<RoutePoint[]>([]);
    const [destination, setDestination] = useState<RoutePoint>({
        latitude: 47.241208,
        longitude: -1.509439,
    });

    // États de navigation
    const [currentRouteIndex, setCurrentRouteIndex] = useState(0);
    const [isOffRoute, setIsOffRoute] = useState(false);
    const [isRecalculating, setIsRecalculating] = useState(false);
    const [navigationStats, setNavigationStats] = useState<NavigationStats>({
        speed: 0,
        remainingDistance: 0,
        estimatedTime: 0,
        averageSpeed: 0,
    });
    const [nextInstruction, setNextInstruction] = useState<NavigationInstructionType | null>(null);

    // Historique et filtres
    const speedHistory = useRef<number[]>([]);
    const MAX_SPEED_HISTORY = 10;
    const previousLocation = useRef<RoutePoint | null>(null);
    const smoothedHeading = useRef<number>(0);
    const SMOOTHING_FACTOR = 0.15;

    // Récupérer le trajet depuis OSRM
    const fetchRoute = async (start: RoutePoint, end: RoutePoint): Promise<boolean> => {
        const coordinates = await fetchRouteFromOSRM(start, end);
        if (coordinates) {
            setRoute(coordinates);
            return true;
        }
        return false;
    };

    // Recalculer le trajet
    const recalculateRoute = async (currentPos: RoutePoint) => {
        if (isRecalculating) return;

        setIsRecalculating(true);
        const success = await fetchRoute(currentPos, destination);
        setIsRecalculating(false);
        if (success) {
            setIsOffRoute(false);
        }
    };

    // Mettre à jour la vitesse moyenne
    const updateAverageSpeed = (currentSpeed: number): number => {
        speedHistory.current.push(currentSpeed);
        if (speedHistory.current.length > MAX_SPEED_HISTORY) {
            speedHistory.current.shift();
        }

        const sum = speedHistory.current.reduce((acc, speed) => acc + speed, 0);
        return speedHistory.current.length > 0 ? sum / speedHistory.current.length : 0;
    };

    // 1️⃣ Initialisation
    useEffect(() => {
        const initLocation = async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") {
                console.log("Permission GPS refusée");
                setIsLoading(false);
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

            // Récupérer le trajet
            const success = await fetchRoute({ latitude, longitude }, destination);

            if (!success) {
                console.error("Impossible de calculer le trajet");
            }

            setIsLoading(false);
        };

        initLocation();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // 2️⃣ Suivi GPS en temps réel
    useEffect(() => {
        if (route.length === 0) return;

        let subscription: Location.LocationSubscription;

        const startWatching = async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") return;

            subscription = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.BestForNavigation,
                    timeInterval: 1000,
                    distanceInterval: 5,
                },
                (pos) => {
                    const { latitude, longitude, speed: currentSpeedMps } = pos.coords;
                    const newPosition = { latitude, longitude };
                    setUserLocation(newPosition);

                    // Calculer la direction de déplacement
                    if (previousLocation.current && currentSpeedMps && currentSpeedMps > 0.5) {
                        const movementHeading = calculateBearing(
                            previousLocation.current.latitude,
                            previousLocation.current.longitude,
                            latitude,
                            longitude
                        );

                        smoothedHeading.current = smoothHeading(
                            smoothedHeading.current,
                            movementHeading,
                            SMOOTHING_FACTOR
                        );
                        setHeading(smoothedHeading.current);
                    }
                    previousLocation.current = newPosition;

                    // Vitesse
                    const speedKmh = currentSpeedMps ? currentSpeedMps * 3.6 : 0;

                    // Point le plus proche
                    const closestIndex = findClosestRoutePoint(newPosition, route);
                    setCurrentRouteIndex(closestIndex);

                    // Distance restante
                    const distanceLeft = calculateRemainingDistance(newPosition, route, closestIndex);

                    // Vitesse moyenne
                    const avgSpeed = updateAverageSpeed(speedKmh);

                    // Temps estimé
                    const effectiveSpeed = avgSpeed > 5 ? avgSpeed : 30;
                    const timeLeft = (distanceLeft / effectiveSpeed) * 60;

                    // Vérifier si hors trajet
                    const offRoute = checkIfOffRoute(newPosition, route);
                    if (offRoute && !isOffRoute && !isRecalculating) {
                        setIsOffRoute(true);
                        recalculateRoute(newPosition);
                    } else if (!offRoute && isOffRoute) {
                        setIsOffRoute(false);
                    }

                    // Instruction suivante
                    const nextIndex = closestIndex < route.length - 1 ? closestIndex + 1 : closestIndex;
                    const instruction = getNavigationInstruction(newPosition, closestIndex, nextIndex, route);
                    setNextInstruction(instruction);

                    // Stats
                    setNavigationStats({
                        speed: Math.round(speedKmh),
                        remainingDistance: distanceLeft,
                        estimatedTime: Math.round(timeLeft),
                        averageSpeed: Math.round(avgSpeed),
                    });

                    // Recentrer
                    if (mapRef.current) {
                        mapRef.current.animateCamera({
                            center: { latitude, longitude },
                            zoom: 17,
                        });
                    }
                }
            );
        };

        startWatching();

        return () => subscription?.remove();
    }, [route, isOffRoute, isRecalculating]);

    // 3️⃣ Suivi de la direction (boussole - backup)
    useEffect(() => {
        let headingSubscription: any = null;

        const startHeading = async () => {
            const hasHeading = await Location.hasServicesEnabledAsync();
            if (!hasHeading) return;

            try {
                headingSubscription = await Location.watchHeadingAsync((headingObj) => {
                    const newHeading =
                        headingObj.magHeading !== -1 ? headingObj.magHeading : headingObj.trueHeading;

                    if (newHeading >= 0 && newHeading <= 360) {
                        smoothedHeading.current = smoothHeading(
                            smoothedHeading.current,
                            newHeading,
                            SMOOTHING_FACTOR
                        );
                        setHeading(smoothedHeading.current);
                    }
                });
            } catch (error) {
                console.log("Erreur heading:", error);
            }
        };

        startHeading();

        return () => headingSubscription?.remove();
    }, []);

    // Afficher le loader pendant le chargement initial
    if (isLoading || !region) {
        return <LoadingScreen message="Chargement de la carte..." />;
    }

    return (
        <View style={mapStyles.container}>
            <MapView ref={mapRef} style={mapStyles.map} region={region} showsUserLocation={false}>
                <UrlTile urlTemplate="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} />

                {route.length > 0 && (
                    <>
                        <Polyline
                            coordinates={route}
                            strokeColor={isOffRoute ? "orange" : "#BB487C"}
                            strokeWidth={10}
                        />
                        <Marker coordinate={route[route.length - 1]} title="Arrivée" pinColor="red" />
                    </>
                )}

                {userLocation && (
                    <Marker
                        coordinate={userLocation}
                        anchor={{ x: 0.5, y: 0.5 }}
                        rotation={heading}
                        flat
                        image={require("../assets/fleche.png")}
                    />
                )}
            </MapView>

            {/* Instructions de navigation */}
            <NavigationInstruction instruction={nextInstruction} />

            {/* Statistiques de navigation */}
            <NavigationStats
                speed={navigationStats.speed}
                remainingDistance={navigationStats.remainingDistance}
                estimatedTime={navigationStats.estimatedTime}
                isRecalculating={isRecalculating}
            />

            {/* Bouton recentrer */}
            {userLocation && (
                <TouchableOpacity
                    style={mapStyles.recenterButton}
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
                    <Text style={{ color: "white", fontWeight: "bold", fontSize: 20 }}>📍</Text>
                </TouchableOpacity>
            )}

            {/* Alerte hors trajet - Affiche automatiquement le statut */}
            {isOffRoute && (
                <View style={mapStyles.offRouteAlert}>
                    <Text style={mapStyles.offRouteText}>
                        {isRecalculating ? "⏳ Recalcul du trajet en cours..." : "⚠️ Hors trajet"}
                    </Text>
                </View>
            )}
        </View>
    );
}