import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, TouchableOpacity, Text, ScrollView, StyleSheet, Animated } from "react-native";
import MapView, { Marker, Polyline, UrlTile, Region } from "react-native-maps";
import * as Location from "expo-location";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

// Imports
import { mapStyles } from "@/styles/MapStyles";
import { sendOrganiserPosition, subscribeToOrganiserPosition, fetchRouteRedirect } from "@/services/osrmService";
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
import { Waypoint, SegmentInfo } from "@/services/osrmService";
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

// Détecte les virages géométriquement depuis des coordonnées brutes (sans steps)
const GEOMETRIC_TURN_THRESHOLD_DEG = 25;
const MIN_POINTS_BETWEEN_TURNS = 3;

const computeGeometricTurnOverlays = (points: RoutePoint[]): TurnOverlay[] => {
    if (points.length < 4) return [];
    const overlays: TurnOverlay[] = [];
    let lastTurnIdx = -MIN_POINTS_BETWEEN_TURNS;

    for (let i = 2; i < points.length - 2; i++) {
        if (i - lastTurnIdx < MIN_POINTS_BETWEEN_TURNS) continue;

        const bearingIn  = calculateBearing(points[i-1].latitude, points[i-1].longitude, points[i].latitude, points[i].longitude);
        const bearingOut = calculateBearing(points[i].latitude,   points[i].longitude,   points[i+1].latitude, points[i+1].longitude);

        let diff = Math.abs(bearingOut - bearingIn);
        if (diff > 180) diff = 360 - diff;

        if (diff >= GEOMETRIC_TURN_THRESHOLD_DEG) {
            const inSlice  = points.slice(Math.max(0, i - 2), i + 1);
            const outSlice = points.slice(i, Math.min(points.length, i + 3));
            const polylineCoords = [...inSlice, ...outSlice.slice(1)];

            const arrowCoordinate = outSlice[Math.min(outSlice.length - 1, 2)];
            const arrowBearing = (Math.atan2(
                arrowCoordinate.longitude - points[i].longitude,
                arrowCoordinate.latitude  - points[i].latitude
            ) * 180 / Math.PI + 360) % 360;

            overlays.push({ polylineCoords, arrowCoordinate, arrowBearing, maneuverRouteIndex: i });
            lastTurnIdx = i;
        }
    }

    return overlays;
};

