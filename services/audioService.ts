import * as FileSystem from 'expo-file-system/legacy';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.52.85.50:8080';

export interface AudioMessage {
    id: number;
    url: string;
    createdAt: string;
}

export const sendAudioMessage = async (
    code: string,
    token: string,
    fileUri: string
): Promise<boolean> => {
    try {
        const url = `${API_BASE_URL}/tours/share/${code}/audio-messages`;
        const FIELD_NAME = 'file';

        const formData = new FormData();
        formData.append(FIELD_NAME, {
            uri: fileUri,
            type: 'audio/ogg',
            name: 'message.ogg',
        } as any);

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'X-Session-Token': token },
            body: formData,
        });

        if (!response.ok) {
            const responseBody = await response.text();
            console.error('[Audio] Erreur envoi:', response.status, responseBody);
        }
        return response.ok;
    } catch (error) {
        console.error('[Audio] Erreur envoi:', error);
        return false;
    }
};

// Retourne un tableau normalisé (l'API peut renvoyer un objet ou un tableau)
export const fetchAudioMessages = async (code: string): Promise<AudioMessage[]> => {
    try {
        const url = `${API_BASE_URL}/tours/share/${code}/audio-messages`;
        const response = await fetch(url);
        if (!response.ok) return [];

        const data = await response.json();
        if (Array.isArray(data)) return data;
        if (data && data.id != null) return [data];
        return [];
    } catch (error) {
        console.error('[Audio] Erreur fetch messages:', error);
        return [];
    }
};

export const downloadAudioFile = async (
    relativeUrl: string,
    messageId: number
): Promise<string | null> => {
    try {
        const filename = relativeUrl.split('/').pop() ?? `audio_${messageId}.m4a`;
        const localUri = `${FileSystem.cacheDirectory}${filename}`;

        const fileInfo = await FileSystem.getInfoAsync(localUri);
        if (fileInfo.exists) return localUri;

        const fullUrl = `${API_BASE_URL}${relativeUrl}`;
        const result = await FileSystem.downloadAsync(fullUrl, localUri);
        return result.status === 200 ? result.uri : null;
    } catch (error) {
        console.error('[Audio] Erreur téléchargement:', error);
        return null;
    }
};
