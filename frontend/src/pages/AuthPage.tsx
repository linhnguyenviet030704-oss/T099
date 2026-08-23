import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link, Navigate } from 'react-router-dom';
import { LogIn, UserPlus, Mail, Lock, ShieldCheck, MailCheck, AlertCircle } from 'lucide-react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { SITE_URL } from '../lib/env';
import { useAuth } from '../auth/AuthProvider';

interface AuthPageProps {
  mode: 'sign-in' | 'sign-up';
}

export const AuthPage: React.FC<AuthPageProps> = ({ mode }) => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Read redirects state from protected routes
  const from = location.state?.from?.pathname || '/profile';

  // Clear inputs when shifting modes
  useEffect(() => {
    setEmail('');
    setPassword('');
    setFullName('');
    setError(null);
    setSuccessMessage(null);
  }, [mode]);

  if (authLoading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-slate-400">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-3 text-sm font-medium">Đang tải cấu hình xác thực...</p>
      </div>
    );
  }

  // Redirect if already authenticated
  if (user) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError('Hệ thống Supabase chưa được định hình. Vui lòng thiết lập biến môi trường.');
      return;
    }

    setError(null);
    setSuccessMessage(null);

    // Validate email
    if (!email.trim() || !password) {
      setError('Vui lòng điền đầy đủ các thông tin yêu cầu.');
      return;
    }

    if (mode === 'sign-up') {
      if (!fullName.trim()) {
        setError('Họ và tên bắt buộc đối với đơn đăng ký.');
        return;
      }
      if (password.length < 8) {
        setError('Mật khẩu bắt buộc phải tối thiểu 8 ký tự.');
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === 'sign-in') {
        const { error: signErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signErr) throw signErr;

        // Redirect safely
        navigate(from, { replace: true });
      } else {
        // Sign up logic
        const { data, error: registerErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
            emailRedirectTo: `${SITE_URL || window.location.origin}/profile`,
          },
        });

        if (registerErr) throw registerErr;

        // If user already exists (unconfirmed), auto call resend confirmation email
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          const { error: resendErr } = await supabase.auth.resend({
            type: 'signup',
            email: email.trim(),
            options: {
              emailRedirectTo: `${SITE_URL || window.location.origin}/profile`,
            },
          });
          if (resendErr) throw resendErr;
          setSuccessMessage('Tài khoản này chưa được xác minh. Một liên kết xác minh mới đã được gửi đến email của bạn!');
          setPassword('');
          return;
        }

        // If auto sign-in occurs or confirmation is disabled, check session
        if (data.session) {
          setSuccessMessage('Đăng ký tài khoản thành công!');
          setTimeout(() => {
            navigate('/profile', { replace: true });
          }, 1500);
        } else {
          setSuccessMessage('Một liên kết xác minh đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư!');
          // Clear password input
          setPassword('');
        }
      }
    } catch (err: any) {
      console.error('Auth action error:', err);
      setError(handleSupabaseError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-10 animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl shadow-black/40 relative">
        
        {/* Banner header title */}
        <div className="text-center space-y-2 mb-8 select-none">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/10 mb-2">
            {mode === 'sign-in' ? <LogIn className="h-6 w-6" /> : <UserPlus className="h-6 w-6" />}
          </div>
          <h2 className="text-2xl font-black text-slate-100 tracking-tight">
            {mode === 'sign-in' ? 'Chào mừng bạn trở lại' : 'Tạo tài khoản ứng viên'}
          </h2>
          <p className="text-xs text-slate-400">
            {mode === 'sign-in' 
              ? 'Đăng nhập để tìm việc và tương tác trực tiếp với Recruiter' 
              : 'Hãy bắt đầu hành trình tìm kiếm công việc mơ ước của bạn'}
          </p>
        </div>

        {/* Global form errors */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h5 className="text-xs font-bold text-red-400">Thao tác không đạt yêu cầu</h5>
              <p className="text-xs text-slate-400 leading-normal">{error}</p>
            </div>
          </div>
        )}

        {/* Global form success notifications */}
        {successMessage && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 mb-6 flex items-start gap-3">
            <MailCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h5 className="text-xs font-bold text-emerald-400">Yêu cầu hoàn tất</h5>
              <p className="text-xs text-slate-400 leading-normal">{successMessage}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {mode === 'sign-up' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400" htmlFor="fullname">
                Họ và tên ứng viên <span className="text-emerald-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                  <ShieldCheck className="h-4.5 w-4.5" />
                </span>
                <input
                  type="text"
                  id="fullname"
                  required
                  disabled={loading}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-600 focus:bg-slate-950 transition duration-150"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400" htmlFor="email">
              Địa chỉ Email <span className="text-emerald-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                <Mail className="h-4.5 w-4.5" />
              </span>
              <input
                type="email"
                id="email"
                required
                disabled={loading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ungvien@example.com"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-600 focus:bg-slate-950 transition duration-150"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400" htmlFor="password">
              Mật khẩu <span className="text-emerald-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                <Lock className="h-4.5 w-4.5" />
              </span>
              <input
                type="password"
                id="password"
                required
                disabled={loading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'sign-up' ? 'Tối thiểu 8 ký tự' : '••••••••'}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-600 focus:bg-slate-950 transition duration-150"
              />
            </div>
          </div>

          {mode === 'sign-up' && (
            <p className="text-[10px] text-slate-500 font-mono leading-relaxed select-none">
              Bằng việc đăng ký tài khoản, bạn đồng ý với Điều khoản dịch vụ và vai trò ứng viên mặc định của chúng tôi.
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed select-none text-slate-950 py-3 rounded-xl font-bold transition duration-205 cursor-pointer shadow-lg shadow-emerald-500/10 focus:outline-none focus:ring-2 focus:ring-emerald-500 mt-2"
            id="auth-submit-btn"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
            ) : mode === 'sign-in' ? (
              <>
                <LogIn className="h-4.5 w-4.5" />
                Đăng nhập hệ thống
              </>
            ) : (
              <>
                <UserPlus className="h-4.5 w-4.5" />
                Đăng ký thành viên
              </>
            )}
          </button>
        </form>

        {/* Footer toggles */}
        <div className="text-center pt-8 border-t border-slate-800/60 mt-6 select-none">
          <p className="text-xs text-slate-400">
            {mode === 'sign-in' ? 'Chưa sở hữu tài khoản?' : 'Đã đăng ký tài khoản tuyển dụng?'}
            {' '}
            <Link
              to={mode === 'sign-in' ? '/auth/sign-up' : '/auth/sign-in'}
              className="text-emerald-400 hover:text-emerald-300 font-bold hover:underline"
              id="auth-switch-link"
            >
              {mode === 'sign-in' ? 'Đăng ký ứng tuyển' : 'Đăng nhập ngay'}
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
};

export default AuthPage;
