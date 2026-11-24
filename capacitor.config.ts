export interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  bundledWebRuntime?: boolean;
  server?: {
    androidScheme: string;
  };
  android?: {
    allowMixedContent: boolean;
  };
}

const config: CapacitorConfig = {
  appId: 'com.guardianvault.app',
  appName: 'Guardian Vault',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
