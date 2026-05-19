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
    error?: 'not_found' | 'network' | 'invalid_format';
}

// Récupérer le trajet depuis ton API avec un code
export const fetchRouteByCode = async (routeCode: string): Promise<FetchRouteResult> => {
    try {
        const url = `${API_BASE_URL}/tours/share/${routeCode}`;

        console.log("Appel API:", url);
        const response = await fetch(url);

        if (response.status === 404) {
            console.error("Code d'itinéraire invalide:", routeCode);
            return { coordinates: null, steps: null, totalDistance: null, totalDuration: null, tourId: null, error: 'not_found' };
        }

        if (!response.ok) {
            console.error("Erreur API:", response.status);
            return { coordinates: null, steps: null, totalDistance: null, totalDuration: null, tourId: null, error: 'network' };
        }

        const data = await response.json();
        const tourId: number | null = data.id ?? null;

        console.log("Données reçues de l'API:", data);
        console.log("Nombre de segments:", data.segments?.length);

        // Récupérer les valeurs totales de l'API
        const totalDistanceKm = data.totalDistance ? data.totalDistance / 1000 : null;
        const totalDurationMin = data.totalDuration ? data.totalDuration / 60 : null;

        console.log("Distance totale:", totalDistanceKm, "km");
        console.log("Durée totale:", totalDurationMin, "min");

        // Concaténer tous les segments
        if (data.segments && data.segments.length > 0) {
            let allCoordinates: RoutePoint[] = [];
            let allSteps: NavigationStep[] = [];

            for (let i = 0; i < data.segments.length; i++) {
                const segment = data.segments[i];
                console.log(`Traitement du segment ${i + 1}/${data.segments.length}`);

                const geometryString = segment.geometry;
                const geometryObject = JSON.parse(geometryString);

                if (geometryObject.coordinates && Array.isArray(geometryObject.coordinates)) {
                    const segmentCoordinates = geometryObject.coordinates.map(
                        (coord: [number, number]) => ({
                            latitude: coord[1],
                            longitude: coord[0],
                        })
                    );

                    if (i > 0 && segmentCoordinates.length > 0) {
                        segmentCoordinates.shift();
                    }

                    allCoordinates = allCoordinates.concat(segmentCoordinates);
                }

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

            return {
                coordinates: allCoordinates.length > 0 ? allCoordinates : null,
                steps: allSteps.length > 0 ? allSteps : null,
                totalDistance: totalDistanceKm,
                totalDuration: totalDurationMin,
                tourId,
            };
        }

        console.error("Format de réponse API non reconnu ou pas de segments");
        return { coordinates: null, steps: null, totalDistance: null, totalDuration: null, tourId: null, error: 'invalid_format' };
    } catch (error) {
        console.error("Erreur lors de la récupération du trajet:", error);
        return { coordinates: null, steps: null, totalDistance: null, totalDuration: null, tourId: null, error: 'network' };
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                coordinates: {
                    latitude: userLocation.latitude,
                    longitude: userLocation.longitude,
                },
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

// Rejoindre en tant qu'organisateur — retourne le token si code valide, null sinon
export const joinAsOrganiser = async (code: string): Promise<string | null> => {
    try {
        const url = `${API_BASE_URL}/tours/share/${code}/join`;
        console.log("Tentative join organisateur:", url);

        const response = await fetch(url, { method: 'GET' });

        if (!response.ok) return null;

        const data = await response.json();
        return data.token ?? null;
    } catch (error) {
        console.error("Erreur join organisateur:", error);
        return null;
    }
};

// Envoyer la position de l'organisateur
export const sendOrganiserPosition = async (
    code: string,
    token: string,
    position: RoutePoint
): Promise<void> => {
    try {
        const url = `${API_BASE_URL}/tours/share/${code}/organiser-position`;
        await fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                latitude: position.latitude,
                longitude: position.longitude,
            }),
        });
    } catch (error) {
        console.error("Erreur envoi position organisateur:", error);
    }
};

// S'abonner au stream SSE de la position de l'organisateur via XHR (fetch bloque en RN sur les SSE)
// Retourne une fonction de nettoyage à appeler pour fermer la connexion
export const subscribeToOrganiserPosition = (
    code: string,
    onPosition: (position: RoutePoint) => void,
    onError?: (error: Error) => void
): (() => void) => {
    let isActive = true;
    let xhr: XMLHttpRequest | null = null;

    const parsePositionLine = (line: string): RoutePoint | null => {
        const jsonStr = line.startsWith('data: ') ? line.slice(6) : line.trim();
        if (!jsonStr) return null;
        try {
            const data = JSON.parse(jsonStr);
            if (data.latitude != null && data.longitude != null) {
                return { latitude: data.latitude, longitude: data.longitude };
            }
        } catch { /* ligne non-JSON, on ignore */ }
        return null;
    };

    const connect = () => {
        if (!isActive) return;

        const url = `${API_BASE_URL}/tours/share/${code}/organiser-position/stream`;
        console.log('[SSE] Connexion:', url);

        xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.setRequestHeader('Accept', 'text/event-stream');
        xhr.setRequestHeader('Cache-Control', 'no-cache');

        let processedLength = 0;

        xhr.onprogress = () => {
            if (!xhr) return;
            const newData = xhr.responseText.slice(processedLength);
            processedLength = xhr.responseText.length;

            for (const line of newData.split('\n')) {
                const pos = parsePositionLine(line);
                if (pos) {
                    console.log('[SSE] Position reçue:', pos);
                    onPosition(pos);
                }
            }
        };

        xhr.onload = () => {
            console.log('[SSE] Stream fermé par le serveur, reconnexion dans 3s');
            if (isActive) setTimeout(connect, 3000);
        };

        xhr.onerror = () => {
            console.error('[SSE] Erreur réseau, reconnexion dans 3s');
            onError?.(new Error('Erreur réseau SSE'));
            if (isActive) setTimeout(connect, 3000);
        };

        xhr.send();
    };

    connect();

    return () => {
        isActive = false;
        xhr?.abort();
        xhr = null;
    };
};