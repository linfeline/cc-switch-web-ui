import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// Core apps supported by cc-switch CLI (--app)
export type CoreAppType =
  | 'claude'
  | 'codex'
  | 'gemini'
  | 'opencode'
  | 'hermes'
  | 'openclaw'
  | 'pi';

// Legacy custom apps (file-based / non-CLI-core)
export type CustomAppType = 'kilocode-cli' | 'amp';

// Combined app type
export type AppType = CoreAppType | CustomAppType;

// List of valid app values for validation
export const VALID_APPS: AppType[] = [
  'claude', 'codex', 'gemini', 'opencode', 'hermes', 'openclaw', 'pi',
  'kilocode-cli', 'amp',
];

// Check if an app is a core app
export function isCoreApp(app: AppType): app is CoreAppType {
  return ['claude', 'codex', 'gemini', 'opencode', 'hermes', 'openclaw', 'pi'].includes(app);
}

// Check if an app is a custom app
export function isCustomApp(app: AppType): app is CustomAppType {
  return ['kilocode-cli', 'amp'].includes(app);
}

interface AppContextType {
  selectedApp: AppType;
  setSelectedApp: (app: AppType) => void;
}

const APP_STORAGE_KEY = 'cc-switch-selected-app';

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [selectedApp, setSelectedAppState] = useState<AppType>(() => {
    // Initialize from localStorage if available
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(APP_STORAGE_KEY);
      if (stored && VALID_APPS.includes(stored as AppType)) {
        return stored as AppType;
      }
    }
    return 'claude'; // Default to claude
  });

  const setSelectedApp = useCallback((app: AppType) => {
    setSelectedAppState(app);
    localStorage.setItem(APP_STORAGE_KEY, app);
  }, []);

  // Sync across tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === APP_STORAGE_KEY && e.newValue) {
        const newApp = e.newValue as AppType;
        if (VALID_APPS.includes(newApp)) {
          setSelectedAppState(newApp);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <AppContext.Provider value={{ selectedApp, setSelectedApp }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

// App options for the dropdown selector
export const APP_OPTIONS: { value: AppType; label: string; icon: string; category: 'core' | 'custom' }[] = [
  // Core apps (CLI --app)
  { value: 'claude', label: 'Claude', icon: '🤖', category: 'core' },
  { value: 'codex', label: 'Codex', icon: '💻', category: 'core' },
  { value: 'gemini', label: 'Gemini', icon: '✨', category: 'core' },
  { value: 'opencode', label: 'OpenCode', icon: '🔓', category: 'core' },
  { value: 'hermes', label: 'Hermes', icon: '🪽', category: 'core' },
  { value: 'openclaw', label: 'OpenClaw', icon: '🦞', category: 'core' },
  { value: 'pi', label: 'Pi', icon: 'π', category: 'core' },
  // Legacy custom apps
  { value: 'kilocode-cli', label: 'Kilocode CLI', icon: '🔧', category: 'custom' },
  { value: 'amp', label: 'AMP', icon: '⚡', category: 'custom' },
];
