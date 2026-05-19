import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
    visible: boolean;
    onHide: () => void;
}

export function AudioNotificationBanner({ visible, onHide }: Props) {
    const translateY = useRef(new Animated.Value(-100)).current;
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!visible) return;

        if (timerRef.current) clearTimeout(timerRef.current);

        Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 80,
            friction: 10,
        }).start();

        timerRef.current = setTimeout(() => {
            Animated.timing(translateY, {
                toValue: -100,
                duration: 300,
                useNativeDriver: true,
            }).start(() => onHide());
        }, 3500);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [visible]);

    if (!visible) return null;

    return (
        <Animated.View style={[styles.banner, { transform: [{ translateY }] }]}>
            <Ionicons name="mic" size={18} color="white" style={styles.icon} />
            <Text style={styles.text}>Message audio de l'organisateur</Text>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    banner: {
        position: 'absolute',
        top: 140,
        left: 10,
        right: 10,
        backgroundColor: '#FF6B00',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 10,
        zIndex: 9999,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    icon: {
        marginRight: 8,
    },
    text: {
        color: 'white',
        fontWeight: '700',
        fontSize: 14,
    },
});
