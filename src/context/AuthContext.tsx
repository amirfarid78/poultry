import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { UserRole } from '../types';

export interface AuthProfile {
  id: string;
  role: UserRole;
  fullName: string | null;
  isActive: boolean;
}

interface AuthContextValue {
  session: Session | null;
  profile: AuthProfile | null;
  role: UserRole | null;
  loading: boolean; // true while session/profile are being resolved
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null; emailConfirmationRequired: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapProfile(row: any): AuthProfile {
  return {
    id: row.id,
    role: row.role as UserRole,
    fullName: row.full_name ?? null,
    isActive: row.is_active ?? true
  };
}

async function fetchProfileOnce(userId: string): Promise<AuthProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, is_active')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return mapProfile(data);
}

/** The handle_new_user trigger creates the profile row asynchronously right after
 *  signup; retry a few times before giving up. */
async function fetchProfileWithRetry(userId: string, attempts = 8, delayMs = 1000): Promise<AuthProfile | null> {
  for (let i = 0; i < attempts; i++) {
    const profile = await fetchProfileOnce(userId);
    if (profile) return profile;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const p = await fetchProfileWithRetry(userId);
    setProfile(p);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const s = data.session ?? null;
      setSession(s);
      if (s?.user) {
        await loadProfile(s.user.id);
      }
      if (!cancelled) setLoading(false);
    };
    init();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (cancelled) return;
      setSession(s ?? null);
      if (s?.user) {
        const p = await fetchProfileWithRetry(s.user.id);
        if (!cancelled) setProfile(p);
      } else {
        setProfile(null);
      }
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = async (email: string, password: string): Promise<string | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return error.message;
      const userId = data.user?.id ?? data.session?.user?.id;
      if (userId) {
        const p = await fetchProfileWithRetry(userId);
        setProfile(p);
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });
    if (error) return { error: error.message, emailConfirmationRequired: false };
    // When email confirmation is on, no session is returned until the user confirms.
    const emailConfirmationRequired = !data.session;
    if (data.user) {
      const p = await fetchProfileWithRetry(data.user.id);
      setProfile(p);
    }
    return { error: null, emailConfirmationRequired };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        role: profile?.role ?? null,
        loading,
        signIn,
        signUp,
        signOut
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
