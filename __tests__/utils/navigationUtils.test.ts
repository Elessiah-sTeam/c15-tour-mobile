import {
    calculateBearing,
    calculateDistance,
    findClosestRoutePoint,
    checkIfOffRoute,
    smoothHeading,
    isValidGPSPosition,
    calculateRemainingDistance,
    parseStepsToInstructions,
} from '@/utils/navigationUtils';

describe('calculateDistance', () => {
    it('retourne 0 pour deux points identiques', () => {
        expect(calculateDistance(48.8566, 2.3522, 48.8566, 2.3522)).toBe(0);
    });

    it('calcule la distance Paris → Lyon (~392 km)', () => {
        const dist = calculateDistance(48.8566, 2.3522, 45.7640, 4.8357);
        expect(dist).toBeGreaterThan(380);
        expect(dist).toBeLessThan(410);
    });

    it('calcule une courte distance avec précision raisonnable', () => {
        // ~1.11 km pour 0.01° de latitude
        const dist = calculateDistance(47.0, 1.0, 47.01, 1.0);
        expect(dist).toBeCloseTo(1.11, 0);
    });
});

describe('calculateBearing', () => {
    it('retourne ~0° vers le nord', () => {
        const bearing = calculateBearing(47.0, 1.0, 48.0, 1.0);
        expect(bearing).toBeCloseTo(0, 0);
    });

    it('retourne ~90° vers l\'est', () => {
        const bearing = calculateBearing(47.0, 1.0, 47.0, 2.0);
        expect(bearing).toBeCloseTo(90, 0);
    });

    it('retourne ~180° vers le sud', () => {
        const bearing = calculateBearing(48.0, 1.0, 47.0, 1.0);
        expect(bearing).toBeCloseTo(180, 0);
    });

    it('retourne ~270° vers l\'ouest', () => {
        const bearing = calculateBearing(47.0, 2.0, 47.0, 1.0);
        expect(bearing).toBeCloseTo(270, 0);
    });

    it('reste dans l\'intervalle [0, 360]', () => {
        const bearing = calculateBearing(10.0, 170.0, 10.0, -170.0);
        expect(bearing).toBeGreaterThanOrEqual(0);
        expect(bearing).toBeLessThanOrEqual(360);
    });
});

describe('smoothHeading', () => {
    it('converge vers la cible avec un facteur 1.0', () => {
        const result = smoothHeading(0, 90, 1.0);
        expect(result).toBeCloseTo(90, 1);
    });

    it('applique un lissage partiel avec facteur 0.5', () => {
        const result = smoothHeading(0, 90, 0.5);
        expect(result).toBeCloseTo(45, 1);
    });

    it('gère le passage 350° → 10° sans faire le grand tour', () => {
        // diff = -340° → corrigé à +20°, donc résultat proche de 360° (= 0°)
        const result = smoothHeading(350, 10, 1.0);
        expect(result).toBeCloseTo(10, 0);
    });

    it('gère le passage 10° → 350° sans faire le grand tour', () => {
        const result = smoothHeading(10, 350, 1.0);
        expect(result).toBeCloseTo(350, 0);
    });

    it('retourne une valeur dans [0, 360]', () => {
        const result = smoothHeading(359, 1, 0.5);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThan(360);
    });
});

describe('findClosestRoutePoint', () => {
    const route = [
        { latitude: 47.0, longitude: 1.0 },
        { latitude: 47.1, longitude: 1.0 },
        { latitude: 47.2, longitude: 1.0 },
        { latitude: 47.3, longitude: 1.0 },
    ];

    it('retourne 0 quand la position est sur le premier point', () => {
        expect(findClosestRoutePoint({ latitude: 47.0, longitude: 1.0 }, route)).toBe(0);
    });

    it('retourne le dernier index quand on est à la fin', () => {
        expect(findClosestRoutePoint({ latitude: 47.3, longitude: 1.0 }, route)).toBe(3);
    });

    it('retourne le point du milieu le plus proche', () => {
        expect(findClosestRoutePoint({ latitude: 47.15, longitude: 1.0 }, route)).toBe(1);
    });

    it('retourne 0 pour un tableau d\'un seul point', () => {
        expect(findClosestRoutePoint({ latitude: 99.0, longitude: 99.0 }, [{ latitude: 47.0, longitude: 1.0 }])).toBe(0);
    });
});

