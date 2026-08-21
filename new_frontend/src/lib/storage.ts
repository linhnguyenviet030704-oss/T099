import { supabase, handleSupabaseError } from './supabase';

/**
 * Clean original filename to prevent storage or URL issues.
 * Replaces whitespace with underscore, removes accented characters or strange symbols.
 */
export function sanitizeFilename(filename: string): string {
  // Translate common Vietnamese characters with accents to non-accent counterparts
  let safe = filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[đĐ]/g, 'd');
    
  // Replace spaces and special characters with underscore or strip
  safe = safe.replace(/\s+/g, '_');
  safe = safe.replace(/[^a-zA-Z0-9_\-\.]/g, '');
  
  if (!safe) {
    safe = 'resume_file';
  }
  return safe;
}

/**
 * Builds standard storage path for a resume:
 * {user_id}/resumes/{resume_id}/{safe_filename}
 */
export function buildResumeStoragePath(userId: string, resumeId: string, filename: string): string {
  const safeName = sanitizeFilename(filename);
  return `${userId}/resumes/${resumeId}/${safeName}`;
}

/**
 * Creates and retrieves a short expiration URL for resume storage paths (TTL: 180 seconds).
 * Falls back if supabase client is not available.
 */
export async function getResumeSignedUrl(storagePath: string): Promise<string> {
  if (!supabase) {
    throw new Error('Supabase client chưa được cấu hình.');
  }
  
  const { data, error } = await supabase.storage
    .from('resumes')
    .createSignedUrl(storagePath, 180);
    
  if (error) {
    throw new Error(handleSupabaseError(error));
  }
  
  if (!data?.signedUrl) {
    throw new Error('Không thể tạo liên kết đến CV.');
  }
  
  return data.signedUrl;
}
