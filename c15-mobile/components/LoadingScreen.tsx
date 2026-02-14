import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { mapStyles } from "../styles/MapStyles";

interface LoadingScreenProps {
    message?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ message = "Chargement de la carte..." }) => {
    return (
        <View style={mapStyles.fullScreenLoader}>
            <ActivityIndicator size="large" color="#4285F4" />
            <Text style={mapStyles.loaderText}>{message}</Text>
        </View>
    );
};