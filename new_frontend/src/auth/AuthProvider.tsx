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

    // Capture initial session
    let isMounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted) {
        setSession(session);
        setUser(session?.user || null);
        setLoading(false);
      }
    }).catch((err) => {
      console.error('Error getting session:', err);
      if (isMounted) setLoading(false);
    });

    // Handle listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (isMounted) {
        setSession(newSession);
        setUser(newSession?.user || null);
        setLoading(false);
      }
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
