# Guardian Vault
## One-Click Download

[![Download for Windows](https://img.shields.io/badge/Windows-Download%20Setup%20.exe-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/bharathkumarmaddi/GUARDIAN-VAULT/releases/latest/download/Guardian-Vault-Windows-Setup.exe)
[![Download Windows Portable](https://img.shields.io/badge/Windows-Portable%20USB%20.exe-005A9E?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/bharathkumarmaddi/GUARDIAN-VAULT/releases/latest/download/Guardian-Vault-Windows-Portable.exe)
[![Download for macOS](https://img.shields.io/badge/macOS-Download%20.dmg-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/bharathkumarmaddi/GUARDIAN-VAULT/releases/latest/download/Guardian-Vault-macOS.dmg)
[![Download for Linux](https://img.shields.io/badge/Linux-Download%20.AppImage-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/bharathkumarmaddi/GUARDIAN-VAULT/releases/latest/download/Guardian-Vault-Linux.AppImage)
[![Download for Ubuntu/Debian](https://img.shields.io/badge/Ubuntu%20%2F%20Debian-Download%20.deb-A81D33?style=for-the-badge&logo=debian&logoColor=white)](https://github.com/bharathkumarmaddi/GUARDIAN-VAULT/releases/latest/download/Guardian-Vault-Linux.deb)
[![Download for Android](https://img.shields.io/badge/Android-Download%20.apk-3DDC84?style=for-the-badge&logo=android&logoColor=black)](https://github.com/bharathkumarmaddi/GUARDIAN-VAULT/releases/latest/download/Guardian-Vault-Android.apk)
**Guardian Vault** is a cross-platform, local-first, zero-server personal vault for saving **Website Links**, **GitHub Repositories**, **Markdown Notes**, and **Hackathons**.

Every item is encrypted in the browser or native desktop/mobile shell using **Envelope Encryption**:
- **Data Encryption Key (DEK)**: A random 256-bit **AES-GCM** key encrypts every vault record with a fresh 12-byte cryptographic IV.
- **Three Wrapped Key Slots (PBKDF2-SHA256, 600,000 iterations each, independent 16-byte random salts)**:
  1. **4-Digit PIN**: Quick daily unlock with rate-limiting and a 5-attempt lockout.
  2. **Master Password**: Minimum 8 characters with an advisory strength meter.
  3. **Recovery Key**: 24-character Crockford Base32 key (`XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`, 120 bits of entropy) generated once during setup for offline password & PIN recovery without losing data.

---

## 1. How to Download & Install on Every OS

### Windows (10 / 11)
- **Installer (`Guardian-Vault-Setup-2.0.0.exe`)**: Download from the latest GitHub Release or the in-app **Download App** dialog, double-click the `.exe`, and choose your installation directory.
- **Portable (`Guardian-Vault-Portable-2.0.0.exe`)**: No installation required. Stores all encrypted IndexedDB data in a `GuardianData` folder next to the executable.

### Linux (All Distros & Ubuntu / Debian)
- **Universal AppImage (`Guardian-Vault-2.0.0.AppImage`)**:
  ```bash
  chmod +x Guardian-Vault-2.0.0.AppImage
  ./Guardian-Vault-2.0.0.AppImage
  ```
- **Ubuntu / Debian Package (`Guardian-Vault-2.0.0.deb`)**:
  ```bash
  sudo dpkg -i Guardian-Vault-2.0.0.deb
  ```

### macOS (Intel x64 + Apple Silicon arm64)
- Download **`Guardian-Vault-2.0.0.dmg`** (Universal binary), open the disk image, and drag **Guardian Vault.app** into your `Applications` folder.

### Android
- Download **`Guardian-Vault-2.0.0.apk`** (`com.guardianvault.app`) and open it on your Android device to install. Uses local device storage only.

### iPhone / iPad (Offline PWA)
- Open Guardian Vault in **Safari**, tap the **Share** button, and select **Add to Home Screen**. All fonts, icons, and 3D character assets are cached locally by the service worker for offline use.

---

## 2. How to Use Guardian Vault from a USB Pendrive

1. **Native Portable Mode (Windows & Linux)**:
   - Copy `Guardian-Vault-Portable-2.0.0.exe` (Windows) or `Guardian-Vault-2.0.0.AppImage` (Linux) onto your USB pendrive.
   - When launched from the pendrive, Guardian Vault automatically creates a `GuardianData/` folder next to the executable so your encrypted `GuardianVaultDB` travels with the pendrive.
2. **Single-File HTML Mode**:
   - Build `dist-singlefile/index.html` via `npm run build:singlefile` and copy it to your USB pendrive.
   - Use **Backup / Sync → Save Directly to USB / Disk** to read and write encrypted `.vault` files directly to the pendrive.

---

## 3. Universal Vault Transfer System (`.gvault`, Clipboard, QR & `.vault`)

Guardian Vault includes a cross-platform **Universal Vault Transfer System** that transfers saved links, GitHub repositories, notes, hackathons, collections, and tags between any two computers or mobile devices (Windows ↔ Android, Windows ↔ Linux, macOS ↔ Windows, iOS ↔ Desktop) with zero cloud accounts or shared local network required.

### A. Universal Copy & Paste
1. **Copy**:
   - Click the **Copy** icon on any item card, click **Select All → Copy Selected**, or click the **Copy** icon next to any Collection in the sidebar.
   - Guardian Vault writes both a human-readable plain-text URL list and a versioned `guardian-vault-transfer` (`.gvault` Schema v1) JSON block to the system clipboard.
2. **Paste & Import Preview**:
   - On the destination device, click **Paste / Import** in the header (or inside **Transfer / Export → Paste & Import**).
   - Click **Paste from Clipboard** (or paste into the fallback text box).
   - Inspect the **Import Preview & Duplicate Manager**, which shows counts for Links, Repositories, New Records, Existing Duplicates (matched by normalized URL or stable ID — never by title alone), Invalid Records, and Unsupported Records.
   - Choose a conflict resolution strategy (**Skip Duplicates**, **Keep Both Versions**, or **Replace Existing** with explicit confirmation) and click **Confirm & Import**.

### B. Universal `.gvault` Export & Import (Plain or AES-256-GCM Encrypted)
1. Open **Transfer / Export → Copy & Export**.
2. Choose scope: **All Saved Items**, **Entire Collection / Folder**, or **Selected Items**.
3. Choose **Universal .gvault** (optionally check **Password-Protect .gvault File** to encrypt with AES-256-GCM + PBKDF2-HMAC-SHA256).
4. Click **Download .gvault File** or **Save Directly to USB / Disk**.
5. Note: PINs, master passwords, and master Data Encryption Keys (DEKs) are **never** exported.

### C. QR Code Transfer (Small Collections)
- For 1 to 10 items, open **Transfer / Export → QR Transfer** (or click the **QR** button on any item card and select **.gvault Transfer QR**) to generate a compact `GVQR1:` or password-encrypted `GVQRE1:` QR code that another device can scan offline.

---

## 4. Forgot PIN or password

### Forgot PIN?
1. On the unlock screen, click **Forgot PIN?**.
2. Enter your **Master Password** and choose a new **4-Digit PIN**.
3. Your 256-bit Data Encryption Key (DEK) is re-wrapped with the new PIN and your failed PIN attempt counter is reset. All vault records remain untouched.

### Forgot password?
1. On the unlock screen, click **Forgot password?**.
2. Enter your 24-character **Recovery Key** (`XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`).
3. Set a new **Master Password** (8+ characters) and a new **4-Digit PIN**.
4. Because Guardian Vault uses envelope encryption, only the wrapped key slots are updated — **100% of your encrypted links, repositories, notes, and hackathons stay intact**.
5. A **new Recovery Key** is generated and displayed immediately. Save it and confirm its last 4 characters; your old recovery key is permanently deactivated.

### Start fresh (Lost PIN, Master Password, and Recovery Key)
- Because Guardian Vault is zero-knowledge and never transmits keys to any server, if all three credentials are lost, click **Start fresh** on the unlock screen, complete the two confirmation steps, and type **`DELETE`** to wipe `GuardianVaultDB` and initialize a new vault.

---

## 5. How to Build Each Installer from Source

### Prerequisites
- **Node.js 20 LTS+** and `npm`

### Install & Run Locally
```bash
npm install
npm run dev          # Starts Vite dev server at http://localhost:3000
npm test             # Runs the Vitest test suite
```

### Build Web PWA & Single-File HTML
```bash
npm run build             # Builds installable PWA in dist/
npm run build:singlefile  # Builds self-contained dist-singlefile/index.html
```

### Build Desktop Installers (Electron + electron-builder)
```bash
# Build production frontend and launch Electron desktop app locally
npm run electron:start

# Windows: builds Guardian-Vault-Setup-2.0.0.exe (NSIS) + Guardian-Vault-Portable-2.0.0.exe in release/
npm run electron:build:win

# macOS: builds Guardian-Vault-2.0.0.dmg in release/
npm run electron:build:mac

# Linux: builds Guardian-Vault-2.0.0.AppImage + Guardian-Vault-2.0.0.deb in release/
npm run electron:build:linux
```

### Build Android APK (Capacitor)
```bash
npm run android:build
```
