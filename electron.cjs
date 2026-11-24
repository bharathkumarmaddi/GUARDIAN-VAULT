const { app, BrowserWindow, protocol, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// Portable Mode: store IndexedDB and userData in "GuardianData" next to portable .exe or .AppImage
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

// Register privileged secure custom scheme so IndexedDB and Web Crypto persist across launches and portable USB moves
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

let mainWindow = null;

function resolveAppIcon() {
  const candidates = [
    path.join(__dirname, 'dist', 'pwa-512x512.png'),
    path.join(__dirname, 'public', 'pwa-512x512.png'),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function createWindow() {
  const preloadPath = path.join(__dirname, 'electron', 'preload.cjs');
  const hasPreload = fs.existsSync(preloadPath);
  const iconPath = resolveAppIcon();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 380,
    minHeight: 640,
    title: 'Guardian Vault',
    backgroundColor: '#18181B',
    ...(iconPath ? { icon: iconPath } : {}),
    autoHideMenuBar: true,
    webPreferences: {
      ...(hasPreload ? { preload: preloadPath } : {}),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL('app://guardian/index.html');

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('mailto:')
    ) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (
      url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('mailto:')
    ) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    const distDir = path.resolve(__dirname, 'dist');
    const indexHtmlPath = path.join(__dirname, 'dist', 'index.html');

    protocol.handle('app', (request) => {
      const reqUrl = new URL(request.url);
      let relPath = decodeURIComponent(reqUrl.pathname);
      if (!relPath || relPath === '/') {
        relPath = '/index.html';
      }
      const targetPath = path.normalize(path.join(distDir, relPath));
      if (!targetPath.startsWith(distDir) || !fs.existsSync(targetPath)) {
        return net.fetch(pathToFileURL(indexHtmlPath).toString());
      }
      return net.fetch(pathToFileURL(targetPath).toString());
    });

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
}