import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isAuthenticated: false,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Capture initial session and validate with auth server
    let isMounted = true;
    const initAuth = async () => {
      if (!supabase) return;
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (currentSession?.user) {
          // Verify if session/user actually exists in database (handles cases where DB was reset)
          const { data: userData, error: userErr } = await supabase.auth.getUser();
          if (userErr || !userData?.user) {
            // User not found in DB or invalid token -> clear stale session
            console.warn('Session is stale or user was not found in auth.users, signing out...');
            await supabase.auth.signOut();
            if (isMounted) {
              setSession(null);
              setUser(null);
              setLoading(false);
            }
            return;
          }

          if (isMounted) {
            setSession(currentSession);
            setUser(userData.user);
            setLoading(false);
          }
        } else {
          if (isMounted) {
            setSession(null);
            setUser(null);
            setLoading(false);
          }
        }
      } catch (err) {
        console.error('Error initializing auth session:', err);
        if (isMounted) setLoading(false);
      }
    };

    void initAuth();

    // Handle listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!isMounted) return;

      if (event === 'SIGNED_OUT' || !newSession) {
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }

      setSession(newSession);
      setUser(newSession?.user || null);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const isAuthenticated = Boolean(user);

  return (
    <AuthContext.Provider value={{ user, session, isAuthenticated, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
