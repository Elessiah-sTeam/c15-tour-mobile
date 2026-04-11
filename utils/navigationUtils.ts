export interface RoutePoint {
    latitude: number;
    longitude: number;
}

export interface NavigationInstruction {
    distance: number;
    instruction: string;
    type?: string; // Type de manœuvre (turn, roundabout, etc.)
    modifier?: string; // left, right, straight, etc.
}

export interface NavigationStep {
    maneuver: {
        type: string;
        modifier?: string;
        location: [number, number]; // [longitude, latitude]
        bearing_after?: number;
        bearing_before?: number;
    };
    distance: number;
    duration: number;
    name?: string;
    geometry: {
        coordinates: [number, number][];
        type: string;
    };
}

// Convertir les steps de l'API en instructions de navigation
export const parseStepsToInstructions = (steps: NavigationStep[]): NavigationInstruction[] => {
    return steps.map(step => {
        const { maneuver, distance, name } = step;
        let instruction = "";

        // Générer l'instruction selon le type de manœuvre
        switch (maneuver.type) {
            case "depart":
                instruction = "Départ";
                break;
            case "arrive":
                instruction = "Arrivée";
                break;
            case "turn":
                if (maneuver.modifier === "left") {
                    instruction = "Tournez à gauche";
                } else if (maneuver.modifier === "right") {
                    instruction = "Tournez à droite";
                } else if (maneuver.modifier === "slight left") {
                    instruction = "Tournez légèrement à gauche";
                } else if (maneuver.modifier === "slight right") {
                    instruction = "Tournez légèrement à droite";
                } else if (maneuver.modifier === "sharp left") {
                    instruction = "Tournez fortement à gauche";
                } else if (maneuver.modifier === "sharp right") {
                    instruction = "Tournez fortement à droite";
                }
                break;
            case "roundabout":
            case "rotary":
                instruction = `Prenez le rond-point ${maneuver.modifier ? `- sortie ${maneuver.modifier}` : ""}`;
                break;
            case "exit roundabout":
                instruction = "Sortez du rond-point";
                break;
            case "continue":
            case "merge":
                instruction = "Continuez tout droit";
                break;
            case "fork":
                instruction = maneuver.modifier?.includes("left") ? "Restez à gauche" : "Restez à droite";
                break;
            case "end of road":
                instruction = maneuver.modifier?.includes("left") ? "En bout de route, tournez à gauche" : "En bout de route, tournez à droite";
                break;
            case "ramp":
                instruction = "Prenez la bretelle";
                break;
            default:
                instruction = "Continuez";
        }

        // Ajouter le nom de la rue si disponible
        if (name && name.trim() !== "") {
            instruction += ` sur ${name}`;
        }

        return {
            distance: distance / 1000, // Convertir en km
            instruction,
            type: maneuver.type,
            modifier: maneuver.modifier,
        };
    });
};

// Trouver l'instruction suivante selon la position actuelle
export const findNextInstruction = (
    currentPos: RoutePoint,
    steps: NavigationStep[],
    routeCoordinates: RoutePoint[]
): NavigationInstruction | null => {
    // Trouver le point le plus proche sur le trajet
    const closestIndex = findClosestRoutePoint(currentPos, routeCoordinates);

    // Parcourir les steps pour trouver celui qui correspond
    let cumulativeDistance = 0;
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepCoords = step.geometry.coordinates.map(coord => ({
            latitude: coord[1],
            longitude: coord[0],
        }));

        cumulativeDistance += stepCoords.length;

        // Si on n'a pas encore dépassé notre position, continuer
        if (closestIndex > cumulativeDistance) {
            continue;
        }

        // Calculer la distance jusqu'au point de manœuvre
        const maneuverPoint = {
            latitude: step.maneuver.location[1],
            longitude: step.maneuver.location[0],
        };

        const distanceToManeuver = calculateDistance(
            currentPos.latitude,
            currentPos.longitude,
            maneuverPoint.latitude,
            maneuverPoint.longitude
        );

        // Retourner l'instruction du prochain step
        const instructions = parseStepsToInstructions([step]);
        return {
            ...instructions[0],
            distance: distanceToManeuver,
        };
    }

    return null;
};

// Extraire les points de manœuvre pour les afficher sur la carte
export const extractManeuverPoints = (steps: NavigationStep[]): Array<{
    location: RoutePoint;
    type: string;
    modifier?: string;
    instruction: string;
}> => {
    const instructions = parseStepsToInstructions(steps);

    return steps.map((step, index) => ({
        location: {
            latitude: step.maneuver.location[1],
            longitude: step.maneuver.location[0],
        },
        type: step.maneuver.type,
        modifier: step.maneuver.modifier,
        instruction: instructions[index].instruction,
    })).filter(point =>
        // Filtrer pour garder uniquement les manœuvres importantes
        point.type !== 'depart' &&
        point.type !== 'arrive' &&
        point.type !== 'continue'
    );
};

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