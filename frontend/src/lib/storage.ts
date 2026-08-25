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
 * Builds standard storage path for an avatar:
 * {user_id}/avatar-{timestamp}.{ext}
 */
export function buildAvatarStoragePath(userId: string, filename: string): string {
  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(filename);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
  return `${userId}/avatar-${Date.now()}.${ext}`;
}

/**
 * Uploads an avatar image file to the public "avatars" bucket and returns its public URL.
 */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  if (!supabase) {
    throw new Error('Supabase client chưa được cấu hình.');
  }

  const storagePath = buildAvatarStoragePath(userId, file.name);
  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(storagePath, file, { upsert: false, contentType: file.type });

  if (uploadErr) {
    throw new Error(handleSupabaseError(uploadErr));
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(storagePath);
  return data.publicUrl;
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
