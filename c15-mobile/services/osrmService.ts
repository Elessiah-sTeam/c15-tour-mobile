import { RoutePoint } from '../utils/navigationUtils';

// Récupérer le trajet depuis OSRM
export const fetchRouteFromOSRM = async (start: RoutePoint, end: RoutePoint): Promise<RoutePoint[] | null> => {
    try {
        // Format OSRM: longitude,latitude (attention, inversé!)
        const url = `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};-0.5518,47.4711?overview=full&geometries=geojson`;

        console.log("URL OSRM:", url);
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