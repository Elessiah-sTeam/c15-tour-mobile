import { RoutePoint, NavigationStep } from '@/utils/navigationUtils';
import polyline from '@mapbox/polyline';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.52.85.50:8080';

export interface Waypoint {
    name: string;
    latitude: number;
    longitude: number;
}

export interface SegmentInfo {
    name: string | null;
    estimatedDeparture: string | null;
    breakDuration: number | null;
    waypointNames: string[];
}

interface FetchRouteResult {
    coordinates: RoutePoint[] | null;
    steps: NavigationStep[] | null;
    totalDistance: number | null;
    totalDuration: number | null;
    tourId: number | null;
    waypoints: Waypoint[] | null;
    segments: SegmentInfo[] | null;
    error?: 'not_found' | 'network' | 'invalid_format';
}

export const fetchRouteByCode = async (routeCode: string): Promise<FetchRouteResult> => {
    try {
        const url = `${API_BASE_URL}/tours/share/${routeCode}`;
        const response = await fetch(url);

        if (response.status === 404) {
            return { coordinates: null, steps: null, totalDistance: null, totalDuration: null, tourId: null, waypoints: null, segments: null, error: 'not_found' };
        }
        if (!response.ok) {
            console.error('[API] fetchRouteByCode erreur:', response.status);
            return { coordinates: null, steps: null, totalDistance: null, totalDuration: null, tourId: null, waypoints: null, segments: null, error: 'network' };
        }

        const data = await response.json();
        const tourId: number | null = data.id ?? null;
        const totalDistanceKm = data.totalDistance ? data.totalDistance / 1000 : null;
        const totalDurationMin = data.totalDuration ? data.totalDuration / 60 : null;

        if (data.segments && data.segments.length > 0) {
            let allCoordinates: RoutePoint[] = [];
            let allSteps: NavigationStep[] = [];
            let allWaypoints: Waypoint[] = [];
            const segmentInfos: SegmentInfo[] = data.segments.map((s: any) => ({
                name: s.name ?? null,
                estimatedDeparture: s.estimatedDeparture ?? null,
                breakDuration: s.breakDuration ?? null,
                waypointNames: Array.isArray(s.waypoints)
                    ? s.waypoints.map((wp: any) => wp.name ?? '').filter((n: string) => n.length > 0)
                    : [],
            }));

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
                segments: segmentInfos.length > 0 ? segmentInfos : null,
            };
        }

        console.error('[API] fetchRouteByCode: format invalide ou aucun segment');
        return { coordinates: null, steps: null, totalDistance: null, totalDuration: null, tourId: null, waypoints: null, segments: null, error: 'invalid_format' };
    } catch (error) {
        console.error('[API] fetchRouteByCode erreur réseau:', error);
        return { coordinates: null, steps: null, totalDistance: null, totalDuration: null, tourId: null, waypoints: null, segments: null, error: 'network' };
    }
}

export interface RouteToStartResult {
    coordinates: RoutePoint[];
    steps: any[];
}

export const fetchRouteToStart = async (
    tourId: number,
    userLocation: RoutePoint
): Promise<RouteToStartResult | null> => {
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
            const coordinates = geometryObject.coordinates.map((coord: [number, number]) => ({
                latitude: coord[1],
                longitude: coord[0],
            }));

            let steps: any[] = [];
            try {
                if (data.steps) {
                    steps = typeof data.steps === 'string' ? JSON.parse(data.steps) : data.steps;
                }
            } catch {
                // steps non parsables, on continue sans
            }

            return { coordinates, steps };
        }
        return null;
    } catch (error) {
        console.error('[API] fetchRouteToStart erreur réseau:', error);
        return null;
    }
};

export interface RouteRedirectResult {
    coordinates: RoutePoint[];
    steps: any[];
}

const parseSegmentsCoordinates = (segments: any[]): RoutePoint[] => {
    let coords: RoutePoint[] = [];
    for (let i = 0; i < segments.length; i++) {
        const geo = typeof segments[i].geometry === 'string'
            ? JSON.parse(segments[i].geometry)
            : segments[i].geometry;
        if (geo?.coordinates && Array.isArray(geo.coordinates)) {
            const segCoords: RoutePoint[] = geo.coordinates.map(
                (c: [number, number]) => ({ latitude: c[1], longitude: c[0] })
            );
            if (i > 0 && segCoords.length > 0) segCoords.shift();
            coords = coords.concat(segCoords);
        }
    }
    return coords;
};

const parseStepsArray = (raw: any): any[] => {
    if (!raw) return [];
    try { return typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch { return []; }
};

export const fetchRouteRedirect = async (
    code: string,
    userLocation: RoutePoint,
    lastReachedWaypointIndex: number
): Promise<RouteRedirectResult | null> => {
    try {
        const url = `${API_BASE_URL}/tours/share/${code}/redirect`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
                lastReachedWaypointIndex,
            }),
        });

        if (!response.ok) {
            const body = await response.text();
            console.error('[API] fetchRouteRedirect erreur:', response.status, body);
            return null;
        }

        const data = await response.json();

        // Format { tour: { segments }, route: { geometry, steps } }
        if (data.tour?.segments && data.route?.geometry) {
            const approachGeo = typeof data.route.geometry === 'string'
                ? JSON.parse(data.route.geometry)
                : data.route.geometry;
            const approachCoords: RoutePoint[] = (approachGeo?.coordinates ?? []).map(
                (c: [number, number]) => ({ latitude: c[1], longitude: c[0] })
            );

            const approachSteps = parseStepsArray(data.route.steps);
            const tourSteps = data.tour.segments.flatMap((s: any) => parseStepsArray(s.steps));
            const allSteps = [...approachSteps, ...tourSteps];

            const tourCoords = parseSegmentsCoordinates(data.tour.segments);

            if (approachCoords.length === 0) return tourCoords.length > 0 ? { coordinates: tourCoords, steps: tourSteps } : null;
            if (tourCoords.length === 0) return approachCoords.length > 0 ? { coordinates: approachCoords, steps: approachSteps } : null;

            const junction = approachCoords[approachCoords.length - 1];
            let minDist = Infinity, junctionIdx = 0;
            tourCoords.forEach((p, i) => {
                const d = Math.abs(p.latitude - junction.latitude) + Math.abs(p.longitude - junction.longitude);
                if (d < minDist) { minDist = d; junctionIdx = i; }
            });

            return {
                coordinates: [...approachCoords, ...tourCoords.slice(junctionIdx + 1)],
                steps: allSteps,
            };
        }

        // Fallback : segments seuls (ancien format)
        if (data.segments && Array.isArray(data.segments) && data.segments.length > 0) {
            const coords = parseSegmentsCoordinates(data.segments);
            const steps = data.segments.flatMap((s: any) => parseStepsArray(s.steps));
            return coords.length > 0 ? { coordinates: coords, steps } : null;
        }

        console.error('[API] fetchRouteRedirect: format de réponse non reconnu');
        return null;
    } catch (error) {
        console.error('[API] fetchRouteRedirect erreur réseau:', error);
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
