# Guardian Vault

**Guardian Vault** is a cross-platform, local-first, zero-server personal vault for saving **Website Links**, **GitHub Repositories**, **Markdown Notes**, and **Hackathons**.

Every item is encrypted in the browser or native desktop/mobile shell using **Envelope Encryption**:
- **Data Encryption Key (DEK)**: A random 256-bit **AES-GCM** key encrypts every vault record with a fresh 12-byte cryptographic IV.
- **Three Wrapped Key Slots (PBKDF2-SHA256, 600,000 iterations each, independent 16-byte random salts)**:
  1. **4-Digit PIN**: Quick daily unlock with rate-limiting and a 5-attempt lockout.
  2. **Master Password**: Minimum 8 characters with an advisory strength meter.
  3. **Recovery Key**: 24-character Crockford Base32 key (`XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`, 120 bits of entropy) generated once during setup for offline password & PIN recovery without losing data.

---

## 1. Direct Downloads (Windows, macOS, Linux, Ubuntu/Debian & Android)

Click any button below to download the latest pre-built native installer directly from GitHub Releases:

[![Download Windows Setup (.exe)](https://img.shields.io/badge/Windows_10%2F11-Download_Setup_.exe-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/bharathkumarmaddi/GUARDIAN-VAULT/releases/latest/download/Guardian-Vault-Windows-Setup.exe)

[![Download Windows Portable (.exe)](https://img.shields.io/badge/Windows_USB_Portable-Download_Portable_.exe-00A4EF?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/bharathkumarmaddi/GUARDIAN-VAULT/releases/latest/download/Guardian-Vault-Windows-Portable.exe)

[![Download macOS (.dmg)](https://img.shields.io/badge/macOS-Download_.dmg-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/bharathkumarmaddi/GUARDIAN-VAULT/releases/latest/download/Guardian-Vault-macOS.dmg)

[![Download Linux (.AppImage)](https://img.shields.io/badge/Linux_Universal-Download_.AppImage-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/bharathkumarmaddi/GUARDIAN-VAULT/releases/latest/download/Guardian-Vault-Linux.AppImage)

[![Download Ubuntu / Debian (.deb)](https://img.shields.io/badge/Ubuntu_%2F_Debian-Download_.deb-E95420?style=for-the-badge&logo=ubuntu&logoColor=white)](https://github.com/bharathkumarmaddi/GUARDIAN-VAULT/releases/latest/download/Guardian-Vault-Linux.deb)

[![Download Android (.apk)](https://img.shields.io/badge/Android-Download_.apk-3DDC84?style=for-the-badge&logo=android&logoColor=black)](https://github.com/bharathkumarmaddi/GUARDIAN-VAULT/releases/latest/download/Guardian-Vault-Android.apk)

> **View All Releases**: [https://github.com/bharathkumarmaddi/GUARDIAN-VAULT/releases](https://github.com/bharathkumarmaddi/GUARDIAN-VAULT/releases)

---

## 2. How to Install on Every OS

### Windows (10 / 11)
- **Installer (`Guardian-Vault-Windows-Setup.exe`)**: Download from the button above or the in-app **Download App** dialog, double-click the `.exe`, and choose your installation directory.
- **Portable (`Guardian-Vault-Windows-Portable.exe`)**: No installation required. Stores all encrypted IndexedDB data in a `GuardianData` folder next to the executable.

### macOS
- Download **`Guardian-Vault-macOS.dmg`**, open the disk image, and drag **Guardian Vault.app** into your `Applications` folder.

### Linux (All Distros & Ubuntu / Debian)
- **Universal AppImage (`Guardian-Vault-Linux.AppImage`)**:
  ```bash
  chmod +x Guardian-Vault-Linux.AppImage
  ./Guardian-Vault-Linux.AppImage
  ```
- **Ubuntu / Debian Package (`Guardian-Vault-Linux.deb`)**:
  ```bash
  sudo dpkg -i Guardian-Vault-Linux.deb
  ```

### Android
- Download **`Guardian-Vault-Android.apk`** (`com.guardianvault.app`) and open it on your Android device to install. Uses local device storage with `https` Capacitor WebView scheme for native Web Crypto API (`crypto.subtle`) hardware acceleration.

### iPhone / iPad (Offline PWA)
- Open Guardian Vault in **Safari**, tap the **Share** button, and select **Add to Home Screen**. All fonts, icons, and 3D character assets are cached locally by the service worker for offline use.

---

## 3. How to Use Guardian Vault from a USB Pendrive

1. **Native Portable Mode (Windows & Linux)**:
   - Copy `Guardian-Vault-Windows-Portable.exe` (Windows) or `Guardian-Vault-Linux.AppImage` (Linux) onto your USB pendrive.
   - When launched from the pendrive, Guardian Vault automatically creates a `GuardianData/` folder next to the executable so your encrypted `GuardianVaultDB` travels with the pendrive.
2. **Single-File HTML Mode**:
   - Build `dist-singlefile/index.html` via `npm run build:singlefile` and copy it to your USB pendrive.
   - Use **Transfer / Export → Save Directly to USB / Disk** to read and write encrypted `.gvault` or `.vault` files directly to the pendrive.

---

## 4. Universal Vault Transfer System (`.gvault`, Clipboard, QR & `.vault`)

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

## 5. Global Shortcuts & Auto-Lock Security

- **`Ctrl/Cmd + K` or `/`**: Open the instant fuzzy Command Palette across all links, GitHub repositories, notes, hackathons, and `#tags`.
- **`Ctrl/Cmd + L`**: Instantly lock the vault and wipe the in-memory 256-bit DEK.
- **`Ctrl/Cmd + N` or `N`**: Quick-add a new item to the active section.
- **Auto-Lock Timer**: Configurable inactivity timeout in **Settings** (`2 min`, `5 min`, `10 min`, `15 min`, `30 min`, or `Never`).

---

## 6. How to Build Each Installer from Source

### Prerequisites
- **Node.js 20 / 22 LTS+** and `npm`

### Install & Run Locally
```bash
npm install
npm run dev          # Starts Vite dev server at http://localhost:3000
npm test             # Runs the Vitest security & transfer test suite
npm run lint         # Runs TypeScript type-checking (tsc --noEmit)
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

# Windows: builds release/Guardian-Vault-Windows-Setup.exe + release/Guardian-Vault-Windows-Portable.exe
npm run electron:build:win

# macOS: builds release/Guardian-Vault-macOS.dmg
npm run electron:build:mac

# Linux: builds release/Guardian-Vault-Linux.AppImage + release/Guardian-Vault-Linux.deb
npm run electron:build:linux
```

### Build Android APK (Capacitor)
```bash
npm run android:build
```
