// Mock expo-av
jest.mock('expo-av', () => ({
    Audio: {
        setAudioModeAsync: jest.fn(),
        Sound: { createAsync: jest.fn() },
    },
}));

// Mock expo-location
jest.mock('expo-location', () => ({
    requestForegroundPermissionsAsync: jest.fn(),
    getCurrentPositionAsync: jest.fn(),
    watchPositionAsync: jest.fn(),
    watchHeadingAsync: jest.fn(),
    hasServicesEnabledAsync: jest.fn(),
    Accuracy: { Balanced: 3, BestForNavigation: 6 },
}));

// Mock expo-camera
jest.mock('expo-camera', () => ({
    CameraView: 'CameraView',
    useCameraPermissions: jest.fn(() => [{ granted: true }, jest.fn()]),
}));

// Mock react-native-maps
jest.mock('react-native-maps', () => {
    const React = require('react');
    const MockMapView = ({ children }) => React.createElement('MapView', null, children);
    MockMapView.Animated = MockMapView;
    return {
        __esModule: true,
        default: MockMapView,
        Marker: ({ children }) => React.createElement('Marker', null, children),
        Polyline: () => null,
        UrlTile: () => null,
    };
});

// Mock @expo/vector-icons
jest.mock('@expo/vector-icons', () => ({
    Ionicons: 'Ionicons',
}));

// Mock expo-router
jest.mock('expo-router', () => ({
    router: { push: jest.fn(), back: jest.fn() },
    useLocalSearchParams: jest.fn(() => ({})),
}));

// Mock styles (MapStyles uses StyleSheet which needs native)
jest.mock('@/styles/MapStyles', () => ({
    mapStyles: {
        statsPanel: {},
        statsPanelLoader: {},
        statsRow: {},
        statBox: {},
        statLabel: {},
        statValue: {},
        statUnit: {},
        recalculatingText: {},
        instructionPanel: {},
        instructionText: {},
        instructionDistance: {},
        container: {},
        map: {},
        offRouteAlert: {},
        offRouteText: {},
        recenterButton: {},
    },
}));
