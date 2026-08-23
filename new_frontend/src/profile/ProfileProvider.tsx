import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Profile } from '../types';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

interface ProfileContextType {
  profile: Profile | null;
  isAdmin: boolean;
  isRecruiter: boolean;
  refreshProfile: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  isAdmin: false,
  isRecruiter: false,
  refreshProfile: async () => {},
  loading: false,
  error: null,
});

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Prevent infinite loops by referencing the last loaded user ID
  const lastUserIdRef = useRef<string | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      // Query the user profiles table
      const { data, error: fetchErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (fetchErr) {
        throw fetchErr;
      }

      if (data) {
        let currentProfile = data as Profile;
        if (currentProfile.role === 'candidate') {
          const { data: approvedForm } = await supabase
            .from('recruiter_registration_forms')
            .select('id')
            .eq('user_id', userId)
            .eq('status', 'approved')
            .maybeSingle();

          if (approvedForm) {
            const { data: updated } = await supabase
              .from('profiles')
              .update({ role: 'recruiter' })
              .eq('id', userId)
              .select('*')
              .maybeSingle();

            if (updated) {
              currentProfile = updated as Profile;
            } else {
              currentProfile = { ...currentProfile, role: 'recruiter' };
            }
          }
        }
        setProfile(currentProfile);
      } else {
        // Not found, trigger idempotent upsert/insert
        const fallbackName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Ứng viên mới';
        const fallbackAvatar = user?.user_metadata?.avatar_url || null;
        
        const newProfile = {
          id: userId,
          email: user?.email || '',
          full_name: fallbackName,
          phone: null,
          avatar_url: fallbackAvatar,
          role: 'candidate',
        };

        const { data: inserted, error: insertErr } = await supabase
          .from('profiles')
          .upsert(newProfile, { onConflict: 'id' })
          .select('*')
          .single();

        if (insertErr) {
          // If code is duplicate key or anything, we query again
          if (insertErr.code === '23505') {
            const { data: secondFetch } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', userId)
              .single();
            if (secondFetch) {
              setProfile(secondFetch as Profile);
            }
          } else {
            throw insertErr;
          }
        } else if (inserted) {
          setProfile(inserted as Profile);
        }
      }
    } catch (err: any) {
      console.error('Error fetching/creating profile:', err);
      setError(handleSupabaseError(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  }, [user?.id, fetchProfile]);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setProfile(null);
      setLoading(false);
      setError(null);
      lastUserIdRef.current = null;
      return;
    }

    if (user.id !== lastUserIdRef.current) {
      lastUserIdRef.current = user.id;
      fetchProfile(user.id);
    }
  }, [user, authLoading, fetchProfile]);

  const isAdmin = profile?.role === 'admin';
  const isRecruiter = profile?.role === 'recruiter' || profile?.role === 'admin';

  return (
    <ProfileContext.Provider value={{ profile, isAdmin, isRecruiter, refreshProfile, loading: loading || authLoading, error }}>
      {children}
    </ProfileContext.Provider>
  );
};

export const useCurrentProfile = () => useContext(ProfileContext);
