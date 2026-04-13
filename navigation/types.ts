export type RootStackParamList = {
    Home: undefined;
    RoutePreview: {
        routeCode: string;
        tourId: number;
        coordinates: string;  // JSON.stringify(RoutePoint[])
        steps: string;        // JSON.stringify(NavigationStep[])
        totalDistance: number;
        totalDuration: number;
    };
    Map: {
        tourId: number;
        coordinates: string;       // trajet complet (route-to-start + trajet principal)
        steps: string;             // steps du trajet principal
        totalDistance: number;
        totalDuration: number;
    };
};