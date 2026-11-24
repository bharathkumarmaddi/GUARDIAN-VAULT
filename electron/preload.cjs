const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('guardianDesktop', {
  isElectron: true,
  platform: process.platform,
  appId: 'com.guardianvault.app',
  version: '2.0.0',
});
