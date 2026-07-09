import { fetchRouteByCode, fetchRouteRedirect } from '@/services/osrmService';

const MOCK_GEOMETRY = JSON.stringify({
    type: 'LineString',
    coordinates: [
        [-1.55, 47.22],
        [-0.56, 47.48],
    ],
});

const MOCK_STEPS = JSON.stringify([
    {
        maneuver: { type: 'depart', location: [-1.55, 47.22] },
        distance: 1000,
        duration: 120,
        geometry: { coordinates: [[-1.55, 47.22], [-1.0, 47.3]], type: 'LineString' },
    },
    {
        maneuver: { type: 'turn', modifier: 'left', location: [-0.56, 47.48] },
        distance: 500,
        duration: 60,
        geometry: { coordinates: [[-1.0, 47.3], [-0.56, 47.48]], type: 'LineString' },
    },
]);

const makeTourResponse = (overrides = {}) => ({
    id: 42,
    totalDistance: 256340,
    totalDuration: 14400,
    segments: [
        {
            name: 'Segment 1',
            geometry: MOCK_GEOMETRY,
            steps: MOCK_STEPS,
            waypoints: [
                { name: 'Départ Nantes', coordinates: { latitude: 47.22, longitude: -1.55 } },
                { name: 'Étape Angers', coordinates: { latitude: 47.48, longitude: -0.56 } },
            ],
            breakDuration: 1800,
            estimatedDeparture: '2024-06-01T10:30:00Z',
        },
    ],
    ...overrides,
});

global.fetch = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    (console.error as jest.Mock).mockRestore();
});

describe('fetchRouteByCode', () => {
    it('retourne les coordonnées parsées depuis les segments', async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => makeTourResponse(),
        });

        const result = await fetchRouteByCode('C15ROC');

        expect(result.coordinates).not.toBeNull();
        expect(result.coordinates!.length).toBe(2);
        expect(result.coordinates![0]).toEqual({ latitude: 47.22, longitude: -1.55 });
        expect(result.coordinates![1]).toEqual({ latitude: 47.48, longitude: -0.56 });
    });

    it('retourne le tourId correctement', async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => makeTourResponse(),
        });

        const result = await fetchRouteByCode('C15ROC');
        expect(result.tourId).toBe(42);
    });

    it('convertit totalDistance en km', async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => makeTourResponse(),
        });

        const result = await fetchRouteByCode('C15ROC');
        expect(result.totalDistance).toBeCloseTo(256.34, 1);
    });

    it('convertit totalDuration en minutes', async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => makeTourResponse(),
        });

        const result = await fetchRouteByCode('C15ROC');
        expect(result.totalDuration).toBeCloseTo(240, 0);
    });

    it('retourne error not_found sur 404', async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 404 });

        const result = await fetchRouteByCode('INVALID');
        expect(result.error).toBe('not_found');
        expect(result.coordinates).toBeNull();
    });

    it('retourne error network sur erreur réseau', async () => {
        (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

        const result = await fetchRouteByCode('C15ROC');
        expect(result.error).toBe('network');
    });

    it('extrait les segmentInfos correctement', async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => makeTourResponse(),
        });

        const result = await fetchRouteByCode('C15ROC');
        expect(result.segments).not.toBeNull();
        expect(result.segments![0].name).toBe('Segment 1');
        expect(result.segments![0].breakDuration).toBe(1800);
        expect(result.segments![0].estimatedDeparture).toBe('2024-06-01T10:30:00Z');
    });

    it('déduplique les waypoints entre segments', async () => {
        const twoSegments = makeTourResponse({
            segments: [
                {
                    name: 'Seg 1',
                    geometry: MOCK_GEOMETRY,
                    steps: MOCK_STEPS,
                    waypoints: [
                        { name: 'A', coordinates: { latitude: 47.0, longitude: 1.0 } },
                        { name: 'B', coordinates: { latitude: 47.1, longitude: 1.1 } },
                    ],
                },
                {
                    name: 'Seg 2',
                    geometry: MOCK_GEOMETRY,
                    steps: MOCK_STEPS,
                    waypoints: [
                        { name: 'B', coordinates: { latitude: 47.1, longitude: 1.1 } }, // doublon à ignorer
                        { name: 'C', coordinates: { latitude: 47.2, longitude: 1.2 } },
                    ],
                },
            ],
        });

        (fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => twoSegments,
        });

        const result = await fetchRouteByCode('C15ROC');
        // A, B, C — pas de doublon de B
        expect(result.waypoints!.length).toBe(3);
        expect(result.waypoints!.map(w => w.name)).toEqual(['A', 'B', 'C']);
    });
});

describe('fetchRouteRedirect', () => {
    const mockRedirectResponse = {
        tour: {
            segments: [
                {
                    geometry: MOCK_GEOMETRY,
                    steps: MOCK_STEPS,
                },
            ],
        },
        route: {
            geometry: JSON.stringify({
                type: 'LineString',
                coordinates: [[-1.60, 47.20], [-1.55, 47.22]],
            }),
            steps: MOCK_STEPS,
        },
    };

    it('concatène approche + trajet tour', async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => mockRedirectResponse,
        });

        const result = await fetchRouteRedirect('C15ROC', { latitude: 47.20, longitude: -1.60 }, 0);
        expect(result).not.toBeNull();
        // Premier point = début de l'approche
        expect(result!.coordinates[0]).toEqual({ latitude: 47.20, longitude: -1.60 });
        // Dernier point = fin du tour
        expect(result!.coordinates[result!.coordinates.length - 1]).toEqual({ latitude: 47.48, longitude: -0.56 });
    });

    it('retourne les steps combinés approche + tour', async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => mockRedirectResponse,
        });

        const result = await fetchRouteRedirect('C15ROC', { latitude: 47.20, longitude: -1.60 }, 0);
        expect(result).not.toBeNull();
        expect(result!.steps.length).toBeGreaterThan(0);
    });

    it('retourne null sur erreur serveur', async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'Error' });

        const result = await fetchRouteRedirect('C15ROC', { latitude: 47.0, longitude: 1.0 }, 0);
        expect(result).toBeNull();
    });
});
