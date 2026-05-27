# C15 Tour Mobile

Application mobile GPS de convoi de voiture C15, développée avec React Native (Expo). Elle permet à un **organisateur** de partager son itinéraire et sa position en temps réel, et aux **participants** de suivre le convoi sur une carte GPS avec guidage.

---

## Fonctionnalités

### Rôle Organisateur
- Chargement de l'itinéraire via un **code** ou un **scan QR code**
- Guidage GPS turn-by-turn sur l'itinéraire
- **Partage de position en temps réel** vers tous les participants (envoi toutes les 5 s)
- **Envoi de messages audio** (appui long sur le bouton micro, glisser à gauche pour annuler)

### Rôle Participant
- Chargement de l'itinéraire via code ou QR code
- Guidage GPS turn-by-turn
- **Visualisation de la position de l'organisateur** sur la carte (flèche orange)
- **Réception automatique des messages audio** avec lecture en file d'attente
- **Historique des messages audio** accessible via le bouton micro

### Navigation
- Carte OpenStreetMap
- Recalcul automatique si hors route
- Flèches de virage sur le trajet
- Marqueurs des étapes intermédiaires (waypoints) en orange
- Bouton de recentrage GPS
- Affichage vitesse, distance restante, temps estimé

---

## Stack technique

| Technologie | Version | Usage |
|---|---|---|
| React Native | 0.81.5 | Framework mobile |
| Expo | 54 | Toolchain & modules natifs |
| Expo Router | 6 | Navigation file-based |
| react-native-maps | 1.20.1 | Carte & marqueurs |
| expo-location | 19 | GPS & boussole |
| expo-av | 16 | Enregistrement & lecture audio |
| expo-camera | 16 | Scan QR code |
| expo-haptics | 15 | Retour haptique |
| expo-file-system | 19 | Cache des fichiers audio |

---

## Architecture

```
c15-tour-mobile/
├── app/                            # Routes Expo Router
│   ├── _layout.tsx                 # Layout racine
│   ├── index.tsx                   # → HomeScreen
│   ├── route-preview.tsx           # → RoutePreviewScreen
│   └── map.tsx                     # → MapScreen
├── screens/
│   ├── HomeScreen.tsx              # Accueil + saisie/scan code
│   ├── RoutePreviewScreen.tsx      # Aperçu du trajet avant départ
│   └── MapScreen.tsx               # Navigation GPS en temps réel
├── components/
│   ├── NavigationInstruction.tsx   # Panneau instruction de virage
│   ├── NavigationStats.tsx         # Vitesse / distance / temps
│   ├── LoadingScreen.tsx           # Écran de chargement
│   ├── AudioRecordButton.tsx       # Bouton enregistrement audio (orga)
│   ├── AudioNotificationBanner.tsx # Bandeau nouveau message audio
│   └── AudioHistoryModal.tsx       # Historique messages audio
├── services/
│   ├── osrmService.ts              # Appels API (itinéraire, position, SSE)
│   └── audioService.ts             # Appels API (messages audio)
├── utils/
│   └── navigationUtils.ts          # Calculs GPS, instructions, cap
├── styles/
│   └── MapStyles.ts                # Styles partagés carte
├── assets/                         # Images (flèches, logo, fond)
├── .env                            # Variables d'environnement
└── app.json                        # Configuration Expo
```

---

## Installation

### Prérequis
- Node.js 18+
- Android Studio (émulateur) ou appareil physique avec Expo Go

### Étapes

```bash
# 1. Cloner le dépôt
git clone <url-du-repo>
cd c15-tour-mobile

# 2. Installer les dépendances
npm install

# 3. Configurer l'URL de l'API
cp .env.example .env
# Éditer .env :
# EXPO_PUBLIC_API_BASE_URL=http://<ip-serveur>:8080

# 4. Lancer l'application
npx expo start --clear
```

> **Émulateur Android Studio** : utiliser `http://10.0.2.2:8080` (alias vers `localhost` de la machine hôte).

> **Appareil physique** : utiliser l'IP locale du serveur sur le réseau Wi-Fi, ex. `http://192.168.1.X:8080`.

---

## Configuration

### Variables d'environnement (`.env`)

```env
EXPO_PUBLIC_API_BASE_URL=http://10.52.85.50:8080
```

Les variables préfixées `EXPO_PUBLIC_` sont exposées dans le code client (Expo SDK 49+). Modifier la valeur et relancer avec `--clear` pour prendre en compte le changement.

### Permissions requises

| Permission | Usage |
|---|---|
| `ACCESS_FINE_LOCATION` | GPS navigation |
| `RECORD_AUDIO` | Enregistrement messages audio |
| `MODIFY_AUDIO_SETTINGS` | Gestion session audio iOS/Android |
| `CAMERA` | Scan QR code |

---

## Flux de navigation

```
HomeScreen
  └── Saisie ou scan QR code du tour
        │
        ▼
RoutePreviewScreen
  └── Aperçu de l'itinéraire sur carte
  └── Calcul du trajet vers le point de départ
        │
        ▼
MapScreen
  ├── [Organisateur] Envoi position toutes les 5 s
  ├── [Organisateur] Envoi messages audio
  ├── [Participant]  Réception position organisateur (SSE)
  └── [Participant]  Polling messages audio toutes les 2 s
```

---

## API Back-end

L'application consomme une API Spring Boot. Voici les endpoints utilisés :

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/tours/share/{code}` | Récupère l'itinéraire complet (segments, waypoints, steps) |
| `POST` | `/tours/share/{code}/join` | Rejoindre en tant qu'organisateur — retourne `sessionToken` |
| `POST` | `/tours/{id}/route-to-start` | Calcule le trajet depuis la position actuelle vers le départ |
| `PUT` | `/tours/share/{code}/organiser-position` | Envoie la position de l'organisateur |
| `GET` | `/tours/share/{code}/organiser-position/stream` | Stream SSE de la position organisateur |
| `POST` | `/tours/share/{code}/audio-messages` | Envoie un message audio (multipart, champ `file`) |
| `GET` | `/tours/share/{code}/audio-messages` | Liste les messages audio disponibles |

### Authentification organisateur

Les requêtes organisateur nécessitent le header :
```
X-Session-Token: <sessionToken>
```

---

## Système audio

### Côté organisateur
1. **Appui long** sur le bouton micro → début d'enregistrement
2. **Glisser vers la gauche** au-delà du seuil → annulation
3. **Relâcher** → envoi automatique en `multipart/form-data`

### Côté participant
- Polling toutes les **2 secondes** sur l'endpoint des messages
- Les nouveaux messages sont **téléchargés et mis en cache** localement
- Lecture en **file d'attente** (un message à la fois, dans l'ordre d'arrivée)
- **Bandeau orange** de notification à chaque nouveau message
- Accès à l'**historique complet** via le bouton micro en bas à droite

---

## Notes de développement

### Relancer avec cache vidé
Obligatoire après ajout de packages natifs ou modification de `app.json` :
```bash
npx expo start --clear
```

### SSE (Server-Sent Events)
La réception de la position de l'organisateur utilise `XMLHttpRequest` avec `onprogress` plutôt que `fetch`, car le moteur JS Hermes (React Native) bloque sur les réponses SSE avec `fetch` jusqu'à leur fermeture.

### Linter
```bash
npm run lint
```
