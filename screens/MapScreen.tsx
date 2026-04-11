import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, TouchableOpacity, Text } from "react-native";
import MapView, { Marker, Polyline, UrlTile, Region } from "react-native-maps";
import * as Location from "expo-location";
import { useLocalSearchParams, router } from "expo-router";

// Imports
import { mapStyles } from "@/styles/MapStyles";
import { fetchRouteByCode, fetchRouteFromOSRM } from "@/services/osrmService";
import {
    RoutePoint,
    NavigationInstruction as NavigationInstructionType,
    calculateBearing,
    smoothHeading,
    findClosestRoutePoint,
    calculateRemainingDistance,
    getNavigationInstruction,
    checkIfOffRoute,
    isValidGPSPosition,
    extractManeuverPoints,
    findNextInstruction,
} from "@/utils/navigationUtils";
import { NavigationStats } from "@/components/NavigationStats";
import { NavigationInstruction } from "@/components/NavigationInstruction";
import { LoadingScreen } from "@/components/LoadingScreen";

interface NavigationStatsInterface {
    speed: number;
    remainingDistance: number;
    estimatedTime: number;
    averageSpeed: number;
}


interface TurnOverlay {
    polylineCoords: RoutePoint[];
    arrowCoordinate: RoutePoint;
    arrowBearing: number;
    maneuverRouteIndex: number; // index dans route[] du point de manœuvre
}

const TURN_MANEUVER_TYPES = ['turn', 'roundabout', 'rotary', 'fork', 'end of road', 'ramp', 'exit roundabout'];

const computeTurnOverlays = (steps: any[], routePoints: RoutePoint[]): TurnOverlay[] => {
    if (!steps || steps.length < 2 || routePoints.length === 0) return [];

    const overlays: TurnOverlay[] = [];

    for (let i = 0; i < steps.length - 1; i++) {
        const step = steps[i];
        const nextStep = steps[i + 1];

        if (!TURN_MANEUVER_TYPES.includes(nextStep.maneuver?.type)) continue;

        const inCoords: RoutePoint[] = (step.geometry?.coordinates || []).map(
            (c: [number, number]) => ({ latitude: c[1], longitude: c[0] })
        );
        const outCoords: RoutePoint[] = (nextStep.geometry?.coordinates || []).map(
            (c: [number, number]) => ({ latitude: c[1], longitude: c[0] })
        );

        if (inCoords.length < 2 || outCoords.length < 2) continue;

        const maneuverPoint: RoutePoint = {
            latitude: nextStep.maneuver.location[1],
            longitude: nextStep.maneuver.location[0],
        };

        // Trouver l'index du point de manœuvre dans la route globale
        let minDist = Infinity;
        let maneuverRouteIndex = 0;
        routePoints.forEach((p, idx) => {
            const d = Math.abs(p.latitude - maneuverPoint.latitude) + Math.abs(p.longitude - maneuverPoint.longitude);
            if (d < minDist) { minDist = d; maneuverRouteIndex = idx; }
        });

        const inSlice = inCoords.slice(Math.max(0, inCoords.length - 3));
        const outSlice = outCoords.slice(0, Math.min(outCoords.length, 3));
        const polylineCoords = [...inSlice, maneuverPoint, ...outSlice];

        const arrowCoordinate = outCoords[Math.min(outCoords.length - 1, 2)];
        const arrowBearing = (Math.atan2(
            arrowCoordinate.longitude - maneuverPoint.longitude,
            arrowCoordinate.latitude - maneuverPoint.latitude
        ) * 180 / Math.PI + 360) % 360;

        overlays.push({ polylineCoords, arrowCoordinate, arrowBearing, maneuverRouteIndex });
    }

    return overlays;
};

