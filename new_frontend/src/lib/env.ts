/**
 * Safely reads environment variables for Supabase.
 *
 * IMPORTANT: Vite only inlines `import.meta.env.*` when accessed by a
 * STATIC literal property name. Dynamic/computed access such as
 * `import.meta.env[key]` is NOT replaced at build time, so the values
 * would be missing from the production bundle. Always read each variable
 * by its literal name and provide fallbacks across supported prefixes.
 */

const env = (import.meta as any).env as Record<string, string | undefined>;

const pick = (...values: Array<string | undefined>): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

export const SUPABASE_URL = pick(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.VITE_SUPABASE_URL,
);

export const SUPABASE_ANON_KEY = pick(
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  env.VITE_SUPABASE_ANON_KEY,
);

export const API_BASE_URL = pick(env.VITE_API_BASE_URL);

export const SITE_URL = pick(
  env.NEXT_PUBLIC_SITE_URL,
  env.VITE_SITE_URL,
);

export const HAS_SUPABASE_CONFIG = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!HAS_SUPABASE_CONFIG) {
  console.warn(
    'Supabase configuration is missing. Please ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in your environment.'
  );
}
