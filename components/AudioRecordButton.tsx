import React, { useRef, useState } from 'react';
import { View, Text, PanResponder, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { sendAudioMessage } from '@/services/audioService';

const CANCEL_THRESHOLD = -90;

interface Props {
    routeCode: string;
    organiserToken: string;
    onMessageSent?: () => void;
}

export function AudioRecordButton({ routeCode, organiserToken, onMessageSent }: Props) {
    const [isRecording, setIsRecording] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [duration, setDuration] = useState(0);

    const recordingRef = useRef<Audio.Recording | null>(null);
    const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const translateX = useRef(new Animated.Value(0)).current;
    const scale = useRef(new Animated.Value(1)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

    const startPulse = () => {
        pulseLoopRef.current = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
            ])
        );
        pulseLoopRef.current.start();
    };

    const stopPulse = () => {
        pulseLoopRef.current?.stop();
        pulseAnim.setValue(1);
    };

    const cleanup = () => {
        if (durationIntervalRef.current) {
            clearInterval(durationIntervalRef.current);
            durationIntervalRef.current = null;
        }
        setIsRecording(false);
        setIsCancelling(false);
        setDuration(0);
        stopPulse();
        Animated.parallel([
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 120 }),
            Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
        ]).start();
        // Remettre le mode audio en lecture seule après l'enregistrement
        Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
    };

    const startRecording = async () => {
        if (recordingRef.current) return; // enregistrement déjà en cours

        try {
            const { status } = await Audio.requestPermissionsAsync();
            if (status !== 'granted') {
                console.warn('[Audio] Permission microphone refusée');
                return;
            }

            // Libérer toute session audio résiduelle avant d'en créer une nouvelle
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
                playsInSilentModeIOS: true,
            });
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            recordingRef.current = recording;

            setIsRecording(true);
            setDuration(0);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            startPulse();

            durationIntervalRef.current = setInterval(
                () => setDuration(d => d + 1),
                1000
            );
        } catch (err) {
            console.error('[Audio] Erreur démarrage enregistrement:', err);
        }
    };

    const stopAndSend = async () => {
        if (!recordingRef.current) return;
        try {
            await recordingRef.current.stopAndUnloadAsync();
            const uri = recordingRef.current.getURI();
            recordingRef.current = null;

            if (!organiserToken) {
                console.warn('[Audio] Token organisateur manquant, message non envoyé');
                return;
            }

            if (uri) {
                setIsSending(true);
                const success = await sendAudioMessage(routeCode, organiserToken, uri);
                if (success) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    onMessageSent?.();
                }
                setIsSending(false);
            }
        } catch (err) {
            console.error('[Audio] Erreur envoi:', err);
            setIsSending(false);
        }
    };

    const cancelRecording = async () => {
        if (!recordingRef.current) return;
        try {
            await recordingRef.current.stopAndUnloadAsync();
            recordingRef.current = null;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch (err) {
            console.error('[Audio] Erreur annulation:', err);
        }
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,

            onPanResponderGrant: () => {
                startRecording();
                Animated.spring(scale, { toValue: 1.1, useNativeDriver: true }).start();
            },

            onPanResponderMove: (_, gs) => {
                const dx = Math.min(0, gs.dx);
                translateX.setValue(dx);
                setIsCancelling(dx < CANCEL_THRESHOLD);
            },

            onPanResponderRelease: (_, gs) => {
                if (gs.dx < CANCEL_THRESHOLD) {
                    cancelRecording();
                } else {
                    stopAndSend();
                }
                cleanup();
            },

            onPanResponderTerminate: () => {
                cancelRecording();
                cleanup();
            },
        })
    ).current;

    const formatDuration = (s: number) =>
        `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

    const trashOpacity = translateX.interpolate({
        inputRange: [CANCEL_THRESHOLD, CANCEL_THRESHOLD / 2, 0],
        outputRange: [1, 0.5, 0.15],
        extrapolate: 'clamp',
    });

    const hintOpacity = translateX.interpolate({
        inputRange: [CANCEL_THRESHOLD, -20, 0],
        outputRange: [0.3, 0.8, 1],
        extrapolate: 'clamp',
    });

    return (
        <View style={styles.wrapper} pointerEvents="box-none">
            {isRecording && (
                <View style={styles.recordingRow}>
                    {/* Zone poubelle */}
                    <Animated.View style={[styles.trashZone, { opacity: trashOpacity }]}>
                        <Ionicons
                            name={isCancelling ? 'trash' : 'trash-outline'}
                            size={22}
                            color={isCancelling ? '#FF4444' : '#999'}
                        />
                        {isCancelling && (
                            <Text style={styles.cancelLabel}>Relâcher{'\n'}pour annuler</Text>
                        )}
                    </Animated.View>

                    {/* Durée */}
                    <Animated.View style={[styles.durationBadge, { opacity: hintOpacity }]}>
                        <View style={styles.recordDot} />
                        <Text style={styles.durationText}>{formatDuration(duration)}</Text>
                        <Text style={styles.swipeHint}>  ← annuler</Text>
                    </Animated.View>
                </View>
            )}

            {/* Bouton micro */}
            <Animated.View
                style={[
                    styles.buttonWrapper,
                    { transform: [{ translateX }, { scale: Animated.multiply(scale, pulseAnim) }] },
                ]}
                {...panResponder.panHandlers}
            >
                <View style={[
                    styles.micButton,
                    isRecording && styles.micButtonRecording,
                    isCancelling && styles.micButtonCancelling,
                ]}>
                    <Ionicons
                        name={
                            isSending ? 'cloud-upload-outline'
                                : isRecording ? 'radio-button-on'
                                    : 'mic'
                        }
                        size={26}
                        color="white"
                    />
                </View>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    recordingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginRight: 8,
    },
    trashZone: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 44,
    },
    cancelLabel: {
        color: '#FF4444',
        fontSize: 10,
        textAlign: 'center',
        marginTop: 2,
        lineHeight: 13,
    },
    durationBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.72)',
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 7,
    },
    recordDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#FF4444',
        marginRight: 6,
    },
    durationText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },
    swipeHint: {
        color: '#aaa',
        fontSize: 12,
        marginLeft: 4,
    },
    buttonWrapper: {
        // no extra styles needed
    },
    micButton: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#BB487C',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    micButtonRecording: {
        backgroundColor: '#E53935',
    },
    micButtonCancelling: {
        backgroundColor: '#888',
    },
});
