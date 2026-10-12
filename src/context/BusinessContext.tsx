import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { BusinessSettings, DEFAULT_BUSINESS_SETTINGS } from '../types';
import { fetchBusinessSettings, updateBusinessSettings } from '../lib/db';
import { useAuth } from './AuthContext';

const CACHE_KEY = 'nawaz_poultry_business_settings_v1';

function readCache(): BusinessSettings {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_BUSINESS_SETTINGS, ...parsed };
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_BUSINESS_SETTINGS;
}

function writeCache(s: BusinessSettings) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

interface BusinessContextValue {
  settings: BusinessSettings;
  loading: boolean;
  refresh: () => Promise<void>;
  save: (patch: Partial<Omit<BusinessSettings, 'id' | 'updatedAt'>>) => Promise<void>;
  saving: boolean;
}

const BusinessContext = createContext<BusinessContextValue | null>(null);

export const BusinessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const [settings, setSettings] = useState<BusinessSettings>(readCache);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!session) {
      setLoading(false);
      return;
    }
    try {
      const remote = await fetchBusinessSettings(supabase);
      if (remote) {
        setSettings(remote);
        writeCache(remote);
      }
    } catch {
      /* offline or table not yet migrated — keep cache/defaults */
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (patch: Partial<Omit<BusinessSettings, 'id' | 'updatedAt'>>) => {
      setSaving(true);
      try {
        const updated = await updateBusinessSettings(supabase, patch);
        setSettings(updated);
        writeCache(updated);
      } finally {
        setSaving(false);
      }
    },
    []
  );

  return (
    <BusinessContext.Provider value={{ settings, loading, refresh, save, saving }}>
      {children}
    </BusinessContext.Provider>
  );
};

export function useBusiness(): BusinessContextValue {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusiness must be used inside <BusinessProvider>');
  return ctx;
}
