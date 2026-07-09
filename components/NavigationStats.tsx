import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { mapStyles } from "@/styles/MapStyles";

interface NavigationStatsProps {
    speed: number;
    remainingDistance: number;
    estimatedTime: number;
    isRecalculating: boolean;
}

export const NavigationStats: React.FC<NavigationStatsProps> = ({
                                                                    speed,
                                                                    remainingDistance,
                                                                    estimatedTime,
                                                                    isRecalculating,
                                                                }) => {
    if (isRecalculating) {
        return (
            <View style={mapStyles.statsPanelLoader}>
                <ActivityIndicator size="large" color="#4285F4" />
                <Text style={mapStyles.recalculatingText}>Recalcul du trajet...</Text>
            </View>
        );
    }

    return (
        <View style={mapStyles.statsPanel}>
            <View style={mapStyles.statsRow}>
                <View style={mapStyles.statBox}>
                    <Text style={mapStyles.statLabel}>Vitesse</Text>
                    <Text style={mapStyles.statValue}>{speed}</Text>
                    <Text style={mapStyles.statUnit}>km/h</Text>
                </View>

                <View style={mapStyles.statBox}>
                    <Text style={mapStyles.statLabel}>Distance</Text>
                    <Text style={mapStyles.statValue}>
                        {remainingDistance < 1
                            ? Math.round(remainingDistance * 1000)
                            : remainingDistance.toFixed(1)}
                    </Text>
                    <Text style={mapStyles.statUnit}>
                        {remainingDistance < 1 ? "m" : "km"}
                    </Text>
                </View>

                <View style={mapStyles.statBox}>
                    <Text style={mapStyles.statLabel}>Arrivée</Text>
                    <Text style={mapStyles.statValue}>
                        {(() => {
                            const arrival = new Date(Date.now() + estimatedTime * 60 * 1000);
                            return `${String(arrival.getHours()).padStart(2, '0')}:${String(arrival.getMinutes()).padStart(2, '0')}`;
                        })()}
                    </Text>
                </View>
            </View>
        </View>
    );
};