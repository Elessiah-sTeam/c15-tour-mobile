import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Marker } from "@maplibre/maplibre-react-native";
import { Ionicons } from "@expo/vector-icons";
import { RoutePoint } from "@/utils/navigationUtils";
import { toLngLat } from "@/utils/mapConfig";

interface MapPinProps {
    id: string;
    point: RoutePoint;
    color: string;
    label?: string;
    size?: number;
}

// Marqueur en forme de goutte avec bulle de libellé au clic
// (remplace le title/callout natif de react-native-maps, absent de MapLibre).
export function MapPin({ id, point, color, label, size = 34 }: MapPinProps) {
    const [showLabel, setShowLabel] = useState(false);

    return (
        <Marker
            id={id}
            lngLat={toLngLat(point)}
            anchor="bottom"
            onPress={() => setShowLabel((s) => !s)}
        >
            <View style={styles.container}>
                {showLabel && !!label && (
                    <View style={styles.callout}>
                        <Text style={styles.calloutText} numberOfLines={1}>
                            {label}
                        </Text>
                    </View>
                )}
                <Ionicons name="location" size={size} color={color} />
            </View>
        </Marker>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: "center",
    },
    callout: {
        backgroundColor: "rgba(20, 20, 20, 0.92)",
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
        marginBottom: 4,
        maxWidth: 200,
    },
    calloutText: {
        color: "white",
        fontSize: 12,
        fontWeight: "600",
    },
});
