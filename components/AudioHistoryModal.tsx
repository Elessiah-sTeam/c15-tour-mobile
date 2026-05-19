import React, { useRef, useState } from 'react';
import {
    Modal, View, Text, FlatList,
    TouchableOpacity, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';

export interface StoredAudioMessage {
    id: number;
    createdAt: string;
    localUri: string;
}

interface Props {
    visible: boolean;
    onClose: () => void;
    messages: StoredAudioMessage[];
}

export function AudioHistoryModal({ visible, onClose, messages }: Props) {
    const [playingId, setPlayingId] = useState<number | null>(null);
    const soundRef = useRef<Audio.Sound | null>(null);

    const playMessage = async (msg: StoredAudioMessage) => {
        // Arrêter le son en cours
        if (soundRef.current) {
            await soundRef.current.stopAsync();
            await soundRef.current.unloadAsync();
            soundRef.current = null;
        }
        if (playingId === msg.id) {
            setPlayingId(null);
            return;
        }
        try {
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
                playsInSilentModeIOS: true,
            });
            const { sound } = await Audio.Sound.createAsync({ uri: msg.localUri });
            soundRef.current = sound;
            setPlayingId(msg.id);
            await sound.playAsync();
            sound.setOnPlaybackStatusUpdate((status) => {
                if (status.isLoaded && status.didJustFinish) {
                    sound.unloadAsync();
                    soundRef.current = null;
                    setPlayingId(null);
                }
            });
        } catch (err) {
            console.error('[Audio] Erreur lecture historique:', err);
            setPlayingId(null);
        }
    };

    const handleClose = async () => {
        if (soundRef.current) {
            await soundRef.current.stopAsync();
            await soundRef.current.unloadAsync();
            soundRef.current = null;
        }
        setPlayingId(null);
        onClose();
    };

    const formatTime = (iso: string) => {
        try {
            return new Date(iso).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            });
        } catch {
            return iso;
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={handleClose}
        >
            <View style={styles.backdrop}>
                <View style={styles.sheet}>
                    <View style={styles.header}>
                        <Ionicons name="mic" size={20} color="#BB487C" />
                        <Text style={styles.title}>Messages audio</Text>
                        <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Ionicons name="close" size={24} color="#333" />
                        </TouchableOpacity>
                    </View>

                    {messages.length === 0 ? (
                        <View style={styles.empty}>
                            <Ionicons name="mic-off-outline" size={44} color="#ccc" />
                            <Text style={styles.emptyText}>Aucun message reçu</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={[...messages].reverse()}
                            keyExtractor={m => String(m.id)}
                            contentContainerStyle={styles.list}
                            renderItem={({ item, index }) => (
                                <View style={styles.messageRow}>
                                    <View style={styles.messageLeft}>
                                        <View style={styles.indexBadge}>
                                            <Text style={styles.indexText}>
                                                {messages.length - index}
                                            </Text>
                                        </View>
                                        <Text style={styles.messageTime}>
                                            {formatTime(item.createdAt)}
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        style={[
                                            styles.playButton,
                                            playingId === item.id && styles.playButtonActive,
                                        ]}
                                        onPress={() => playMessage(item)}
                                    >
                                        <Ionicons
                                            name={playingId === item.id ? 'stop' : 'play'}
                                            size={18}
                                            color="white"
                                        />
                                    </TouchableOpacity>
                                </View>
                            )}
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: 'white',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '60%',
        paddingBottom: 32,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    title: {
        flex: 1,
        fontSize: 17,
        fontWeight: '700',
        color: '#333',
    },
    empty: {
        padding: 48,
        alignItems: 'center',
        gap: 12,
    },
    emptyText: {
        color: '#aaa',
        fontSize: 15,
    },
    list: {
        padding: 12,
        gap: 8,
    },
    messageRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#f9f9f9',
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
    },
    messageLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    indexBadge: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: '#BB487C20',
        alignItems: 'center',
        justifyContent: 'center',
    },
    indexText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#BB487C',
    },
    messageTime: {
        fontSize: 14,
        color: '#555',
    },
    playButton: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: '#BB487C',
        alignItems: 'center',
        justifyContent: 'center',
    },
    playButtonActive: {
        backgroundColor: '#E53935',
    },
});
