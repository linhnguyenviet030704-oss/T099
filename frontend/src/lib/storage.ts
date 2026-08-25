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

const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Uploads user avatar image to Supabase Storage and returns its public URL.
 */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  if (!supabase) {
    throw new Error('Supabase client chưa được cấu hình.');
  }

  if (file.size > MAX_AVATAR_SIZE) {
    throw new Error(`Dung lượng ảnh (${(file.size / 1024 / 1024).toFixed(1)}MB) vượt quá giới hạn tối đa 2MB.`);
  }

  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    throw new Error('Chỉ hỗ trợ file ảnh định dạng JPG, PNG, WEBP hoặc GIF.');
  }

  const rawExt = file.name.split('.').pop() || 'png';
  const fileExt = sanitizeFilename(rawExt).toLowerCase() || 'png';
  const storagePath = `${userId}/avatar-${Date.now()}.${fileExt}`;

  // Upload file to avatars bucket
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(storagePath, file, {
      upsert: true,
      contentType: file.type,
    });

  if (uploadError) {
    throw new Error(handleSupabaseError(uploadError));
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(storagePath);
  if (!data?.publicUrl) {
    throw new Error('Không thể lấy liên kết ảnh đại diện.');
  }

  return data.publicUrl;
}

/**
 * Optionally cleans up an old avatar from Supabase Storage if it belongs to the user.
 */
export async function removeAvatarFile(userId: string, avatarUrl: string): Promise<void> {
  if (!supabase || !avatarUrl) return;
  try {
    const bucketMarker = '/avatars/';
    const idx = avatarUrl.indexOf(bucketMarker);
    if (idx !== -1) {
      const storagePath = decodeURIComponent(avatarUrl.slice(idx + bucketMarker.length).split('?')[0]);
      if (storagePath.startsWith(`${userId}/`)) {
        await supabase.storage.from('avatars').remove([storagePath]);
      }
    }
  } catch {
    // Non-blocking cleanup
  }
}