describe('checkIfOffRoute', () => {
    const route = [
        { latitude: 47.0, longitude: 1.0 },
        { latitude: 47.1, longitude: 1.0 },
        { latitude: 47.2, longitude: 1.0 },
    ];

    it('retourne false quand on est sur le trajet', () => {
        expect(checkIfOffRoute({ latitude: 47.1, longitude: 1.0 }, route)).toBe(false);
    });

    it('retourne false à moins de 50m du trajet', () => {
        // 0.0003° de longitude ≈ 25m
        expect(checkIfOffRoute({ latitude: 47.1, longitude: 1.0003 }, route)).toBe(false);
    });

    it('retourne true à plus de 50m du trajet', () => {
        // 0.001° ≈ 80m
        expect(checkIfOffRoute({ latitude: 47.1, longitude: 1.001 }, route)).toBe(true);
    });
});

describe('isValidGPSPosition', () => {
    const prev = { latitude: 47.0, longitude: 1.0 };

    it('accepte la première position (pas de précédent)', () => {
        expect(isValidGPSPosition({ latitude: 99.0, longitude: 99.0 }, null)).toBe(true);
    });

    it('accepte un déplacement raisonnable (<100m)', () => {
        // ~11m
        expect(isValidGPSPosition({ latitude: 47.0001, longitude: 1.0 }, prev)).toBe(true);
    });

    it('rejette un saut trop grand (>100m)', () => {
        // ~1.11km
        expect(isValidGPSPosition({ latitude: 47.01, longitude: 1.0 }, prev)).toBe(false);
    });

    it('respecte le seuil personnalisé', () => {
        // ~111m, seuil à 200m → valide
        expect(isValidGPSPosition({ latitude: 47.001, longitude: 1.0 }, prev, 200)).toBe(true);
        // même point, seuil à 50m → invalide
        expect(isValidGPSPosition({ latitude: 47.001, longitude: 1.0 }, prev, 50)).toBe(false);
    });
});

describe('calculateRemainingDistance', () => {
    const route = [
        { latitude: 47.0, longitude: 1.0 },
        { latitude: 47.1, longitude: 1.0 },
        { latitude: 47.2, longitude: 1.0 },
    ];

    it('retourne 0 (ou quasi) depuis le dernier point', () => {
        const dist = calculateRemainingDistance({ latitude: 47.2, longitude: 1.0 }, route, 2);
        expect(dist).toBeCloseTo(0, 1);
    });

    it('retourne la distance totale depuis le premier point', () => {
        const dist = calculateRemainingDistance({ latitude: 47.0, longitude: 1.0 }, route, 0);
        // Deux segments de ~11.1km chacun
        expect(dist).toBeGreaterThan(20);
        expect(dist).toBeLessThan(25);
    });
});

describe('parseStepsToInstructions', () => {
    const makeStep = (type: string, modifier?: string, name?: string) => ({
        maneuver: { type, modifier, location: [1.0, 47.0] as [number, number] },
        distance: 500,
        duration: 60,
        name,
        geometry: { coordinates: [], type: 'LineString' },
    });

    it('génère "Tournez à gauche" pour turn left', () => {
        const [inst] = parseStepsToInstructions([makeStep('turn', 'left')]);
        expect(inst.instruction).toBe('Tournez à gauche');
    });

    it('génère "Tournez à droite" pour turn right', () => {
        const [inst] = parseStepsToInstructions([makeStep('turn', 'right')]);
        expect(inst.instruction).toBe('Tournez à droite');
    });

    it('ajoute le nom de rue si présent', () => {
        const [inst] = parseStepsToInstructions([makeStep('turn', 'left', 'Rue de la Paix')]);
        expect(inst.instruction).toBe('Tournez à gauche sur Rue de la Paix');
    });

    it('génère "Départ" pour depart', () => {
        const [inst] = parseStepsToInstructions([makeStep('depart')]);
        expect(inst.instruction).toBe('Départ');
    });

    it('convertit la distance en km', () => {
        const [inst] = parseStepsToInstructions([makeStep('turn', 'right')]);
        expect(inst.distance).toBe(0.5); // 500m → 0.5km
    });

    it('génère "Continuez tout droit" pour continue', () => {
        const [inst] = parseStepsToInstructions([makeStep('continue')]);
        expect(inst.instruction).toBe('Continuez tout droit');
    });

    it('génère "Sortez du rond-point" pour exit roundabout', () => {
        const [inst] = parseStepsToInstructions([makeStep('exit roundabout')]);
        expect(inst.instruction).toBe('Sortez du rond-point');
    });
});
