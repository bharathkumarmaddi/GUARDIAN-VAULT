const { app, BrowserWindow, protocol, net, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// Portable Mode: store IndexedDB and app data in "GuardianData" next to portable .exe or .AppImage
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

// Register custom scheme app://guardian before app is ready so IndexedDB persists across launches and updates
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

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 380,
    minHeight: 640,
    title: 'Guardian Vault',
    backgroundColor: '#18181B',
    icon: path.join(__dirname, '../public/pwa-512x512.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('mailto:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.loadURL('app://guardian/index.html');
}

app.whenReady().then(() => {
  const distDir = path.resolve(__dirname, '../dist');

  protocol.handle('app', (request) => {
    const reqUrl = new URL(request.url);
    let relPath = decodeURIComponent(reqUrl.pathname);
    if (!relPath || relPath === '/') {
      relPath = '/index.html';
    }
    const targetPath = path.normalize(path.join(distDir, relPath));
    if (!targetPath.startsWith(distDir) || !fs.existsSync(targetPath)) {
      return net.fetch(pathToFileURL(path.join(distDir, 'index.html')).toString());
    }
    return net.fetch(pathToFileURL(targetPath).toString());
  });

  // Block all outbound network requests except user-initiated metadata fetches
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url;
    if (
      url.startsWith('app://') ||
      url.startsWith('data:') ||
      url.startsWith('blob:') ||
      url.startsWith('devtools://')
    ) {
      callback({ cancel: false });
      return;
    }

    // Allow optional metadata fetch only when explicitly triggered by the user
    const isExplicitMetadataFetch =
      details.resourceType === 'xhr' &&
      (url.startsWith('https://api.github.com/') || url.includes('guardian_meta_fetch=1'));

    callback({ cancel: !isExplicitMetadataFetch });
  });

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
