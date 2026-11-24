const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Portable Mode: store IndexedDB and userData in "GuardianData" next to portable .exe or .AppImage when running from USB/portable media
function configurePortableDataPath() {
  const portableDir =
    process.env.PORTABLE_EXECUTABLE_DIR ||
    (process.env.APPIMAGE ? path.dirname(process.env.APPIMAGE) : null);

  if (portableDir) {
    const guardianDataDir = path.join(portableDir, 'GuardianData');
    try {
      fs.mkdirSync(guardianDataDir, { recursive: true });
      app.setPath('userData', guardianDataDir);
    } catch {
      // Fallback to default OS userData directory if portable media is read-only
    }
  }
}

configurePortableDataPath();

function isSafeExternalHttpUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function createWindow() {
  const preloadPath = path.join(__dirname, 'electron', 'preload.cjs');
  const hasPreload = fs.existsSync(preloadPath);

  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 380,
    minHeight: 640,
    title: 'Guardian Vault',
    backgroundColor: '#18181B',
    icon: path.join(__dirname, 'public', 'pwa-512x512.png'),
    autoHideMenuBar: true,
    webPreferences: {
      ...(hasPreload ? { preload: preloadPath } : {}),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Load the production build from dist/index.html
  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));

  // Intercept external http:// and https:// links and open them safely in the system default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalHttpUrl(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isSafeExternalHttpUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
