import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Briefcase, 
  User, 
  FileText, 
  Send, 
  Building2, 
  Sliders, 
  Sparkles,
  Users2,
  LogOut, 
  LogIn, 
  UserPlus, 
  Menu, 
  X, 
  AlertTriangle,
  Clock,
  Moon,
  Sun
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useCurrentProfile } from '../profile/ProfileProvider';
import { HAS_SUPABASE_CONFIG } from '../lib/env';

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, signOut, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading, isRecruiter, isAdmin } = useCurrentProfile();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    localStorage.getItem('theme') === 'light' ? 'light' : 'dark',
  );

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Determine navigation tabs based on user presence & role
  const getNavItems = () => {
    const items = [
      { path: '/', label: 'Trang chủ', icon: Briefcase },
      { path: '/jobs', label: 'Việc làm', icon: Briefcase },
    ];

    if (!user) {
      return items;
    }

    items.push({ path: '/match_job', label: 'Gợi ý việc', icon: Sparkles });
    items.push({ path: '/profile', label: 'Hồ sơ', icon: User });
    items.push({ path: '/profile/resumes', label: 'Tủ hồ sơ/CV', icon: FileText });
    items.push({ path: '/my-applications', label: 'Đơn ứng tuyển', icon: Send });

    if (isAdmin) {
      items.push({ path: '/match_candidates', label: 'Gợi ý ứng viên', icon: Users2 });
      items.push({ path: '/recruiter/jobs', label: 'Bàn Tuyển dụng', icon: Building2 });
      items.push({ path: '/admin/recruiter-requests', label: 'Menu Admin', icon: Sliders });
    } else if (isRecruiter) {
      items.push({ path: '/match_candidates', label: 'Gợi ý ứng viên', icon: Users2 });
      items.push({ path: '/recruiter/jobs', label: 'Bàn Tuyển dụng', icon: Building2 });
    } else {
      // Candidate only gets onboarding request link
      items.push({ path: '/recruiter/request', label: 'Đăng ký Recruiter', icon: Building2 });
    }

    return items;
  };

  const navItems = getNavItems();
  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950">
      
      {/* ⚠️ Supabase missing configuration Banner */}
      {!HAS_SUPABASE_CONFIG && (
        <div className="relative bg-amber-600 text-white px-4 py-3 text-center text-sm font-medium z-50 flex items-center justify-center gap-2 shadow-lg">
          <AlertTriangle className="h-5 w-5 shrink-0 animate-bounce" />
          <span>
            <strong>Cảnh báo phân tích:</strong> Thiếu cấu hình liên kết Supabase (`NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Vui lòng thiết lập biến môi trường để kích hoạt tính năng thực!
          </span>
        </div>
      )}

      {/* Main Header navigation */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-900/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            
            {/* Logo */}
            <div className="flex items-center gap-8">
              <Link 
                to="/" 
                className="flex items-center gap-2 group focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded p-1"
                id="header-logo"
              >
                <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-slate-950 font-bold shadow-md shadow-emerald-500/10">
                  <Briefcase className="h-5 w-5" />
                </div>
                <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-400 group-hover:from-emerald-300 group-hover:to-teal-300 transition-all">
                  NextJob
                </span>
              </Link>

              {/* Desktop Nav menu items */}
              <nav aria-label="Desktop navigation" className="hidden md:flex items-center gap-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                        active 
                          ? 'bg-slate-800 text-emerald-400 shadow-inner' 
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                      }`}
                      id={`nav-item-${item.path.replace(/\//g, 'root')}`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* User credentials + actions area */}
            <div className="hidden md:flex items-center gap-4">
              <button
                type="button"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer transition"
                aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
                title={theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'}
                id="theme-toggle"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              {authLoading || profileLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 font-mono animate-pulse">
                  <Clock className="h-3.5 w-3.5 animate-spin" />
                  <span>Đang tải thông tin...</span>
                </div>
              ) : user ? (
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-slate-400 max-w-[180px] truncate font-mono">
                      {user.email}
                    </p>
                    {profile && (
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                        profile.role === 'admin' 
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                          : profile.role === 'recruiter'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}>
                        {profile.role === 'admin' ? 'Quản trị viên' : profile.role === 'recruiter' ? 'Tuyển dụng' : 'Ứng viên'}
                      </span>
                    )}
                  </div>
                  
                  {/* User Profile Initial representation circle */}
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 text-emerald-400 font-semibold border border-slate-700 uppercase font-mono shadow-sm">
                    {profile?.full_name?.charAt(0) || user.email?.charAt(0) || 'U'}
                  </div>

                  <button
                    onClick={async () => {
                      setMobileMenuOpen(false);
                      await signOut();
                    }}
                    className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 hover:text-red-400 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold select-none cursor-pointer duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    id="sign-out-btn"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Đăng xuất
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    to="/auth/sign-in"
                    className="flex items-center gap-1 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                    id="sign-in-btn"
                  >
                    <LogIn className="h-4 w-4" />
                    Đăng nhập
                  </Link>
                  <Link
                    to="/auth/sign-up"
                    className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-md shadow-emerald-500/10"
                    id="sign-up-btn"
                  >
                    <UserPlus className="h-4 w-4" />
                    Đăng ký
                  </Link>
                </div>
              )}
            </div>

            {/* Mobile Hamburger toggle */}
            <div className="flex md:hidden items-center gap-2">
              <button
                type="button"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer transition"
                aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
                title={theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                aria-expanded="false"
                id="mobile-menu-toggle"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>

          </div>
        </div>

        {/* Mobile menu container overlay */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-800 bg-slate-900 py-3 px-4 flex flex-col gap-2 shadow-inner">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    active 
                      ? 'bg-slate-800 text-emerald-400' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className="h-4.5 w-4.5 text-slate-400 group-hover:text-slate-200 shrink-0" />
                  {item.label}
                </Link>
              );
            })}

            <div className="border-t border-slate-800 my-2 pt-2">
              {user ? (
                <div className="flex flex-col gap-3 px-4 py-2">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 text-emerald-400 font-bold border border-slate-700 uppercase font-mono">
                      {profile?.full_name?.charAt(0) || user.email?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <p className="text-xs text-slate-200 font-mono truncate max-w-[200px]">{user.email}</p>
                      {profile && (
                        <p className="text-[10px] text-emerald-400 uppercase font-mono tracking-wider font-semibold">
                          {profile.role === 'admin' ? 'Quản trị viên' : profile.role === 'recruiter' ? 'Nhà tuyển dụng' : 'Ứng viên'}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      setMobileMenuOpen(false);
                      await signOut();
                    }}
                    className="w-full flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg text-sm font-semibold select-none cursor-pointer transition border border-slate-700"
                    id="mobile-sign-out"
                  >
                    <LogOut className="h-4 w-4 text-red-400" />
                    Đăng xuất
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2 px-4">
                  <Link
                    to="/auth/sign-in"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full flex items-center justify-center gap-1.5 text-slate-300 hover:bg-slate-800 py-2 rounded-lg text-sm font-semibold border border-slate-700 text-center"
                  >
                    <LogIn className="h-4 w-4" />
                    Đăng nhập
                  </Link>
                  <Link
                    to="/auth/sign-up"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full flex items-center justify-center gap-1.5 bg-emerald-500 text-slate-950 py-2 rounded-lg text-sm font-bold shadow-md text-center"
                  >
                    <UserPlus className="h-4 w-4" />
                    Đăng ký
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Page Content Body Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer credits block */}
      <footer className="w-full border-t border-slate-900 bg-slate-950 text-slate-500 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-mono">
          <p>© 2026 NextJob Recruitment Portal. Toàn bộ thông tin được bảo mật trên nền tảng Supabase.</p>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            <span className="text-slate-400">Database Connection: Real-time RLS Active</span>
          </div>
        </div>
      </footer>

    </div>
  );
};

export default AppShell;