export default function MapScreen() {
    const mapRef = useRef<MapView | null>(null);

    // Récupérer le code d'itinéraire
    const { routeCode } = useLocalSearchParams<{ routeCode: string }>();

    console.log("Code reçu:", routeCode);

    // États de base
    const [region, setRegion] = useState<Region | null>(null);
    const [userLocation, setUserLocation] = useState<RoutePoint | null>(null);
    const [heading, setHeading] = useState(0);
    const [smoothedHeadingState, setSmoothedHeadingState] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isMoving, setIsMoving] = useState(false);
    const lastUserInteraction = useRef<number>(0);

    // Itinéraire
    const [route, setRoute] = useState<RoutePoint[]>([]);
    const [destination, setDestination] = useState<RoutePoint | null>(null);
    const [navigationSteps, setNavigationSteps] = useState<any[]>([]);
    const [maneuverPoints, setManeuverPoints] = useState<any[]>([]);

    // États de navigation
    const [currentRouteIndex, setCurrentRouteIndex] = useState(0);
    const [isOffRoute, setIsOffRoute] = useState(false);
    const [isRecalculating, setIsRecalculating] = useState(false);
    const [navigationStats, setNavigationStats] = useState<NavigationStatsInterface>({
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

    // Overlays de virage — recalculés quand les steps ou la route changent
    const turnOverlays = useMemo(() => computeTurnOverlays(navigationSteps, route), [navigationSteps, route]);

    // Prochain virage devant l'utilisateur
    const nextTurnOverlay = useMemo(() => {
        return turnOverlays.find(o => o.maneuverRouteIndex > currentRouteIndex) ?? null;
    }, [turnOverlays, currentRouteIndex]);

    // Récupérer le trajet depuis ton API
    const fetchRouteByRouteCode = async (code: string): Promise<boolean> => {
        const result = await fetchRouteByCode(code);

        if (result.coordinates && result.coordinates.length > 0) {
            setRoute(result.coordinates);
            setDestination(result.coordinates[result.coordinates.length - 1]);

            if (result.steps && result.steps.length > 0) {
                setNavigationSteps(result.steps);
                const maneuvers = extractManeuverPoints(result.steps);
                setManeuverPoints(maneuvers);
                console.log("Points de manœuvre:", maneuvers);
            }

            return true;
        }

        // Gérer les erreurs et rediriger
        let errorMessage = "";
        if (result.error === 'not_found') {
            errorMessage = "Code d'itinéraire invalide. Veuillez vérifier le code et réessayer.";
        } else if (result.error === 'network') {
            errorMessage = "Erreur de connexion. Vérifiez votre connexion internet.";
        } else {
            errorMessage = "Erreur lors du chargement de l'itinéraire.";
        }

        alert(errorMessage);
        // Rediriger vers la page d'accueil après avoir fermé l'alerte
        setTimeout(() => {
            router.back();
        }, 100);

        return false;
    };

    // Récupérer le trajet depuis OSRM (pour recalcul)
    const fetchRouteFromOSRMForRecalc = async (start: RoutePoint, end: RoutePoint): Promise<boolean> => {
        const coordinates = await fetchRouteFromOSRM(start, end);
        if (coordinates) {
            setRoute(coordinates);
            // Réinitialiser les instructions et marqueurs car c'est un nouveau trajet
            setNavigationSteps([]);
            setManeuverPoints([]);
            setNextInstruction(null);
            return true;
        }
        return false;
    };

    // Recalculer le trajet
    const recalculateRoute = async (currentPos: RoutePoint) => {
        if (isRecalculating || !destination) return;
        setIsRecalculating(true);
        const success = await fetchRouteFromOSRMForRecalc(currentPos, destination);
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

    // Initialisation
    useEffect(() => {
        const initLocation = async () => {
            if (!routeCode) {
                console.error("Aucun code d'itinéraire fourni");
                alert("Aucun code d'itinéraire fourni");
                setIsLoading(false);
                return;
            }

            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== "granted") {
                    console.log("Permission GPS refusée");
                    setIsLoading(false);
                    return;
                }

                const hasLocation = await Location.hasServicesEnabledAsync();
                if (!hasLocation) {
                    console.error("Services de localisation désactivés");
                    setIsLoading(false);
                    return;
                }

                let latitude, longitude;

                try {
                    const loc = await Location.getCurrentPositionAsync({
                        accuracy: Location.Accuracy.Balanced
                    });
                    latitude = loc.coords.latitude;
                    longitude = loc.coords.longitude;
                    console.log("Position GPS réelle récupérée:", latitude, longitude);
                } catch (gpsError) {
                    console.warn("GPS non disponible, utilisation position par défaut:", gpsError);
                    latitude = 46.480716;
                    longitude = -1.761113;
                }

                setRegion({
                    latitude,
                    longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                });

                setUserLocation({ latitude, longitude });

                console.log("Chargement du trajet avec le code:", routeCode);
                const success = await fetchRouteByRouteCode(routeCode);

                if (!success) {
                    console.error("Impossible de charger l'itinéraire avec le code:", routeCode);
                }

                setIsLoading(false);
            } catch (error) {
                console.error("Erreur lors de l'initialisation:", error);
                setIsLoading(false);
            }
        };

        initLocation();
    }, [routeCode]);

    // Suivi GPS
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
                    distanceInterval: 0,
                },
                (pos) => {
                    const { latitude, longitude, speed: currentSpeedMps, accuracy } = pos.coords;
                    const newPosition = { latitude, longitude };

                    if (accuracy && accuracy > 100) {
                        console.log(`Position ignorée - précision très faible: ${accuracy}m`);
                        return;
                    }

                    if (previousLocation.current && !isValidGPSPosition(newPosition, previousLocation.current, 200)) {
                        console.log("Position ignorée - saut GPS très aberrant");
                        return;
                    }

                    setUserLocation(newPosition);

                    if (previousLocation.current && currentSpeedMps && currentSpeedMps > 0.5) {
                        setIsMoving(true);
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
                        setSmoothedHeadingState(smoothedHeading.current);
                    } else {
                        setIsMoving(false);
                    }
                    previousLocation.current = newPosition;

                    const speedKmh = currentSpeedMps ? currentSpeedMps * 3.6 : 0;
                    const closestIndex = findClosestRoutePoint(newPosition, route);
                    setCurrentRouteIndex(closestIndex);

                    const distanceLeft = calculateRemainingDistance(newPosition, route, closestIndex);
                    const avgSpeed = updateAverageSpeed(speedKmh);
                    const effectiveSpeed = avgSpeed > 5 ? avgSpeed : 30;
                    const timeLeft = (distanceLeft / effectiveSpeed) * 60;

                    const offRoute = checkIfOffRoute(newPosition, route);
                    if (offRoute && !isOffRoute && !isRecalculating) {
                        setIsOffRoute(true);
                        recalculateRoute(newPosition);
                    } else if (!offRoute && isOffRoute) {
                        setIsOffRoute(false);
                    }

                    let instruction: NavigationInstructionType | null = null;
                    if (navigationSteps.length > 0) {
                        instruction = findNextInstruction(newPosition, navigationSteps, route);
                    } else {
                        const nextIndex = closestIndex < route.length - 1 ? closestIndex + 1 : closestIndex;
                        instruction = getNavigationInstruction(newPosition, closestIndex, nextIndex, route);
                    }
                    setNextInstruction(instruction);

                    setNavigationStats({
                        speed: Math.round(speedKmh),
                        remainingDistance: distanceLeft,
                        estimatedTime: Math.round(timeLeft),
                        averageSpeed: Math.round(avgSpeed),
                    });

                    const timeSinceInteraction = Date.now() - lastUserInteraction.current;
                    if (mapRef.current && timeSinceInteraction > 5000) {
                        mapRef.current.animateCamera({
                            center: { latitude, longitude },
                            zoom: 17,
                            heading: smoothedHeading.current,
                            pitch: 45,
                        }, { duration: 300 });
                    }
                }
            );
        };

        startWatching();
        return () => subscription?.remove();
    }, [route, isOffRoute, isRecalculating, navigationSteps]);

    // Suivi boussole
    useEffect(() => {
        let headingSubscription: any = null;

        const startHeading = async () => {
            const hasHeading = await Location.hasServicesEnabledAsync();
            if (!hasHeading) return;

            try {
                headingSubscription = await Location.watchHeadingAsync((headingObj) => {
                    const newHeading = headingObj.magHeading !== -1 ? headingObj.magHeading : headingObj.trueHeading;

                    if (newHeading >= 0 && newHeading <= 360) {
                        smoothedHeading.current = smoothHeading(
                            smoothedHeading.current,
                            newHeading,
                            SMOOTHING_FACTOR
                        );
                        setHeading(smoothedHeading.current);
                        setSmoothedHeadingState(smoothedHeading.current);

                        if (!isMoving && mapRef.current && userLocation) {
                            const timeSinceInteraction = Date.now() - lastUserInteraction.current;
                            if (timeSinceInteraction > 5000) {
                                mapRef.current.animateCamera({
                                    center: userLocation,
                                    zoom: 17,
                                    heading: smoothedHeading.current,
                                    pitch: 45,
                                }, { duration: 300 });
                            }
                        }
                    }
                });
            } catch (error) {
                console.log("Erreur heading:", error);
            }
        };

        startHeading();
        return () => headingSubscription?.remove();
    }, [isMoving, userLocation]);

    if (isLoading || !region) {
        return <LoadingScreen message="Chargement de la carte..." />;
    }

    return (
        <View style={mapStyles.container}>
            <MapView
                ref={mapRef}
                style={mapStyles.map}
                region={region}
                showsUserLocation={false}
                onPanDrag={() => lastUserInteraction.current = Date.now()}
                onTouchStart={() => lastUserInteraction.current = Date.now()}
            >
                <UrlTile urlTemplate="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} />

                {route.length > 0 && (
                    <>
                        <Polyline
                            coordinates={route}
                            strokeColor={isOffRoute ? "orange" : "#BB487C"}
                            strokeWidth={10}
                        />

                        {/* Prochain virage uniquement */}
                        {nextTurnOverlay && (
                            <React.Fragment>
                                <Polyline
                                    coordinates={nextTurnOverlay.polylineCoords}
                                    strokeColor="#FFFFFF"
                                    strokeWidth={9}
                                    zIndex={15}
                                />
                                <Marker
                                    coordinate={nextTurnOverlay.arrowCoordinate}
                                    anchor={{ x: 0.5, y: 0.5 }}
                                    rotation={nextTurnOverlay.arrowBearing}
                                    flat={true}
                                    zIndex={20}
                                    tracksViewChanges={false}
                                    image={require("../assets/arrow_route.png")}
                                />
                            </React.Fragment>
                        )}

                        <Marker
                            coordinate={route[route.length - 1]}
                            title="Arrivée"
                            pinColor="red"
                            zIndex={50}
                        />
                    </>
                )}

                {userLocation && (
                    <Marker
                        coordinate={userLocation}
                        anchor={{ x: 0.5, y: 0.5 }}
                        rotation={smoothedHeadingState}
                        flat
                        zIndex={1000}
                        image={require("../assets/fleche.png")}
                    />
                )}
            </MapView>

            <NavigationInstruction instruction={nextInstruction} />

            <NavigationStats
                speed={navigationStats.speed}
                remainingDistance={navigationStats.remainingDistance}
                estimatedTime={navigationStats.estimatedTime}
                isRecalculating={isRecalculating}
            />

            {userLocation && (
                <TouchableOpacity
                    style={mapStyles.recenterButton}
                    onPress={() => {
                        if (!userLocation) return;
                        lastUserInteraction.current = 0;
                        mapRef.current?.animateCamera({
                            center: userLocation,
                            pitch: 45,
                            heading: smoothedHeading.current,
                            zoom: 17,
                        }, { duration: 500 });
                    }}
                >
                    <Text style={{ color: "white", fontWeight: "bold", fontSize: 20 }}>📍</Text>
                </TouchableOpacity>
            )}

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