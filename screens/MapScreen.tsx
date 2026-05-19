import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, TouchableOpacity, Text } from "react-native";
import MapView, { Marker, Polyline, UrlTile, Region } from "react-native-maps";
import * as Location from "expo-location";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

// Imports
import { mapStyles } from "@/styles/MapStyles";
import { fetchRouteFromOSRM, sendOrganiserPosition, subscribeToOrganiserPosition } from "@/services/osrmService";
import {
    RoutePoint,
    NavigationInstruction as NavigationInstructionType,
    calculateBearing,
    calculateDistance,
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
import { AudioRecordButton } from "@/components/AudioRecordButton";
import { AudioNotificationBanner } from "@/components/AudioNotificationBanner";
import { AudioHistoryModal, StoredAudioMessage } from "@/components/AudioHistoryModal";
import { fetchAudioMessages, downloadAudioFile } from "@/services/audioService";
import { Audio } from "expo-av";

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
    maneuverRouteIndex: number;
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


// Flèches simples espacées régulièrement pour le trajet vers le départ
const ARROW_SPACING_METERS = 40;

interface SimpleArrow {
    coordinate: RoutePoint;
    bearing: number;
}

const computeSimpleArrows = (points: RoutePoint[]): SimpleArrow[] => {
    if (points.length < 2) return [];
    const arrows: SimpleArrow[] = [];
    let accumulated = 0;
    let nextAt = ARROW_SPACING_METERS;

    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const segMeters = calculateDistance(p1.latitude, p1.longitude, p2.latitude, p2.longitude) * 1000;
        const bearing = calculateBearing(p1.latitude, p1.longitude, p2.latitude, p2.longitude);

        while (accumulated + segMeters >= nextAt) {
            const fraction = (nextAt - accumulated) / segMeters;
            arrows.push({
                coordinate: {
                    latitude: p1.latitude + fraction * (p2.latitude - p1.latitude),
                    longitude: p1.longitude + fraction * (p2.longitude - p1.longitude),
                },
                bearing,
            });
            nextAt += ARROW_SPACING_METERS;
        }
        accumulated += segMeters;
    }
    return arrows;
};

