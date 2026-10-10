# Nexus AndroKiller (The Tracker & The Monitor) 🛰️

![Android Native Kotlin](https://img.shields.io/badge/Android-Kotlin%20%2B%20Compose-3DDC84?style=for-the-badge&logo=android&logoColor=white)
![React 19](https://img.shields.io/badge/Web-React%2019%20%2B%20Vite-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Firebase Ecosystem](https://img.shields.io/badge/Backend-Firebase%20Firestore%20%26%20Storage-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![License](https://img.shields.io/badge/Status-Production%20Ready-00E5FF?style=for-the-badge)

**Nexus AndroKiller** is an end-to-end device telemetry monitoring, real-time tracking, and remote control system consisting of a native Android Kotlin background service and a modern cyber-themed React 19 web dashboard.

---

## 📂 Repository Architecture

```text
Androkiller/
├── mobile-app/               # Native Android Client (Kotlin, Jetpack Compose, CameraX, FusedLocation)
│   ├── app/
│   │   ├── google-services.json.example   # Template Firebase configuration
│   │   ├── build.gradle.kts
│   │   └── src/main/java/com/nexus/androkiller/...
│   ├── build.gradle.kts
│   ├── gradlew & gradlew.bat
│   └── settings.gradle.kts
│
├── web-app/                  # Real-Time Web Control Dashboard (React 19, Vite, Tailwind CSS v4, Leaflet)
│   ├── .env.example          # Template Web Firebase credentials
│   ├── src/
│   ├── vercel.json           # 1-Click Vercel production deployment configuration
│   ├── package.json
│   └── vite.config.js
│
├── functions/                # Firebase Cloud Storage trigger & metadata processors
├── firebase.json             # Firebase deployment configuration & hosting rewrites
├── firestore.rules           # Realtime security rules for devices, logs, and telemetry
├── storage.rules             # Cloud Storage access rules
└── README.md                 # Complete project guide & setup manual
```

---

## ⚡ Core Capabilities

### 📱 Android Tracker Client (`mobile-app/`)
- 🛰️ **GPS Live Tracker:** Google Play Services `FusedLocationProviderClient` with high accuracy, speed, and heading.
- 📸 **Remote Camera Snapshots:** CameraX silent photo capture (Front Selfie / Back Camera).
- 🖥️ **Silent Screen Capture:** Background screenshot engine via Android Accessibility Service.
- 🎤 **Audio Recording:** Buffered 10-second audio clip recording via `MediaRecorder`.
- 📞 **Communications Supervision:** Device Call logs (incoming, outgoing, missed) & SMS messages sync.
- 📁 **File & Apps Management:** Device internal storage file directory sync and installed apps inventory.
- 🔦 **Hardware Controls:** Flashlight toggle, siren alarm ringer, and interactive chat overlay pop-up.
- 🛡️ **Stealth Keep-Alive:** Android Foreground Service with boot receiver auto-start (`BootReceiver`).

### 🌐 Web Control Hub (`web-app/`)
- 🗺️ **Leaflet GPS Map:** Real-time location breadcrumbs, accuracy radius, and speedometer.
- ⚡ **Command Dispatch:** 1-Click remote hardware triggers with live audit logs & receipts.
- 🖼️ **Media Vault:** Lightbox photo zoom, silent screenshot viewer, audio note player, and file downloads.
- 🔄 **Smart Navigation:** Auto-scroll to top on tab switch + floating cyber back-to-top button with circular progress ring.
- 📱 **Responsive UX:** Optimized for desktop screens and mobile thumb-navigation.

---

## 📦 Download Pre-built APK

You can download the ready-to-install Android APK directly from the **[GitHub Releases](https://github.com/kanXer/Androkiller/releases)** section:
- **`AndroKiller-v1.0.0-release.apk`** *(Recommended)*: Production build with **Debug Mode OFF**, optimized, aligned, and signed for direct installation on any Android device.
- **`AndroKiller-v1.0.0-debug.apk`**: Development testing APK.

---

## 🛠️ Step-by-Step Setup Guide

### 1. Firebase Project Setup (Prerequisite)

Both the mobile app and the web app connect to the same Google Firebase project:

1. Go to the **[Firebase Console](https://console.firebase.google.com/)** and click **"Add project"**.
2. **Cloud Firestore:**
   - Go to **Firestore Database** ➔ **Create Database**.
   - Start in Test mode or paste the rules from [`firestore.rules`](./firestore.rules).
3. **Cloud Storage (Optional):**
   - Go to **Storage** ➔ **Get Started**.
   - Paste the rules from [`storage.rules`](./storage.rules).
   *(Note: The system also includes an inline base64 storage mode configured via the web UI).*

---

### 2. 📱 Mobile App Setup & Build (`mobile-app/`)

#### Step 2.1: Add `google-services.json`
1. In the Firebase Console, go to **Project Settings** (gear icon) ➔ **General**.
2. Under **"Your apps"**, click **"Add app"** ➔ Select **Android** (`🤖`).
3. Set **Package name / Android package name**:
   ```text
   com.nexus.androkiller
   ```
4. Click **Register app** and download the `google-services.json` file.
5. Place the downloaded file into the `mobile-app/app/` folder:
   ```bash
   # Copy your downloaded JSON file to mobile-app/app/
   cp /path/to/downloaded/google-services.json mobile-app/app/google-services.json
   ```
   *(A template reference is provided in [`mobile-app/app/google-services.json.example`](./mobile-app/app/google-services.json.example)).*

#### Step 2.2: Build the APK with Gradle
Make sure you have **JDK 17** installed and your `ANDROID_HOME` or `local.properties` configured.

```bash
# Navigate to the mobile-app directory
cd mobile-app

# Grant executable permission to Gradle wrapper (Linux/macOS)
chmod +x gradlew

# Build Debug APK
./gradlew assembleDebug

# Output APK location:
# mobile-app/app/build/outputs/apk/debug/app-debug.apk
```

To build a Release APK:
```bash
./gradlew assembleRelease
# Output APK location:
# mobile-app/app/build/outputs/apk/release/app-release-unsigned.apk
```

To install directly to a connected Android phone or emulator:
```bash
./gradlew installDebug
```

#### Step 2.3: Grant Device Permissions
When launching the app on the phone:
1. Tap **"Grant Permissions"** for Location (Allow all the time), Camera, Microphone, and Notification.
2. For silent background screenshots: Go to **Settings ➔ Accessibility ➔ Installed Apps ➔ Enable "Nexus Screen Capture Service"**.
3. Tap **"Start Monitoring Service"** to begin real-time telemetry streaming!

---

### 3. 🌐 Web Dashboard Setup & Run (`web-app/`)

#### Step 3.1: Configure Environment Variables
1. In Firebase Console ➔ **Project Settings** ➔ **General** ➔ **Your apps** ➔ click on your **Web app (`</>`)**.
2. Navigate to `web-app/` and copy the template `.env.example` file:
   ```bash
   cd web-app
   cp .env.example .env
   ```
3. Open `web-app/.env` and paste your actual Firebase credentials:
   ```env
   VITE_FIREBASE_API_KEY=AIzaSyYourActualApiKeyHere
   VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
   VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef0123456789
   ```

#### Step 3.2: Run Locally
```bash
# Install dependencies
npm install

# Start local development server (with hot module replacement)
npm run dev
```
Open **`http://localhost:5173`** in your browser to view your live command dashboard.

To create a production build locally:
```bash
npm run build
npm run preview
```

---

### 4. 🚀 Deploy Web App to Vercel

The web application includes a ready-to-deploy [`vercel.json`](./web-app/vercel.json):

1. Go to [Vercel](https://vercel.com/dashboard) and click **"Add New" ➔ "Project"**.
2. Import the GitHub repository: `kanXer/Androkiller` (or the dedicated web repo `kanXer/Androkiller-web`).
3. Set **Root Directory** to `web-app` (if deploying from this monorepo).
4. In **Environment Variables**, add the 6 `VITE_FIREBASE_*` variables from your `.env`.
5. Click **Deploy**!
6. In **Firebase Console ➔ Authentication ➔ Settings ➔ Authorized Domains**, add your Vercel URL (e.g. `your-app.vercel.app`).

---

## 🔒 Security & Privacy

- **No Secrets in Git:** All `.env` files and `google-services.json` are excluded from Git tracking via `.gitignore`.
- **Protected History:** Only generic template files (`.env.example`, `google-services.json.example`) are version-controlled.
- **Client Fallback:** If environment variables are missing, the web dashboard runs in safe demo/preview mode with simulated data.

---

## 🛡️ License

This project is released for educational, personal supervision, and security research purposes.
