import { RoutePoint, NavigationStep } from '@/utils/navigationUtils';
import polyline from '@mapbox/polyline';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.52.85.50:8080';

export interface Waypoint {
    name: string;
    latitude: number;
    longitude: number;
}

interface FetchRouteResult {
    coordinates: RoutePoint[] | null;
    steps: NavigationStep[] | null;
    totalDistance: number | null;
    totalDuration: number | null;
    tourId: number | null;
    waypoints: Waypoint[] | null;
    error?: 'not_found' | 'network' | 'invalid_format';
}

export const fetchRouteByCode = async (routeCode: string): Promise<FetchRouteResult> => {
    try {
        const url = `${API_BASE_URL}/tours/share/${routeCode}`;
        const response = await fetch(url);

        if (response.status === 404) {
            return { coordinates: null, steps: null, totalDistance: null, totalDuration: null, tourId: null, waypoints: null, error: 'not_found' };
        }
        if (!response.ok) {
            console.error('[API] fetchRouteByCode erreur:', response.status);
            return { coordinates: null, steps: null, totalDistance: null, totalDuration: null, tourId: null, waypoints: null, error: 'network' };
        }

        const data = await response.json();
        const tourId: number | null = data.id ?? null;
        const totalDistanceKm = data.totalDistance ? data.totalDistance / 1000 : null;
        const totalDurationMin = data.totalDuration ? data.totalDuration / 60 : null;

        if (data.segments && data.segments.length > 0) {
            let allCoordinates: RoutePoint[] = [];
            let allSteps: NavigationStep[] = [];
            let allWaypoints: Waypoint[] = [];

            for (let i = 0; i < data.segments.length; i++) {
                const segment = data.segments[i];
                const geometryObject = JSON.parse(segment.geometry);

                if (geometryObject.coordinates && Array.isArray(geometryObject.coordinates)) {
                    const segmentCoordinates = geometryObject.coordinates.map(
                        (coord: [number, number]) => ({ latitude: coord[1], longitude: coord[0] })
                    );
                    if (i > 0 && segmentCoordinates.length > 0) segmentCoordinates.shift();
                    allCoordinates = allCoordinates.concat(segmentCoordinates);
                }

                try {
                    const segmentSteps = JSON.parse(segment.steps);
                    if (segmentSteps && Array.isArray(segmentSteps)) {
                        allSteps = allSteps.concat(segmentSteps);
                    }
                } catch {
                    // steps non parsables, on continue sans
                }

                if (segment.waypoints && Array.isArray(segment.waypoints)) {
                    const segmentWaypoints: Waypoint[] = segment.waypoints
                        .filter((wp: any) => wp.coordinates?.latitude != null && wp.coordinates?.longitude != null)
                        .map((wp: any) => ({
                            name: wp.name ?? '',
                            latitude: wp.coordinates.latitude,
                            longitude: wp.coordinates.longitude,
                        }));
                    // Skip first waypoint of subsequent segments (duplicate of previous segment's last)
                    const waypointsToAdd = i > 0 ? segmentWaypoints.slice(1) : segmentWaypoints;
                    allWaypoints = allWaypoints.concat(waypointsToAdd);
                }
            }

            return {
                coordinates: allCoordinates.length > 0 ? allCoordinates : null,
                steps: allSteps.length > 0 ? allSteps : null,
                totalDistance: totalDistanceKm,
                totalDuration: totalDurationMin,
                tourId,
                waypoints: allWaypoints.length > 0 ? allWaypoints : null,
            };
        }

        console.error('[API] fetchRouteByCode: format invalide ou aucun segment');
        return { coordinates: null, steps: null, totalDistance: null, totalDuration: null, tourId: null, waypoints: null, error: 'invalid_format' };
    } catch (error) {
        console.error('[API] fetchRouteByCode erreur réseau:', error);
        return { coordinates: null, steps: null, totalDistance: null, totalDuration: null, tourId: null, waypoints: null, error: 'network' };
    }
};

export const fetchRouteFromOSRM = async (start: RoutePoint, end: RoutePoint): Promise<RoutePoint[] | null> => {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=polyline`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.code === "Ok" && data.routes?.length > 0) {
            return polyline.decode(data.routes[0].geometry).map(
                (coord: [number, number]) => ({ latitude: coord[0], longitude: coord[1] })
            );
        }
        console.error('[OSRM] Erreur recalcul:', data.message);
        return null;
    } catch (error) {
        console.error('[OSRM] Erreur réseau:', error);
        return null;
    }
};

export const fetchRouteToStart = async (
    tourId: number,
    userLocation: RoutePoint
): Promise<RoutePoint[] | null> => {
    try {
        const url = `${API_BASE_URL}/tours/${tourId}/route-to-start`;
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
            const body = await response.text();
            console.error('[API] fetchRouteToStart erreur:', response.status, body);
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
        console.error('[API] fetchRouteToStart erreur réseau:', error);
        return null;
    }
};

export const joinAsOrganiser = async (code: string): Promise<string | null> => {
    try {
        const url = `${API_BASE_URL}/tours/share/${code}/join`;
        const response = await fetch(url, { method: 'POST' });
        if (!response.ok) return null;
        const data = await response.json();
        return data.sessionToken ?? data.token ?? null;
    } catch (error) {
        console.error('[API] joinAsOrganiser erreur:', error);
        return null;
    }
};

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
                'X-Session-Token': token,
            },
            body: JSON.stringify({
                latitude: position.latitude,
                longitude: position.longitude,
            }),
        });
    } catch (error) {
        console.error('[API] sendOrganiserPosition erreur:', error);
    }
};

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
                if (pos) onPosition(pos);
            }
        };

        xhr.onload = () => {
            if (isActive) setTimeout(connect, 3000);
        };

        xhr.onerror = () => {
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
