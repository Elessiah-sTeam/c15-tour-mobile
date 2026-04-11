import { StyleSheet } from "react-native";

export const mapStyles = StyleSheet.create({
    container: {
        flex: 1
    },
    map: {
        flex: 1
    },
    // Panneau d'instructions
    instructionPanel: {
        position: "absolute",
        top: 60,
        left: 10,
        right: 10,
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        borderRadius: 12,
        padding: 15,
        elevation: 5,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        alignItems: "center", // Centrer le contenu
    },
    instructionText: {
        fontSize: 18,
        fontWeight: "600",
        color: "#333",
        textAlign: "center", // Centrer le texte
        marginBottom: 5, // Espacement entre texte et distance
    },
    instructionDistance: {
        fontSize: 24,
        fontWeight: "bold",
        color: "#BB487C",
        textAlign: "center", // Centrer la distance
    },
    // Panneau de statistiques
    statsPanel: {
        position: "absolute",
        bottom: 20,
        left: 10,
        right: 10,
        backgroundColor: "white",
        borderRadius: 15,
        padding: 15,
        elevation: 5,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    statsRow: {
        flexDirection: "row",
        justifyContent: "space-around",
    },
    statBox: {
        alignItems: "center",
    },
    statLabel: {
        fontSize: 12,
        color: "#666",
        marginBottom: 5,
    },
    statValue: {
        fontSize: 24,
        fontWeight: "bold",
        color: "#BB487C",
    },
    statUnit: {
        fontSize: 12,
        color: "#999",
    },
    // Bouton recentrer
    recenterButton: {
        position: "absolute",
        bottom: 100,
        right: 20,
        backgroundColor: "#BB487C",
        width: 50,
        height: 50,
        borderRadius: 25,
        justifyContent: "center",
        alignItems: "center",
        elevation: 5,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
    },
    // Alerte hors trajet
    offRouteAlert: {
        position: "absolute",
        top: 140,
        left: 10,
        right: 10,
        backgroundColor: "rgba(255, 152, 0, 0.95)",
        borderRadius: 8,
        padding: 10,
        alignItems: "center",
    },
    offRouteText: {
        color: "white",
        fontWeight: "bold",
        fontSize: 14,
    },
    // Écran de chargement plein écran
    fullScreenLoader: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "white",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
    },
    loaderText: {
        marginTop: 15,
        fontSize: 16,
        color: "#666",
        fontWeight: "500",
    },
    // Loader dans le panneau de stats
    statsPanelLoader: {
        position: "absolute",
        bottom: 20,
        left: 10,
        right: 10,
        backgroundColor: "white",
        borderRadius: 15,
        padding: 30,
        elevation: 5,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        justifyContent: "center",
        alignItems: "center",
    },
    recalculatingText: {
        marginTop: 10,
        fontSize: 14,
        color: "#666",
    },
});