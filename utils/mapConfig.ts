import { RoutePoint } from "./navigationUtils";

// Style vectoriel OpenStreetMap, gratuit, sans clé API ni compte de facturation.
// Rendu nativement par MapLibre (aucune dépendance à Google Maps).
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

// MapLibre attend des coordonnées au format [longitude, latitude] (ordre GeoJSON),
// contrairement à react-native-maps qui utilisait { latitude, longitude }.
export const toLngLat = (p: RoutePoint): [number, number] => [p.longitude, p.latitude];

// Construit une Feature LineString GeoJSON à partir d'une liste de points.
export const routeToLineString = (points: RoutePoint[]): GeoJSON.Feature<GeoJSON.LineString> => ({
    type: "Feature",
    properties: {},
    geometry: {
        type: "LineString",
        coordinates: points.map(toLngLat),
    },
});

// Construit une FeatureCollection de LineStrings à partir de plusieurs tracés.
export const linesToFeatureCollection = (
    lines: RoutePoint[][]
): GeoJSON.FeatureCollection<GeoJSON.LineString> => ({
    type: "FeatureCollection",
    features: lines
        .filter((l) => l.length >= 2)
        .map((l) => ({
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: l.map(toLngLat) },
        })),
});

// Bornes [west, south, east, north] englobant tous les points (pour fitBounds).
export const computeBounds = (
    points: RoutePoint[]
): [number, number, number, number] | null => {
    if (points.length === 0) return null;
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    for (const p of points) {
        if (p.longitude < west) west = p.longitude;
        if (p.longitude > east) east = p.longitude;
        if (p.latitude < south) south = p.latitude;
        if (p.latitude > north) north = p.latitude;
    }
    return [west, south, east, north];
};