export default function MapScreen() {
    const mapRef = useRef<MapView | null>(null);

    // Récupérer les paramètres transmis par RoutePreviewScreen
    const { coordinates, steps, totalDistance, totalDuration, routeStartIndex, routeToStart, isOrganiser, organiserToken, routeCode } =
        useLocalSearchParams<{
            coordinates: string;
            steps: string;
            totalDistance: string;
            totalDuration: string;
            routeStartIndex: string;
            routeToStart: string;
            isOrganiser: string;
            organiserToken: string;
            routeCode: string;
        }>();

    const parsedIsOrganiser = isOrganiser === "true";

    const parsedRouteStartIndex = routeStartIndex ? parseInt(routeStartIndex) : 0;
    const parsedRouteToStart: RoutePoint[] = useMemo(() => {
        try { return routeToStart ? JSON.parse(routeToStart) : []; }
        catch { return []; }
    }, [routeToStart]);
    const routeToStartArrows = useMemo(() => computeSimpleArrows(parsedRouteToStart), [parsedRouteToStart]);

    // États de base
    const [region, setRegion] = useState<Region | null>(null);
    const [userLocation, setUserLocation] = useState<RoutePoint | null>(null);
    const [heading, setHeading] = useState(0);
    const [smoothedHeadingState, setSmoothedHeadingState] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isMoving, setIsMoving] = useState(false);
    const lastUserInteraction = useRef<number>(0);
    const [isMapInteracted, setIsMapInteracted] = useState(false);

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
    const [hasReachedStart, setHasReachedStart] = useState(false);
    const [organiserLocation, setOrganiserLocation] = useState<RoutePoint | null>(null);

    // Audio messages (participants)
    const [audioMessages, setAudioMessages] = useState<StoredAudioMessage[]>([]);
    const [showAudioNotification, setShowAudioNotification] = useState(false);
    const [showAudioHistory, setShowAudioHistory] = useState(false);
    const lastPlayedIdRef = useRef<number | null>(null);
    const audioQueueRef = useRef<string[]>([]);
    const isPlayingAudioRef = useRef(false);

    // Historique et filtres
    const speedHistory = useRef<number[]>([]);
    const MAX_SPEED_HISTORY = 10;
    const previousLocation = useRef<RoutePoint | null>(null);
    const smoothedHeading = useRef<number>(0);
    const SMOOTHING_FACTOR = 0.15;
    // Ref pour accéder à userLocation dans l'interval sans le redémarrer à chaque update GPS
    const userLocationRef = useRef<RoutePoint | null>(null);

    // Overlays de virage
    const turnOverlays = useMemo(() => computeTurnOverlays(navigationSteps, route), [navigationSteps, route]);

    // Prochain virage devant l'utilisateur
    const nextTurnOverlay = useMemo(() => {
        return turnOverlays.find(o => o.maneuverRouteIndex > currentRouteIndex) ?? null;
    }, [turnOverlays, currentRouteIndex]);

    // Récupérer le trajet depuis OSRM (pour recalcul)
    const fetchRouteFromOSRMForRecalc = async (start: RoutePoint, end: RoutePoint): Promise<boolean> => {
        const coords = await fetchRouteFromOSRM(start, end);
        if (coords) {
            setRoute(coords);
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


    // Lecture audio séquentielle (file d'attente)
    const playNextAudio = async () => {
        if (isPlayingAudioRef.current || audioQueueRef.current.length === 0) return;
        const uri = audioQueueRef.current.shift()!;
        isPlayingAudioRef.current = true;
        try {
            await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
            const { sound } = await Audio.Sound.createAsync({ uri });
            await sound.playAsync();
            sound.setOnPlaybackStatusUpdate((status) => {
                if (status.isLoaded && status.didJustFinish) {
                    sound.unloadAsync();
                    isPlayingAudioRef.current = false;
                    playNextAudio();
                }
            });
        } catch (err) {
            console.error('[Audio] Erreur lecture auto:', err);
            isPlayingAudioRef.current = false;
            playNextAudio();
        }
    };

    // Participant : polling audio toutes les 2s
    useEffect(() => {
        if (!routeCode || parsedIsOrganiser) return;

        const poll = async () => {
            const messages = await fetchAudioMessages(routeCode);
            if (messages.length === 0) return;

            const maxId = Math.max(...messages.map(m => m.id));

            // Premier poll : initialiser sans lire pour éviter de rejouer l'historique
            if (lastPlayedIdRef.current === null) {
                lastPlayedIdRef.current = maxId;
                return;
            }

            const newMessages = messages
                .filter(m => m.id > lastPlayedIdRef.current!)
                .sort((a, b) => a.id - b.id);

            for (const msg of newMessages) {
                const localUri = await downloadAudioFile(msg.url, msg.id);
                if (!localUri) continue;

                setAudioMessages(prev => [...prev, { id: msg.id, createdAt: msg.createdAt, localUri }]);
                audioQueueRef.current.push(localUri);
                setShowAudioNotification(true);
            }

            if (newMessages.length > 0) {
                lastPlayedIdRef.current = maxId;
                playNextAudio();
            }
        };

        const interval = setInterval(poll, 2000);
        return () => clearInterval(interval);
    }, [routeCode, parsedIsOrganiser]);

    // Organisateur : envoyer sa position toutes les 5s
    useEffect(() => {
        if (!routeCode || !parsedIsOrganiser || !organiserToken) return;

        const interval = setInterval(() => {
            if (userLocationRef.current) {
                sendOrganiserPosition(routeCode, organiserToken, userLocationRef.current);
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [routeCode, parsedIsOrganiser, organiserToken]);

    // Participant : s'abonner au stream SSE de la position de l'organisateur
    useEffect(() => {
        if (!routeCode || parsedIsOrganiser) return;

        const unsubscribe = subscribeToOrganiserPosition(
            routeCode,
            (pos) => setOrganiserLocation(pos),
        );

        return unsubscribe;
    }, [routeCode, parsedIsOrganiser]);

    // Initialisation
    useEffect(() => {
        const initLocation = async () => {
            if (!coordinates) {
                console.error("Aucune coordonnée fournie");
                setIsLoading(false);
                return;
            }

            try {
                const parsedRoute: RoutePoint[] = JSON.parse(coordinates);
                const parsedSteps = steps ? JSON.parse(steps) : [];

                if (parsedRoute.length === 0) {
                    console.error("Trajet vide");
                    setIsLoading(false);
                    return;
                }

                setRoute(parsedRoute);
                setDestination(parsedRoute[parsedRoute.length - 1]);

                if (parsedSteps.length > 0) {
                    setNavigationSteps(parsedSteps);
                    const maneuvers = extractManeuverPoints(parsedSteps);
                    setManeuverPoints(maneuvers);
                }

                // Si pas de trajet vers le départ, on est déjà au départ
                if (parsedRouteStartIndex === 0) {
                    setHasReachedStart(true);
                }

                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== "granted") {
                    console.error("Permission GPS refusée");
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
                } catch (gpsError) {
                    console.error("GPS non disponible, utilisation position par défaut:", gpsError);
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
                setIsLoading(false);
            } catch (error) {
                console.error("Erreur lors de l'initialisation:", error);
                setIsLoading(false);
            }
        };

        initLocation();
    }, [coordinates]);

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

                    if (accuracy && accuracy > 100) return;

                    if (previousLocation.current && !isValidGPSPosition(newPosition, previousLocation.current, 200)) return;

                    setUserLocation(newPosition);
                    userLocationRef.current = newPosition;

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
                        setIsMapInteracted(false);
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
                                setIsMapInteracted(false);
                            }
                        }
                    }
                });
            } catch (error) {
                console.error("Erreur boussole:", error);
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
                onPanDrag={() => { lastUserInteraction.current = Date.now(); setIsMapInteracted(true); }}
                onTouchStart={() => { lastUserInteraction.current = Date.now(); setIsMapInteracted(true); }}
            >
                <UrlTile urlTemplate="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} />

                {route.length > 0 && (
                    <>
                        <Polyline
                            coordinates={route}
                            strokeColor={isOffRoute ? "orange" : "#BB487C"}
                            strokeWidth={10}
                        />

                        {/* Flèches trajet vers le départ */}
                        {!hasReachedStart && parsedRouteStartIndex > 0 && routeToStartArrows.map((arrow, index) => (
                            <Marker
                                key={`to-start-arrow-${index}`}
                                coordinate={arrow.coordinate}
                                anchor={{ x: 0.5, y: 0.5 }}
                                rotation={arrow.bearing}
                                zIndex={10}
                                tracksViewChanges={false}
                                image={require("../assets/arrow_route.png")}
                            />
                        ))}

                        {/* Prochain virage du trajet principal */}
                        {hasReachedStart && nextTurnOverlay && (
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

                {/* Position de l'organisateur (visible par les participants) */}
                {!parsedIsOrganiser && organiserLocation && (
                    <Marker
                        coordinate={organiserLocation}
                        anchor={{ x: 0.5, y: 0.5 }}
                        zIndex={900}
                        title="Organisateur"
                        flat={true}
                        image={require("../assets/fleche_organisateur.png")}
                    />
                )}
            </MapView>

            <NavigationInstruction instruction={nextInstruction} />

            {/* Bouton "Je suis au départ" au-dessus des métriques */}
            {!hasReachedStart && parsedRouteStartIndex > 0 && (
                <TouchableOpacity
                    style={{
                        position: "absolute",
                        bottom: 120,
                        left: 10,
                        right: 10,
                        backgroundColor: "rgba(40, 167, 69, 0.95)",
                        borderRadius: 12,
                        padding: 15,
                        alignItems: "center",
                        elevation: 6,
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.25,
                        shadowRadius: 3.84,
                    }}
                    onPress={() => {
                        setHasReachedStart(true);
                    }}
                >
                    <Text style={{ color: "white", fontSize: 14, fontWeight: "700" }} numberOfLines={1} adjustsFontSizeToFit>
                        🚩 Je suis au départ — Cliquer pour commencer !
                    </Text>
                </TouchableOpacity>
            )}

            <NavigationStats
                speed={navigationStats.speed}
                remainingDistance={navigationStats.remainingDistance}
                estimatedTime={navigationStats.estimatedTime}
                isRecalculating={isRecalculating}
            />

            {/* Bouton micro organisateur */}
            {parsedIsOrganiser && (
                <View style={{
                    position: 'absolute',
                    bottom: 165,
                    right: 20,
                }}>
                    <AudioRecordButton
                        routeCode={routeCode ?? ''}
                        organiserToken={organiserToken}
                    />
                </View>
            )}

            {/* Bouton historique audio participant */}
            {!parsedIsOrganiser && (
                <TouchableOpacity
                    style={{
                        position: 'absolute',
                        bottom: 165,
                        right: 20,
                        backgroundColor: audioMessages.length > 0 ? '#FF6B00' : 'rgba(100,100,100,0.85)',
                        width: 50,
                        height: 50,
                        borderRadius: 25,
                        alignItems: 'center',
                        justifyContent: 'center',
                        elevation: 5,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.3,
                        shadowRadius: 3,
                    }}
                    onPress={() => setShowAudioHistory(true)}
                >
                    <Ionicons name="mic" size={22} color="white" />
                    {audioMessages.length > 0 && (
                        <View style={{
                            position: 'absolute',
                            top: -4,
                            right: -4,
                            backgroundColor: '#E53935',
                            borderRadius: 9,
                            minWidth: 18,
                            height: 18,
                            alignItems: 'center',
                            justifyContent: 'center',
                            paddingHorizontal: 3,
                        }}>
                            <Text style={{ color: 'white', fontSize: 11, fontWeight: '700' }}>
                                {audioMessages.length}
                            </Text>
                        </View>
                    )}
                </TouchableOpacity>
            )}

            {userLocation && isMapInteracted && (
                <TouchableOpacity
                    style={mapStyles.recenterButton}
                    onPress={() => {
                        if (!userLocation) return;
                        lastUserInteraction.current = 0;
                        setIsMapInteracted(false);
                        mapRef.current?.animateCamera({
                            center: userLocation,
                            pitch: 45,
                            heading: smoothedHeading.current,
                            zoom: 17,
                        }, { duration: 500 });
                    }}
                >
                    <Ionicons name="locate" size={24} color="white" />
                </TouchableOpacity>
            )}

            {isOffRoute && (
                <View style={mapStyles.offRouteAlert}>
                    <Text style={mapStyles.offRouteText}>
                        {isRecalculating ? "⏳ Recalcul du trajet en cours..." : "⚠️ Hors trajet"}
                    </Text>
                </View>
            )}

            {/* Notification nouveau message audio */}
            <AudioNotificationBanner
                visible={showAudioNotification}
                onHide={() => setShowAudioNotification(false)}
            />

            {/* Historique des messages audio */}
            <AudioHistoryModal
                visible={showAudioHistory}
                onClose={() => setShowAudioHistory(false)}
                messages={audioMessages}
            />
        </View>
    );
}