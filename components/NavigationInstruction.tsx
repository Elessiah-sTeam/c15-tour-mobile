import React from "react";
import { View, Text } from "react-native";
import { mapStyles } from "../styles/MapStyles";
import { NavigationInstruction as NavigationInstructionType } from "../utils/navigationUtils";

interface NavigationInstructionProps {
    instruction: NavigationInstructionType | null;
}

export const NavigationInstruction: React.FC<NavigationInstructionProps> = ({ instruction }) => {
    if (!instruction) return null;

    return (
        <View style={mapStyles.instructionPanel}>
            <Text style={mapStyles.instructionText}>
                {instruction.instruction}
            </Text>
            <Text style={mapStyles.instructionDistance}>
                {instruction.distance < 1
                    ? ` ${Math.round(instruction.distance * 1000)}m`
                    : ` ${instruction.distance.toFixed(1)}km`}
            </Text>
        </View>
    );
};