export default function MapScreen() {
    const mapRef = useRef<MapView | null>(null);

    // Récupérer les paramètres transmis par RoutePreviewScreen
    const { coordinates, steps, totalDistance, totalDuration, routeStartIndex, routeToStart, routeToStartSteps, isOrganiser, organiserToken, routeCode, waypoints, segments } =
        useLocalSearchParams<{
            coordinates: string;
            steps: string;
            totalDistance: string;
            totalDuration: string;
            routeStartIndex: string;
            routeToStart: string;
            routeToStartSteps: string;
            isOrganiser: string;
            organiserToken: string;
            routeCode: string;
            waypoints: string;
            segments: string;
        }>();

    const parsedIsOrganiser = isOrganiser === "true";

    const parsedRouteStartIndex = routeStartIndex ? parseInt(routeStartIndex) : 0;
    const parsedRouteToStart: RoutePoint[] = useMemo(() => {
        try { return routeToStart ? JSON.parse(routeToStart) : []; }
        catch { return []; }
    }, [routeToStart]);
    // Flèche au bout du trajet vers le départ (avant-dernier → dernier point)
    const routeToStartEndArrow = useMemo(() => {
        if (parsedRouteToStart.length < 2) return null;
        const last = parsedRouteToStart[parsedRouteToStart.length - 1];
        const prev = parsedRouteToStart[parsedRouteToStart.length - 2];
        return {
            coordinate: last,
            bearing: calculateBearing(prev.latitude, prev.longitude, last.latitude, last.longitude),
        };
    }, [parsedRouteToStart]);

    const parsedRouteToStartSteps: any[] = useMemo(() => {
        try { return routeToStartSteps ? JSON.parse(routeToStartSteps) : []; }
        catch { return []; }
    }, [routeToStartSteps]);

    // Overlays de virage du trajet vers le départ
    // Utilise les steps réels si disponibles, sinon détection géométrique
    const routeToStartTurnOverlays = useMemo(() => {
        if (parsedRouteToStartSteps.length > 0) {
            return computeTurnOverlays(parsedRouteToStartSteps, parsedRouteToStart);
        }
        return computeGeometricTurnOverlays(parsedRouteToStart);
    }, [parsedRouteToStartSteps, parsedRouteToStart]);

    const allWaypoints: Waypoint[] = useMemo(() => {
        try { return waypoints ? JSON.parse(waypoints) : []; }
        catch { return []; }
    }, [waypoints]);

    const intermediateWaypoints: Waypoint[] = useMemo(
        () => allWaypoints.slice(1, -1),
        [allWaypoints]
    );

    const parsedSegments: SegmentInfo[] = useMemo(() => {
        try { return segments ? JSON.parse(segments) : []; }
        catch { return []; }
    }, [segments]);

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

    // Menu segments
    const [showSegmentsMenu, setShowSegmentsMenu] = useState(false);
    const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
    const [expandedSegmentIdx, setExpandedSegmentIdx] = useState<number | null>(null);
    const segmentPanelAnim = useRef(new Animated.Value(270)).current;

    useEffect(() => {
        Animated.spring(segmentPanelAnim, {
            toValue: showSegmentsMenu ? 0 : 270,
            useNativeDriver: true,
            bounciness: 4,
        }).start();
    }, [showSegmentsMenu]);

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
    const timeHistory = useRef<number[]>([]);
    const MAX_TIME_HISTORY = 20;
    const previousLocation = useRef<RoutePoint | null>(null);
    const smoothedHeading = useRef<number>(0);
    const SMOOTHING_FACTOR = 0.15;
    // Ref pour accéder à userLocation dans l'interval sans le redémarrer à chaque update GPS
    const userLocationRef = useRef<RoutePoint | null>(null);
    // Timestamp de la dernière mise à jour GPS valide (pour détecter un GPS figé)
    const lastGpsUpdateRef = useRef<number>(Date.now());
    // Index du dernier waypoint atteint (pour le recalcul de route)
    const lastReachedWaypointRef = useRef<number>(0);
    // Indices des waypoints sur le tableau route (mis à jour quand route ou waypoints changent)
    const waypointRouteIndicesRef = useRef<number[]>([]);
    // Indice de départ sur la route pour chaque segment (segment 0 → route[0], etc.)
    const segmentStartRouteIndicesRef = useRef<number[]>([]);

    // Recalculer les indices des waypoints sur le tableau route à chaque changement de route
    useEffect(() => {
        if (allWaypoints.length === 0 || route.length === 0) {
            waypointRouteIndicesRef.current = [];
            segmentStartRouteIndicesRef.current = [];
            return;
        }
        waypointRouteIndicesRef.current = allWaypoints.map(wp => {
            let minDist = Infinity, idx = 0;
            route.forEach((p, i) => {
                const d = Math.abs(p.latitude - wp.latitude) + Math.abs(p.longitude - wp.longitude);
                if (d < minDist) { minDist = d; idx = i; }
            });
            return idx;
        });

        // Calculer l'indice de début sur la route pour chaque segment
        // Segment 0 commence au waypoint 0, segment s>0 commence là où le précédent finit
        let wpCursor = 0;
        segmentStartRouteIndicesRef.current = parsedSegments.map((seg, s) => {
            const startRouteIdx = waypointRouteIndicesRef.current[wpCursor] ?? 0;
            const segWpCount = s === 0
                ? (seg.waypointNames?.length ?? 1)
                : Math.max(1, (seg.waypointNames?.length ?? 1) - 1);
            wpCursor += segWpCount;
            return startRouteIdx;
        });
    }, [route, allWaypoints]);

    // Coordonnée du point de départ du parcours (premier waypoint, sinon début du trajet principal)
    const departureCoordinate: RoutePoint | null = useMemo(() => {
        if (allWaypoints.length > 0) {
            return { latitude: allWaypoints[0].latitude, longitude: allWaypoints[0].longitude };
        }
        if (route.length > 0) {
            return route[Math.min(parsedRouteStartIndex, route.length - 1)];
        }
        return null;
    }, [allWaypoints, route, parsedRouteStartIndex]);

    // Overlays de virage
    const turnOverlays = useMemo(() => computeTurnOverlays(navigationSteps, route), [navigationSteps, route]);

    // Prochain virage devant l'utilisateur
    const nextTurnOverlay = useMemo(() => {
        return turnOverlays.find(o => o.maneuverRouteIndex > currentRouteIndex) ?? null;
    }, [turnOverlays, currentRouteIndex]);

    // Recalculer le trajet via l'API redirect
    const recalculateRoute = async (currentPos: RoutePoint) => {
        if (isRecalculating || !routeCode) return;
        setIsRecalculating(true);
        const result = await fetchRouteRedirect(routeCode, currentPos, lastReachedWaypointRef.current);
        setIsRecalculating(false);
        if (result && result.coordinates.length > 0) {
            setRoute(result.coordinates);
            setNavigationSteps(result.steps);
            setManeuverPoints(result.steps.length > 0 ? extractManeuverPoints(result.steps) : []);
            setNextInstruction(null);
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

    // Lisser le temps estimé sur les 20 dernières valeurs pour éviter les sauts
    const smoothEstimatedTime = (rawTime: number): number => {
        timeHistory.current.push(rawTime);
        if (timeHistory.current.length > MAX_TIME_HISTORY) {
            timeHistory.current.shift();
        }
        const sum = timeHistory.current.reduce((acc, t) => acc + t, 0);
        return sum / timeHistory.current.length;
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

    // Remettre la vitesse à 0 si le GPS ne répond plus depuis 3 secondes
    useEffect(() => {
        const interval = setInterval(() => {
            if (Date.now() - lastGpsUpdateRef.current > 3000) {
                setNavigationStats(prev => ({ ...prev, speed: 0 }));
            }
        }, 1000);
        return () => clearInterval(interval);
    }, []);

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

                    // Temps écoulé depuis la dernière position GPS valide
                    const nowMs = Date.now();
                    const dtMs = nowMs - lastGpsUpdateRef.current;
                    lastGpsUpdateRef.current = nowMs;

                    // Distance réellement parcourue depuis la dernière position (km)
                    const movedKm = previousLocation.current
                        ? calculateDistance(
                            previousLocation.current.latitude,
                            previousLocation.current.longitude,
                            newPosition.latitude,
                            newPosition.longitude
                        )
                        : 0;
                    // Considéré immobile si déplacement < 2 m (protège contre le bruit GPS et un faux GPS figé)
                    const hasMoved = movedKm > 0.002;

                    setUserLocation(newPosition);
                    userLocationRef.current = newPosition;

                    if (previousLocation.current && hasMoved) {
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

                    // Vitesse : privilégier la valeur GPS native si fiable, sinon la calculer depuis le déplacement réel.
                    // Toujours 0 si on n'a pas bougé, ce qui évite les vitesses fantômes à l'arrêt.
                    const gpsSpeedKmh = currentSpeedMps && currentSpeedMps > 0.5 ? currentSpeedMps * 3.6 : 0;
                    const computedSpeedKmh = dtMs > 0 && dtMs < 10000 ? movedKm / (dtMs / 3_600_000) : 0;
                    const speedKmh = hasMoved ? (gpsSpeedKmh > 0 ? gpsSpeedKmh : computedSpeedKmh) : 0;
                    const closestIndex = findClosestRoutePoint(newPosition, route);
                    setCurrentRouteIndex(closestIndex);

                    // Mettre à jour le segment courant pour le menu
                    const segStarts = segmentStartRouteIndicesRef.current;
                    const wpIndices = waypointRouteIndicesRef.current;
                    if (segStarts.length > 0) {
                        let segIdx = 0;
                        for (let s = 0; s < segStarts.length; s++) {
                            if (closestIndex >= segStarts[s]) segIdx = s;
                        }
                        setCurrentSegmentIndex(segIdx);
                    }
                    if (wpIndices.length > 0) {
                        let waypointIdx = 0;
                        for (let w = 0; w < wpIndices.length - 1; w++) {
                            if (closestIndex >= wpIndices[w]) waypointIdx = w;
                        }
                        lastReachedWaypointRef.current = waypointIdx;
                    }

                    const distanceLeft = calculateRemainingDistance(newPosition, route, closestIndex);
                    const avgSpeed = updateAverageSpeed(speedKmh);
                    const effectiveSpeed = avgSpeed > 5 ? avgSpeed : 30;
                    const rawTimeLeft = (distanceLeft / effectiveSpeed) * 60;
                    const timeLeft = smoothEstimatedTime(rawTimeLeft);

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
                        {/* Trajet vers le départ : un polyline blanc par virage + flèche finale */}
                        {!hasReachedStart && parsedRouteStartIndex > 0 && parsedRouteToStart.length > 0 && (
                            <React.Fragment>
                                {routeToStartTurnOverlays.map((overlay, index) => (
                                    <React.Fragment key={`rts-turn-${index}`}>
                                        <Polyline
                                            coordinates={overlay.polylineCoords}
                                            strokeColor="#FFFFFF"
                                            strokeWidth={9}
                                            zIndex={12}
                                        />
                                        <Marker
                                            coordinate={overlay.arrowCoordinate}
                                            anchor={{ x: 0.5, y: 0.5 }}
                                            rotation={overlay.arrowBearing}
                                            flat={true}
                                            zIndex={13}
                                            tracksViewChanges={false}
                                            image={require("../assets/arrow_route.png")}
                                        />
                                    </React.Fragment>
                                ))}
                                {routeToStartEndArrow && (
                                    <Marker
                                        coordinate={routeToStartEndArrow.coordinate}
                                        anchor={{ x: 0.5, y: 0.5 }}
                                        rotation={routeToStartEndArrow.bearing}
                                        flat={true}
                                        zIndex={11}
                                        tracksViewChanges={false}
                                        image={require("../assets/arrow_route.png")}
                                    />
                                )}
                            </React.Fragment>
                        )}

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

                        {/* Marqueur de départ du parcours */}
                        {departureCoordinate && (
                            <Marker
                                coordinate={departureCoordinate}
                                title={allWaypoints[0]?.name ?? "Départ"}
                                pinColor="green"
                                zIndex={45}
                            />
                        )}

                        {/* Étapes intermédiaires */}
                        {intermediateWaypoints.map((wp, index) => (
                            <Marker
                                key={`wp-${index}`}
                                coordinate={{ latitude: wp.latitude, longitude: wp.longitude }}
                                title={wp.name}
                                pinColor="orange"
                                zIndex={40}
                            />
                        ))}

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

            {/* Bouton retour */}
            <TouchableOpacity style={mapStyles.backButton} onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>

            <NavigationInstruction instruction={nextInstruction} />

            {/* Menu segments — panneau latéral droit */}
            {parsedSegments.length > 0 && (
                <>
                    {/* Onglet de déclenchement */}
                    <TouchableOpacity
                        style={segmentStyles.tab}
                        onPress={() => setShowSegmentsMenu(v => !v)}
                    >
                        <Ionicons
                            name={showSegmentsMenu ? 'chevron-forward' : 'chevron-back'}
                            size={16}
                            color="white"
                        />
                        <Text style={segmentStyles.tabCount}>
                            {parsedSegments.length - currentSegmentIndex}
                        </Text>
                        <Ionicons name="flag" size={14} color="white" />
                    </TouchableOpacity>

                    {/* Panneau glissant */}
                    <Animated.View
                        style={[
                            segmentStyles.panel,
                            { transform: [{ translateX: segmentPanelAnim }] },
                        ]}
                    >
                        <Text style={segmentStyles.panelTitle}>
                            Segments ({parsedSegments.length - currentSegmentIndex} restants)
                        </Text>
                        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                            {parsedSegments.map((seg, absIdx) => {
                                const isCurrent = absIdx === currentSegmentIndex;
                                const isPast = absIdx < currentSegmentIndex;
                                const isExpanded = expandedSegmentIdx === absIdx;
                                const departureStr = seg.estimatedDeparture
                                    ? (() => {
                                        const d = new Date(seg.estimatedDeparture);
                                        return isNaN(d.getTime())
                                            ? seg.estimatedDeparture
                                            : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                                    })()
                                    : null;
                                const breakStr = seg.breakDuration != null
                                    ? `Pause : ${seg.breakDuration} min`
                                    : null;
                                return (
                                    <View key={absIdx}>
                                        <TouchableOpacity
                                            style={[
                                                segmentStyles.item,
                                                isCurrent && segmentStyles.itemCurrent,
                                                isPast && segmentStyles.itemPast,
                                            ]}
                                            onPress={() => setExpandedSegmentIdx(isExpanded ? null : absIdx)}
                                            activeOpacity={0.7}
                                        >
                                            <View style={segmentStyles.segHeader}>
                                                <Text style={[segmentStyles.segName, isPast && segmentStyles.segNamePast]} numberOfLines={2}>
                                                    {isPast ? '✓ ' : isCurrent ? '▶ ' : `${absIdx + 1}. `}{seg.name ?? `Segment ${absIdx + 1}`}
                                                </Text>
                                                <Ionicons
                                                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                                    size={14}
                                                    color="#aaa"
                                                />
                                            </View>
                                            {departureStr && (
                                                <Text style={segmentStyles.segDetail}>🕐 {departureStr}</Text>
                                            )}
                                            {breakStr && (
                                                <Text style={segmentStyles.segDetail}>⏸ {breakStr}</Text>
                                            )}
                                        </TouchableOpacity>
                                        {isExpanded && (seg.waypointNames?.length ?? 0) > 0 && (
                                            <View style={segmentStyles.waypointList}>
                                                {seg.waypointNames.map((name, wIdx) => (
                                                    <Text
                                                        key={wIdx}
                                                        style={[
                                                            segmentStyles.waypointItem,
                                                            absIdx < currentSegmentIndex && segmentStyles.waypointItemPassed,
                                                        ]}
                                                    >
                                                        {`${absIdx < currentSegmentIndex ? '✓' : '•'} ${name}`}
                                                    </Text>
                                                ))}
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                        </ScrollView>
                    </Animated.View>
                </>
            )}

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

const segmentStyles = StyleSheet.create({
    // Onglet visible sur le bord droit
    tab: {
        position: 'absolute',
        right: 0,
        top: '40%',
        backgroundColor: 'rgba(30, 30, 30, 0.90)',
        borderTopLeftRadius: 10,
        borderBottomLeftRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 8,
        alignItems: 'center',
        gap: 6,
        zIndex: 101,
        elevation: 6,
    },
    tabCount: {
        color: 'white',
        fontWeight: '700',
        fontSize: 13,
    },
    // Panneau latéral glissant
    panel: {
        position: 'absolute',
        right: 0,
        top: 100,
        bottom: 100,
        width: 260,
        backgroundColor: 'rgba(18, 18, 18, 0.95)',
        borderTopLeftRadius: 16,
        borderBottomLeftRadius: 16,
        paddingTop: 14,
        paddingBottom: 10,
        zIndex: 100,
        elevation: 8,
    },
    panelTitle: {
        color: 'white',
        fontWeight: '700',
        fontSize: 13,
        paddingHorizontal: 14,
        marginBottom: 8,
        opacity: 0.7,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    item: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255,255,255,0.10)',
    },
    itemCurrent: {
        backgroundColor: 'rgba(187, 72, 124, 0.30)',
    },
    itemPast: {
        opacity: 0.6,
    },
    segHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    segName: {
        color: 'white',
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 3,
        flex: 1,
        marginRight: 6,
    },
    segNamePast: {
        color: '#4CAF50',
    },
    segDetail: {
        color: '#aaa',
        fontSize: 12,
        marginTop: 2,
    },
    waypointList: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255,255,255,0.10)',
    },
    waypointItem: {
        color: '#ccc',
        fontSize: 12,
        paddingVertical: 3,
    },
    waypointItemPassed: {
        color: '#4CAF50',
    },
});