export interface RoutePoint {
    latitude: number;
    longitude: number;
}

export interface NavigationInstruction {
    distance: number;
    instruction: string;
}

// Filtrer les positions GPS aberrantes
export const isValidGPSPosition = (
    newPos: RoutePoint,
    previousPos: RoutePoint | null,
    maxJumpMeters: number = 100
): boolean => {
    if (!previousPos) return true; // Première position toujours valide

    const distance = calculateDistance(
        previousPos.latitude,
        previousPos.longitude,
        newPos.latitude,
        newPos.longitude
    );

    // Si le saut est trop grand (en km, donc multiplier par 1000 pour avoir des mètres)
    return distance * 1000 < maxJumpMeters;
};

// Calculer la distance entre deux points (formule de Haversine)
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
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

// Calculer l'angle entre deux points
export const calculateBearing = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
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

// Lisser la rotation (évite les changements brusques)
export const smoothHeading = (currentHeading: number, targetHeading: number, smoothingFactor: number): number => {
    // Gérer le passage 0°/360°
    let diff = targetHeading - currentHeading;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    // Appliquer le lissage
    const newHeading = currentHeading + diff * smoothingFactor;
    return (newHeading + 360) % 360;
};

// Trouver le point le plus proche sur le trajet
export const findClosestRoutePoint = (currentPos: RoutePoint, routePoints: RoutePoint[]): number => {
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

// Calculer la distance restante
export const calculateRemainingDistance = (
    currentPos: RoutePoint,
    routePoints: RoutePoint[],
    startIndex: number
): number => {
    let totalDistance = 0;

    const nextPointIndex = startIndex < routePoints.length ? startIndex : routePoints.length - 1;
    totalDistance += calculateDistance(
        currentPos.latitude,
        currentPos.longitude,
        routePoints[nextPointIndex].latitude,
        routePoints[nextPointIndex].longitude
    );

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

// Déterminer l'instruction de navigation
export const getNavigationInstruction = (
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

// Vérifier si l'utilisateur est hors du trajet
export const checkIfOffRoute = (currentPos: RoutePoint, routePoints: RoutePoint[]): boolean => {
    const closestIndex = findClosestRoutePoint(currentPos, routePoints);
    const distanceToRoute = calculateDistance(
        currentPos.latitude,
        currentPos.longitude,
        routePoints[closestIndex].latitude,
        routePoints[closestIndex].longitude
    );

    return distanceToRoute > 0.05; // 0.05 km = 50 mètres
};