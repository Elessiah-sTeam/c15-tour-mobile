import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Image, TouchableOpacity, Text, Alert } from "react-native";
import MapView, { Marker, Polyline, UrlTile, Region } from "react-native-maps";
import * as Location from "expo-location";

// Types
interface RoutePoint {
    latitude: number;
    longitude: number;
}

interface NavigationStats {
    speed: number;
    remainingDistance: number;
    estimatedTime: number;
    averageSpeed: number;
}

interface NavigationInstruction {
    distance: number;
    instruction: string;
}

export default function MapScreen() {
    const mapRef = useRef<MapView | null>(null);

    // État de base
    const [region, setRegion] = useState<Region | null>(null);
    const [userLocation, setUserLocation] = useState<RoutePoint | null>(null);
    const [heading, setHeading] = useState(0);

    // Itinéraire (sera rempli par l'API)
    const [route, setRoute] = useState<RoutePoint[]>([]);
    const [destination, setDestination] = useState<RoutePoint>({
        latitude: 47.241208,
        longitude: -1.509439,
    }); // Exemple de destination

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
    const [nextInstruction, setNextInstruction] = useState<NavigationInstruction | null>(null);

    // Historique des vitesses pour calcul de moyenne
    const speedHistory = useRef<number[]>([]);
    const MAX_SPEED_HISTORY = 10;

    // Historique des positions pour calculer la direction de déplacement
    const previousLocation = useRef<RoutePoint | null>(null);

    // Filtre pour lisser la rotation
    const smoothedHeading = useRef<number>(0);
    const SMOOTHING_FACTOR = 0.15; // Plus c'est petit, plus c'est lisse (0.1 - 0.3)

    // 🔧 FONCTION: Récupérer le trajet depuis OSRM
    const fetchRoute = async (start: RoutePoint, end: RoutePoint) => {
        try {
            // Format OSRM: longitude,latitude (attention, inversé!)
            const url = `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.code === "Ok" && data.routes && data.routes.length > 0) {
                // Extraire les coordonnées GeoJSON et les convertir en {latitude, longitude}
                const coordinates = data.routes[0].geometry.coordinates.map(
                    (coord: [number, number]) => ({
                        latitude: coord[1],  // GeoJSON est [longitude, latitude]
                        longitude: coord[0],
                    })
                );

                setRoute(coordinates);
                return true;
            } else {
                console.error("Erreur OSRM:", data.message);
                return false;
            }
        } catch (error) {
            console.error("Erreur lors de la récupération du trajet:", error);
            return false;
        }
    };

    // 🔧 FONCTION: Recalculer le trajet via l'API
    const recalculateRoute = async (currentPos: RoutePoint) => {
        if (isRecalculating) return;

        setIsRecalculating(true);
        await fetchRoute(currentPos, destination);
        setIsRecalculating(false);
        setIsOffRoute(false);
    };

    // 🔧 FONCTION: Calculer la distance entre deux points (Haversine)
    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
        const R = 6371; // Rayon de la Terre en km
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLon = ((lon2 - lon1) * Math.PI) / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    // 🔧 FONCTION: Calculer l'angle entre deux points
    const calculateBearing = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
        const dLon = ((lon2 - lon1) * Math.PI) / 180;
        const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
        const x =
            Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
            Math.sin((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.cos(dLon);
        const bearing = (Math.atan2(y, x) * 180) / Math.PI;
        return (bearing + 360) % 360;
    };

    // 🔧 FONCTION: Lisser la rotation (évite les changements brusques)
    const smoothHeading = (currentHeading: number, targetHeading: number): number => {
        // Gérer le passage 0°/360°
        let diff = targetHeading - currentHeading;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;

        // Appliquer le lissage
        const newHeading = currentHeading + diff * SMOOTHING_FACTOR;
        return (newHeading + 360) % 360;
    };

    // 🔧 FONCTION: Trouver le point le plus proche sur le trajet
    const findClosestRoutePoint = (currentPos: RoutePoint, routePoints: RoutePoint[]): number => {
        let minDistance = Infinity;
        let closestIndex = 0;

        routePoints.forEach((point, index) => {
            const distance = calculateDistance(
                currentPos.latitude,
                currentPos.longitude,
                point.latitude,
                point.longitude
            );
            if (distance < minDistance) {
                minDistance = distance;
                closestIndex = index;
            }
        });

        return closestIndex;
    };

    // 🔧 FONCTION: Calculer la distance restante
    const calculateRemainingDistance = (
        currentPos: RoutePoint,
        routePoints: RoutePoint[],
        startIndex: number
    ): number => {
        let totalDistance = 0;

        // Distance jusqu'au prochain point (ou premier point si on est avant le trajet)
        const nextPointIndex = startIndex < routePoints.length ? startIndex : routePoints.length - 1;
        totalDistance += calculateDistance(
            currentPos.latitude,
            currentPos.longitude,
            routePoints[nextPointIndex].latitude,
            routePoints[nextPointIndex].longitude
        );

        // Distance entre les points restants
        for (let i = nextPointIndex; i < routePoints.length - 1; i++) {
            totalDistance += calculateDistance(
                routePoints[i].latitude,
                routePoints[i].longitude,
                routePoints[i + 1].latitude,
                routePoints[i + 1].longitude
            );
        }

        return totalDistance;
    };

    // 🔧 FONCTION: Déterminer l'instruction de navigation
    const getNavigationInstruction = (
        currentPos: RoutePoint,
        currentIndex: number,
        nextIndex: number,
        routePoints: RoutePoint[]
    ): NavigationInstruction | null => {
        if (nextIndex >= routePoints.length) return null;

        const distanceToNext = calculateDistance(
            currentPos.latitude,
            currentPos.longitude,
            routePoints[nextIndex].latitude,
            routePoints[nextIndex].longitude
        );

        let instruction = "";

        if (nextIndex === routePoints.length - 1) {
            instruction = "Destination à ";
        } else {
            // Calculer l'angle de virage
            if (nextIndex + 1 < routePoints.length) {
                const bearing1 = calculateBearing(
                    routePoints[currentIndex].latitude,
                    routePoints[currentIndex].longitude,
                    routePoints[nextIndex].latitude,
                    routePoints[nextIndex].longitude
                );
                const bearing2 = calculateBearing(
                    routePoints[nextIndex].latitude,
                    routePoints[nextIndex].longitude,
                    routePoints[nextIndex + 1].latitude,
                    routePoints[nextIndex + 1].longitude
                );

                let angle = bearing2 - bearing1;
                if (angle > 180) angle -= 360;
                if (angle < -180) angle += 360;

                if (Math.abs(angle) < 30) {
                    instruction = "Continuez tout droit dans ";
                } else if (angle > 30 && angle < 150) {
                    instruction = "Tournez à droite dans ";
                } else if (angle < -30 && angle > -150) {
                    instruction = "Tournez à gauche dans ";
                } else {
                    instruction = "Faites demi-tour dans ";
                }
            } else {
                instruction = "Continuez tout droit dans ";
            }
        }

        return {
            distance: distanceToNext,
            instruction,
        };
    };

    // 🔧 FONCTION: Mettre à jour la vitesse moyenne
    const updateAverageSpeed = (currentSpeed: number): number => {
        speedHistory.current.push(currentSpeed);
        if (speedHistory.current.length > MAX_SPEED_HISTORY) {
            speedHistory.current.shift();
        }

        const sum = speedHistory.current.reduce((acc, speed) => acc + speed, 0);
        return speedHistory.current.length > 0 ? sum / speedHistory.current.length : 0;
    };

    // 🔧 FONCTION: Vérifier si l'utilisateur est hors du trajet
    const checkIfOffRoute = (currentPos: RoutePoint, routePoints: RoutePoint[]): boolean => {
        const closestIndex = findClosestRoutePoint(currentPos, routePoints);
        const distanceToRoute = calculateDistance(
            currentPos.latitude,
            currentPos.longitude,
            routePoints[closestIndex].latitude,
            routePoints[closestIndex].longitude
        );

        // Si distance > 50 mètres, considéré hors trajet
        return distanceToRoute > 0.05; // 0.05 km = 50 mètres
    };

    // 1️⃣ Initialisation de la position et récupération du trajet
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

            // 🚀 Récupérer le trajet depuis OSRM
            const success = await fetchRoute({ latitude, longitude }, destination);

            if (!success) {
                Alert.alert("Erreur", "Impossible de calculer le trajet");
            }
        };

        initLocation();
    }, []);

    // 2️⃣ Suivi GPS en temps réel avec calculs de navigation
    useEffect(() => {
        let subscription: Location.LocationSubscription;

        const startWatching = async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") return;

            subscription = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.BestForNavigation,
                    timeInterval: 500, // 1 seconde
                    distanceInterval: 5, // 5 mètres
                },
                (pos) => {
                    const { latitude, longitude, speed: currentSpeedMps } = pos.coords;
                    const newPosition = { latitude, longitude };
                    setUserLocation(newPosition);

                    // 🧭 Calculer la direction de déplacement (plus fiable que la boussole)
                    if (previousLocation.current && currentSpeedMps && currentSpeedMps > 0.5) {
                        // Calculer l'angle de déplacement seulement si on bouge
                        const movementHeading = calculateBearing(
                            previousLocation.current.latitude,
                            previousLocation.current.longitude,
                            latitude,
                            longitude
                        );

                        // Appliquer le lissage pour éviter les rotations brusques
                        smoothedHeading.current = smoothHeading(smoothedHeading.current, movementHeading);
                        setHeading(smoothedHeading.current);
                    }
                    previousLocation.current = newPosition;

                    // Vitesse en km/h
                    const speedKmh = currentSpeedMps ? currentSpeedMps * 3.6 : 0;

                    // Trouver le point le plus proche
                    const closestIndex = findClosestRoutePoint(newPosition, route);
                    setCurrentRouteIndex(closestIndex);

                    // Calculer distance restante
                    const distanceLeft = calculateRemainingDistance(newPosition, route, closestIndex);

                    // Vitesse moyenne
                    const avgSpeed = updateAverageSpeed(speedKmh);

                    // Temps estimé
                    const effectiveSpeed = avgSpeed > 5 ? avgSpeed : 20; // Vitesse par défaut si trop lent
                    const timeLeft = (distanceLeft / effectiveSpeed) * 60; // en minutes

                    // Vérifier si hors trajet
                    const offRoute = checkIfOffRoute(newPosition, route);
                    if (offRoute && !isOffRoute) {
                        setIsOffRoute(true);
                        // Recalculer le trajet via l'API
                        recalculateRoute(newPosition);
                    } else if (!offRoute && isOffRoute) {
                        setIsOffRoute(false);
                    }

                    // Instruction suivante
                    const nextIndex = closestIndex < route.length - 1 ? closestIndex + 1 : closestIndex;
                    const instruction = getNavigationInstruction(newPosition, closestIndex, nextIndex, route);
                    setNextInstruction(instruction);

                    // Mettre à jour les stats
                    setNavigationStats({
                        speed: Math.round(speedKmh),
                        remainingDistance: distanceLeft,
                        estimatedTime: Math.round(timeLeft),
                        averageSpeed: Math.round(avgSpeed),
                    });

                    // Recentrer la carte
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
    }, [route, isOffRoute]);

    // 3️⃣ Suivi de la direction (heading)
    useEffect(() => {
        let headingSubscription: any = null;

        const startHeading = async () => {
            // Vérifier si le heading est disponible
            const hasHeading = await Location.hasServicesEnabledAsync();
            if (!hasHeading) {
                console.log("Services de localisation désactivés");
                return;
            }

            try {
                headingSubscription = await Location.watchHeadingAsync((headingObj) => {
                    // Utiliser magHeading (boussole magnétique) plus fiable sur mobile
                    const newHeading = headingObj.magHeading !== -1
                        ? headingObj.magHeading
                        : headingObj.trueHeading;

                    // Appliquer le lissage
                    if (newHeading >= 0 && newHeading <= 360) {
                        smoothedHeading.current = smoothHeading(smoothedHeading.current, newHeading);
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

    if (!region) {
        return <View style={styles.container} />;
    }

    return (
        <View style={styles.container}>
            <MapView ref={mapRef} style={styles.map} region={region} showsUserLocation={false}>
                {/* Tuiles OpenStreetMap */}
                <UrlTile urlTemplate="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} />

                {/* Polyline du trajet principal - n'afficher que si le trajet existe */}
                {route.length > 0 && (
                    <Polyline coordinates={route} strokeColor={isOffRoute ? "orange" : "#BB487C"} strokeWidth={5} />
                )}

                {/* Marker arrivée - n'afficher que si le trajet existe */}
                {route.length > 0 && (
                    <Marker coordinate={route[route.length - 1]} title="Arrivée" pinColor="red" />
                )}

                {/* Position utilisateur avec flèche */}
                {userLocation && (
                    <Marker
                        coordinate={userLocation}
                        anchor={{ x: 0.5, y: 0.5 }}
                        rotation={heading}
                        flat={true}
                    >
                        <Image source={require("../assets/fleche.png")} style={{ width: 40, height: 40 }} />
                    </Marker>
                )}
            </MapView>

            {/* Panneau d'instructions de navigation */}
            {nextInstruction && (
                <View style={styles.instructionPanel}>
                    <Text style={styles.instructionText}>
                        {nextInstruction.instruction}
                        <Text style={styles.instructionDistance}>
                            {nextInstruction.distance < 1
                                ? `${Math.round(nextInstruction.distance * 1000)} m`
                                : `${nextInstruction.distance.toFixed(1)} km`}
                        </Text>
                    </Text>
                </View>
            )}

            {/* Panneau d'informations de navigation */}
            <View style={styles.statsPanel}>
                <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Vitesse</Text>
                        <Text style={styles.statValue}>{navigationStats.speed}</Text>
                        <Text style={styles.statUnit}>km/h</Text>
                    </View>

                    <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Distance</Text>
                        <Text style={styles.statValue}>
                            {navigationStats.remainingDistance < 1
                                ? Math.round(navigationStats.remainingDistance * 1000)
                                : navigationStats.remainingDistance.toFixed(1)}
                        </Text>
                        <Text style={styles.statUnit}>
                            {navigationStats.remainingDistance < 1 ? "m" : "km"}
                        </Text>
                    </View>

                    <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Arrivée</Text>
                        <Text style={styles.statValue}>{navigationStats.estimatedTime == 0 ? ">1" : navigationStats.estimatedTime}</Text>
                        <Text style={styles.statUnit}>min</Text>
                    </View>
                </View>
            </View>

            {/* Bouton recentrer */}
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
                    <Text style={{ color: "white", fontWeight: "bold" }}>📍</Text>
                </TouchableOpacity>
            )}

            {/* Indicateur hors trajet */}
            {isOffRoute && (
                <View style={styles.offRouteAlert}>
                    <Text style={styles.offRouteText}>⚠️ Hors trajet</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    map: { flex: 1 },
    instructionPanel: {
        position: "absolute",
        top: 60,
        left: 10,
        right: 10,
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        borderRadius: 12,
        padding: 15,
        elevation: 5,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    instructionText: {
        fontSize: 18,
        fontWeight: "600",
        color: "#333",
    },
    instructionDistance: {
        fontSize: 20,
        fontWeight: "bold",
        color: "#BB487C",
    },
    statsPanel: {
        position: "absolute",
        bottom: 20,
        left: 10,
        right: 10,
        backgroundColor: "white",
        borderRadius: 15,
        padding: 15,
        elevation: 5,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    statsRow: {
        flexDirection: "row",
        justifyContent: "space-around",
    },
    statBox: {
        alignItems: "center",
    },
    statLabel: {
        fontSize: 12,
        color: "#666",
        marginBottom: 5,
    },
    statValue: {
        fontSize: 24,
        fontWeight: "bold",
        color: "#BB487C",
    },
    statUnit: {
        fontSize: 12,
        color: "#999",
    },
    recenterButton: {
        position: "absolute",
        bottom: 100,
        right: 20,
        backgroundColor: "#BB487C",
        width: 50,
        height: 50,
        borderRadius: 25,
        justifyContent: "center",
        alignItems: "center",
        elevation: 5,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
    },
    offRouteAlert: {
        position: "absolute",
        top: 140,
        left: 10,
        right: 10,
        backgroundColor: "rgba(255, 152, 0, 0.95)",
        borderRadius: 8,
        padding: 10,
        alignItems: "center",
    },
    offRouteText: {
        color: "white",
        fontWeight: "bold",
        fontSize: 14,
    },
});