import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, HAS_SUPABASE_CONFIG } from './env';

export const supabase = HAS_SUPABASE_CONFIG
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/**
 * Helper to handle Supabase query errors and output a friendly message
 */
export function handleSupabaseError(error: any): string {
  if (!error) return '';
  console.error('Supabase error logs:', error);
  
  const code = error.code;
  const message = error.message || '';
  
  if (code === 'PGRST116') {
    return 'Không tìm thấy dữ liệu yêu cầu.';
  }
  if (code === '42501' || message.includes('permission') || message.includes('Row-level security')) {
    return 'Bạn không có quyền thực hiện thao tác này (bị chặn bởi phân quyền bảo mật).';
  }
  if (code === '23505') {
    return 'Bản ghi đã tồn tại trong hệ thống.';
  }
  if (code === '23503') {
    return 'Thao tác không hợp lệ do liên kết dữ liệu không chính xác.';
  }
  
  // Friendly translation of other commonly encountered errors
  if (message.includes('Invalid login credentials')) {
    return 'Email hoặc mật khẩu không chính xác.';
  }
  if (/object not found/i.test(message) || error.statusCode === '404' || error.statusCode === 404) {
    return 'Không tìm thấy file CV trên Storage.';
  }
  if (message.includes('User already registered')) {
    return 'Email này đã được đăng ký tài khoản.';
  }
  if (message.includes('Error sending confirmation email')) {
    return 'Lỗi khi gửi email xác nhận. Dự án đã vượt quá giới hạn email/giờ của Supabase (Cần cấu hình Custom SMTP hoặc tắt xác minh email trong Supabase Dashboard).';
  }
  if (message.includes('Password should be at least 6 characters') || message.includes('at least 8 characters')) {
    return 'Mật khẩu tối thiểu phải từ 8 ký tự trở lên.';
  }
  
  return message || 'Đã xảy ra lỗi không xác định. Vui lòng thử lại sau.';
}
