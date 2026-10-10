# Nexus AndroKiller Web Dashboard 🛰️

Cyberpunk-inspired real-time telemetry, remote hardware control, and surveillance dashboard for the **Nexus AndroKiller** Android ecosystem.

Built with **React 19**, **Vite**, **Tailwind CSS v4**, **Leaflet GPS Mapping**, and **Firebase Firestore / Storage**.

---

## ⚡ Key Features

- **Live GPS Tracking & History:** Real-time coordinates streaming, accuracy radius, speedometer, and Leaflet interactive breadcrumbs trail.
- **Remote Hardware Control:**
  - 📸 Remote Camera Snapshots (Instant front selfie / back camera trigger)
  - 🖥️ **Live Mobile Screen Capture (Silent background screenshot)**
  - 🎤 Remote Audio Recording (10s audio note)
  - 🔦 Flashlight / Torch toggle
  - 🚨 Emergency siren alarm
  - 💬 Live Chat Overlay pop-up on child device screen
- **Media Vault & Surveillance:** Full gallery for camera photos, screenshots, and audio clips with lightbox zoom, audio player, download, and delete controls.
- **Supervision Feeds:**
  - 📞 Call logs (incoming, outgoing, missed) with 1-click dialer
  - 💬 SMS messages explorer & direct SMS sender
  - 📁 Device storage file browser & file downloader
  - 📱 Installed applications inventory (system vs. user apps)
- **Multi-Device Support:** Switch between multiple paired devices or remove devices with full data cleanup.
- **Smooth Navigation UX:**
  - 🔄 **Auto-Scroll to Top:** Seamlessly scrolls to the top of the page whenever switching between tabs or devices.
  - 🚀 **Floating Back-to-Top Button:** Cyberpunk glassmorphic floating action button with circular scroll progress ring and smooth return to top.

---

## 🚀 Deploy to Vercel (Step-by-Step Guide)

This repository is 100% configured for production deployment on **Vercel** with a pre-configured [`vercel.json`](./vercel.json) that provides SPA rewrites and caching headers.

### Step 1: Import Project into Vercel

1. Log in to your [Vercel Dashboard](https://vercel.com/dashboard).
2. Click **"Add New..."** ➔ **"Project"**.
3. Under **Import Git Repository**, select `kanXer/Androkiller-web` (or search for `Androkiller-web`).
4. Click **"Import"**.

---

### Step 2: Configure Project & Build Settings

Vercel will automatically detect Vite. Confirm the settings:

| Setting | Value |
| :--- | :--- |
| **Framework Preset** | `Vite` |
| **Root Directory** | `./` |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |

---

### Step 3: Add Environment Variables (Firebase Configuration)

Under the **Environment Variables** accordion, add the following variables corresponding to your Firebase project:

> 💡 **Where to find these keys?**
> In Firebase Console ➔ **Project Settings** (gear icon) ➔ **General** ➔ scroll down to **"Your apps"** ➔ click on your **Web app `</>`** ➔ copy from `firebaseConfig`.

| Variable Name | Description | Example / Template |
| :--- | :--- | :--- |
| `VITE_FIREBASE_API_KEY` | Firebase Web API Key | `AIzaSy...` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Auth domain | `your-project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firestore Project ID | `your-project-id` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Cloud Storage bucket | `your-project.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Cloud Messaging Sender ID | `123456789012` |
| `VITE_FIREBASE_APP_ID` | Firebase Web App ID | `1:123456789012:web:abcdef...` |

*(You can also refer to [`.env.example`](./.env.example) for reference).*

---

### Step 4: Authorize Domain in Firebase (Important!)

Once deployed, copy your assigned Vercel URL (e.g., `https://androkiller-web.vercel.app`):

1. Open **[Firebase Console](https://console.firebase.google.com/)**.
2. Go to **Authentication** ➔ **Settings** tab.
3. Click **Authorized domains** ➔ **Add domain**.
4. Paste your Vercel domain (e.g. `androkiller-web.vercel.app` and any custom domain).
5. Click **Done**.

---

### Step 5: Deploy

Click **"Deploy"**. Vercel will build the project and publish it live within ~30-40 seconds!

---

### Option B: Deploy via Vercel CLI

If you prefer using the command line:

```bash
# 1. Install Vercel CLI globally
npm i -g vercel

# 2. Login to Vercel
vercel login

# 3. Deploy to production
vercel --prod
```

---

## 💻 Local Development

```bash
# 1. Clone repository
git clone https://github.com/kanXer/Androkiller-web.git
cd Androkiller-web

# 2. Install dependencies
npm install

# 3. Setup environment variables
cp .env.example .env
# Edit .env with your actual Firebase credentials

# 4. Start local development server
npm run dev

# 5. Production build test
npm run build
npm run preview
```

---

## 🔒 Security Best Practices

- **Never commit `.env` files**: All local environment secrets are excluded from Git via `.gitignore`.
- **Firebase Firestore Rules**: Ensure your Firestore database rules restrict read/write access to authenticated administrators or security rules suited for your use case.
- **Vercel Headers**: Security and caching headers are already pre-configured in [`vercel.json`](./vercel.json).

---

## 📱 Mobile & Responsive Experience

- **Glassmorphic Navigation Bar**: Desktop top navigation with quick-switch badges.
- **Thumb Navigation**: Fixed bottom navigation bar on mobile screens.
- **Floating Controls**: Quick return to top with interactive circular scroll indicator.

---

## 🛡️ License

Private project for Nexus AndroKiller ecosystem.
