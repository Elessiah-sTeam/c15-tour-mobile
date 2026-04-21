import { RoutePoint, NavigationStep } from '@/utils/navigationUtils';
import polyline from '@mapbox/polyline';

// Configuration de l'API
const API_BASE_URL = 'http://10.0.2.2:8080';

// Interface pour le résultat
interface FetchRouteResult {
    coordinates: RoutePoint[] | null;
    steps: NavigationStep[] | null;
    totalDistance: number | null;
    totalDuration: number | null;
    tourId: number | null;
    role: 'PARTICIPANT' | 'ORGANISER' | null;
    error?: 'not_found' | 'network' | 'invalid_format';
}

// Récupérer le trajet depuis ton API avec un code
export const fetchRouteByCode = async (routeCode: string): Promise<FetchRouteResult> => {
    try {
        const url = `${API_BASE_URL}/tours/share/${routeCode}`;

        console.log("Appel API:", url);
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Authorization": 'Bearer eyJhbGciOiJIUzM4NCJ9.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJBRE1JTiIsImlhdCI6MTc3NjA2NzgzNSwiZXhwIjoxNzc2MTU0MjM1fQ.66r5n3M35iDnrhuRL0tLVchMXX4QhRsVWrBXHHFWayazdkauDK2fIF_iT9Nj3X7j',
                "Content-Type": "application/json"
            }
        });

        if (response.status === 404) {
            console.error("Code d'itinéraire invalide:", routeCode);
            return { coordinates: null, steps: null, totalDistance: null, totalDuration: null, tourId: null, role: null, error: 'not_found' };
        }

        if (!response.ok) {
            console.error("Erreur API:", response.status);
            return { coordinates: null, steps: null, totalDistance: null, totalDuration: null, tourId: null, role: null, error: 'network' };
        }

        const data = await response.json();
        const tourId: number | null = data.id ?? null;
        const role: 'PARTICIPANT' | 'ORGANISER' | null = data.role ?? null;

        console.log("Données reçues de l'API:", data);
        console.log("Nombre de segments:", data.segments?.length);

        // Récupérer les valeurs totales de l'API
        const totalDistanceKm = data.totalDistance ? data.totalDistance / 1000 : null; // Conversion m → km
        const totalDurationMin = data.totalDuration ? data.totalDuration / 60 : null; // Conversion s → min

        console.log("Distance totale:", totalDistanceKm, "km");
        console.log("Durée totale:", totalDurationMin, "min");

        // Concaténer tous les segments
        if (data.segments && data.segments.length > 0) {
            let allCoordinates: RoutePoint[] = [];
            let allSteps: NavigationStep[] = [];

            // Parcourir tous les segments
            for (let i = 0; i < data.segments.length; i++) {
                const segment = data.segments[i];
                console.log(`Traitement du segment ${i + 1}/${data.segments.length}`);

                // Parser la geometry du segment
                const geometryString = segment.geometry;
                const geometryObject = JSON.parse(geometryString);

                if (geometryObject.coordinates && Array.isArray(geometryObject.coordinates)) {
                    const segmentCoordinates = geometryObject.coordinates.map(
                        (coord: [number, number]) => ({
                            latitude: coord[1],
                            longitude: coord[0],
                        })
                    );

                    // Éviter les doublons : si ce n'est pas le premier segment,
                    // ne pas ajouter le premier point (qui est le dernier du segment précédent)
                    if (i > 0 && segmentCoordinates.length > 0) {
                        segmentCoordinates.shift(); // Retire le premier point
                    }

                    allCoordinates = allCoordinates.concat(segmentCoordinates);
                }

                // Parser les steps du segment
                const stepsString = segment.steps;
                try {
                    const segmentSteps = JSON.parse(stepsString);
                    if (segmentSteps && Array.isArray(segmentSteps)) {
                        allSteps = allSteps.concat(segmentSteps);
                    }
                } catch (e) {
                    console.warn(`Impossible de parser les steps du segment ${i + 1}:`, e);
                }
            }

            console.log("Trajet complet - Points:", allCoordinates.length, "Steps:", allSteps.length);
            console.log("Premier point:", allCoordinates[0]);
            console.log("Dernier point:", allCoordinates[allCoordinates.length - 1]);

            return {
                coordinates: allCoordinates.length > 0 ? allCoordinates : null,
                steps: allSteps.length > 0 ? allSteps : null,
                totalDistance: totalDistanceKm,
                totalDuration: totalDurationMin,
                tourId,
                role,
            };
        }

        console.error("Format de réponse API non reconnu ou pas de segments");
        return { coordinates: null, steps: null, totalDistance: null, totalDuration: null, tourId: null, role: null, error: 'invalid_format' };
    } catch (error) {
        console.error("Erreur lors de la récupération du trajet:", error);
        return { coordinates: null, steps: null, totalDistance: null, totalDuration: null, tourId: null, role: null, error: 'network' };
    }
};

// Récupérer le trajet depuis OSRM (pour recalcul en temps réel)
export const fetchRouteFromOSRM = async (start: RoutePoint, end: RoutePoint): Promise<RoutePoint[] | null> => {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=polyline`;

        console.log("URL OSRM:", url);
        const response = await fetch(url);
        const data = await response.json();

        if (data.code === "Ok" && data.routes && data.routes.length > 0) {
            const encodedPolyline = data.routes[0].geometry;
            const decodedCoordinates = polyline.decode(encodedPolyline);

            const coordinates = decodedCoordinates.map(
                (coord: [number, number]) => ({
                    latitude: coord[0],
                    longitude: coord[1],
                })
            );

            console.log("Nombre de points du trajet:", coordinates.length);
            return coordinates;
        } else {
            console.error("Erreur OSRM:", data.message);
            return null;
        }
    } catch (error) {
        console.error("Erreur lors de la récupération du trajet:", error);
        return null;
    }
};
// Récupérer le trajet de la position utilisateur jusqu'au point de départ du tour
export const fetchRouteToStart = async (
    tourId: number,
    userLocation: RoutePoint
): Promise<RoutePoint[] | null> => {
    try {
        const url = `${API_BASE_URL}/tours/${tourId}/route-to-start`;
        console.log("Appel route-to-start:", url);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                "accept": 'application/json',
                "Authorization": 'Bearer eyJhbGciOiJIUzM4NCJ9.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJBRE1JTiIsImlhdCI6MTc3NjA2NzgzNSwiZXhwIjoxNzc2MTU0MjM1fQ.66r5n3M35iDnrhuRL0tLVchMXX4QhRsVWrBXHHFWayazdkauDK2fIF_iT9Nj3X7j',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                coordinates: {
                    latitude: userLocation.latitude,
                    longitude: userLocation.longitude,
                }
            }),
        });

        if (!response.ok) {
            console.error("Erreur route-to-start:", response.status);
            return null;
        }

        const data = await response.json();
        const geometryObject = JSON.parse(data.geometry);

        if (geometryObject.coordinates && Array.isArray(geometryObject.coordinates)) {
            return geometryObject.coordinates.map((coord: [number, number]) => ({
                latitude: coord[1],
                longitude: coord[0],
            }));
        }

        return null;
    } catch (error) {
        console.error("Erreur lors de la récupération du trajet vers le départ:", error);
        return null;
    }
};