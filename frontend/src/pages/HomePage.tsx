import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Briefcase, 
  User, 
  Building2, 
  Sliders, 
  ArrowRight, 
  Sparkles, 
  MapPin, 
  DollarSign, 
  CalendarDays 
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { useCurrentProfile } from '../profile/ProfileProvider';
import { JobPost } from '../types';
import { formatCurrency, formatDate, ENUM_LABELS } from '../lib/format';

export const HomePage: React.FC = () => {
  const { user } = useAuth();
  const { profile, isRecruiter, isAdmin } = useCurrentProfile();
  
  const [recentJobs, setRecentJobs] = useState<JobPost[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRecentJobs() {
      if (!supabase) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        
        // Fetch up to 3 published job posts with details from companies
        const { data, error: qErr } = await supabase
          .from('job_posts')
          .select('*, companies(*)')
          .eq('status', 'published')
          .order('published_at', { ascending: false })
          .limit(3);

        if (qErr) throw qErr;
        
        // Parse results with companies safely joined
        const jobs = (data || []).map((job: any) => ({
          ...job,
          company: job.companies,
        })) as JobPost[];

        setRecentJobs(jobs);
      } catch (err: any) {
        console.error('Error fetching landing jobs:', err);
        setError('Không thể tải danh sách việc làm mới nhất hiện tại.');
      } finally {
        setLoading(false);
      }
    }

    fetchRecentJobs();
  }, []);

  // Determine CTA Button based on role
  const getCtaTarget = () => {
    if (!user) return { to: '/auth/sign-up', label: 'Tạo tài khoản ngay', desc: 'Gia nhập cộng đồng ứng viên tiềm năng.' };
    if (isAdmin) return { to: '/admin/recruiter-requests', label: 'Xem đơn của Recruiter', desc: 'Phê duyệt các hồ sơ đăng ký doanh nghiệp tuyển dụng.' };
    if (isRecruiter) return { to: '/recruiter/jobs', label: 'Bàn việc tuyển dụng', iconIcon: Building2, desc: 'Tạo tin đăng, theo dõi ứng viên và chuyển đổi trạng thái hồ sơ.' };
    return { to: '/jobs', label: 'Xem các việc làm đang mở', desc: 'Tìm kiếm hàng trăm tin tuyển dụng được kiểm chứng.' };
  };

  const cta = getCtaTarget();

  return (
    <div className="space-y-16 py-4 animate-fade-in">
      
      {/* Hero Visual Section */}
      <section className="relative text-center max-w-4xl mx-auto space-y-6 pt-8 pb-4">
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
          Giải pháp tuyển dụng hiện đại
        </div>
        
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-100 via-emerald-300 to-teal-400">
          Kết nối trực tiếp &amp; Nhanh chóng qua Supabase
        </h1>
        
        <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Nền tảng tìm kiếm việc làm chuyên nghiệp không qua trung gian. Hỗ trợ hồ sơ thông minh, upload CV pdf/doc an toàn, bảo mật dữ liệu tuyệt đối nhờ Row-Level Security.
        </p>

        {/* Dynamic CTA Block */}
        <div className="pt-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 max-w-xl mx-auto shadow-xl shadow-emerald-950/20 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest font-mono mb-2">
              Lựa chọn hành động theo vai trò của bạn
            </p>
            <h3 className="text-lg font-bold text-slate-100 mb-4">{cta.desc}</h3>
            
            <Link
              to={cta.to}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 px-6 py-3 rounded-xl font-bold transition duration-200 transform active:scale-95 shadow-lg shadow-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              id="cta-button-home"
            >
              {cta.label}
              <ArrowRight className="h-4.5 w-4.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* 3 Pillars layout (Candidate, Recruiter, Admin) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Candidate pillar */}
        <div className="bg-slate-900/50 border border-slate-800 hover:border-emerald-500/30 rounded-2xl p-6 transition group relative">
          <div className="mb-4 inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-800 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-slate-950 transition-colors">
            <User className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-100 mb-2">Dành cho Ứng viên</h3>
          <p className="text-slate-400 text-sm leading-relaxed mb-4">
            Đăng ký tài khoản, xây dựng dòng thông tin profile chi tiết, upload CV mật bảo mật an toàn. Ứng tuyển chỉ bằng một cú nhấp chuột và theo dõi thời gian thực sự thay đổi trạng thái đơn nộp.
          </p>
          <Link to={user ? "/profile" : "/auth/sign-in"} className="text-xs font-semibold text-emerald-400 hover:underline inline-flex items-center gap-1 group/link">
            Chỉnh sửa CV &amp; Profile <ArrowRight className="h-3 w-3 group-hover/link:translate-x-1 duration-150" />
          </Link>
        </div>

        {/* Recruiter pillar */}
        <div className="bg-slate-900/50 border border-slate-800 hover:border-emerald-500/30 rounded-2xl p-6 transition group relative">
          <div className="mb-4 inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-800 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-slate-950 transition-colors">
            <Building2 className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-100 mb-2">Dành cho Nhà tuyển dụng</h3>
          <p className="text-slate-400 text-sm leading-relaxed mb-4">
            Ứng viên muốn làm recruiter hãy nộp yêu cầu onboard công ty. Khi được duyệt, bạn sở hữu bàn điều khiển đăng tin, đóng/khóa tin, mở CV dạng signed URL, và chuyển đơn nộp sang các giai đoạn phỏng vấn.
          </p>
          <Link to={isRecruiter ? "/recruiter/jobs" : "/recruiter/request"} className="text-xs font-semibold text-emerald-400 hover:underline inline-flex items-center gap-1 group/link">
            Bàn làm việc Recruiter <ArrowRight className="h-3 w-3 group-hover/link:translate-x-1 duration-150" />
          </Link>
        </div>

        {/* Admin pillar */}
        <div className="bg-slate-900/50 border border-slate-800 hover:border-emerald-500/30 rounded-2xl p-6 transition group relative">
          <div className="mb-4 inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-800 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-slate-950 transition-colors">
            <Sliders className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-100 mb-2">Dành cho Quản trị viên</h3>
          <p className="text-slate-400 text-sm leading-relaxed mb-4">
            Phê duyệt giấy phép đăng ký nhà tuyển dụng, quản trị cấp phát vai trò người dùng trong hệ thống (Candidate, Recruiter, Admin) nhằm đảm bảo hệ sinh thái tuyển dụng hoạt động lành mạnh và chính trực.
          </p>
          {isAdmin ? (
            <Link to="/admin/recruiter-requests" className="text-xs font-semibold text-emerald-400 hover:underline inline-flex items-center gap-1 group/link">
              Phê duyệt đăng ký <ArrowRight className="h-3 w-3 group-hover/link:translate-x-1 duration-150" />
            </Link>
          ) : (
            <span className="text-xs text-slate-500 font-mono">Quyền hạn bảo vệ bảo mật khắt khe</span>
          )}
        </div>

      </section>

      {/* Recents Published Jobs Board */}
      <section className="space-y-6 pt-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-100 tracking-tight">
              Việc làm mới nhất hôm nay
            </h2>
            <p className="text-xs text-slate-400 mt-1">Các tin tuyển dụng hiển thị trực tiếp vừa mới được cập nhật trên sàn</p>
          </div>
          <Link 
            to="/jobs" 
            className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg hover:border-emerald-500/30 duration-150 cursor-pointer"
            id="all-jobs-link-home"
          >
            Tất cả việc làm
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 animate-pulse">
                <div className="h-4 bg-slate-800 rounded w-1/3" />
                <div className="space-y-2">
                  <div className="h-6 bg-slate-800 rounded w-3/4" />
                  <div className="h-4 bg-slate-800 rounded w-1/2" />
                </div>
                <div className="h-10 bg-slate-800 rounded-lg w-full" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center text-sm text-red-400 max-w-xl mx-auto">
            {error}
          </div>
        ) : recentJobs.length === 0 ? (
          <div className="text-center bg-slate-900 border border-slate-800 rounded-2xl py-12 px-4 max-w-xl mx-auto">
            <Briefcase className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-slate-300">Chưa có tin tuyển dụng nào</h4>
            <p className="text-xs text-slate-400 mt-1">Nhà tuyển dụng chưa xuất bản các vị trí làm việc.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {recentJobs.map((job) => {
              const isDeadlinePassed = job.deadline_at && new Date(job.deadline_at).getTime() < Date.now();
              return (
                <div
                  key={job.id}
                  className="bg-slate-900 border border-slate-800 hover:border-emerald-500/25 rounded-2xl p-5 flex flex-col justify-between gap-5 transition-shadow hover:shadow-lg shadow-black/20"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase font-mono tracking-wider max-w-[150px] truncate">
                        {job.company?.name || 'Công ty ẩn danh'}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono tracking-widest uppercase shrink-0 ${
                        isDeadlinePassed 
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}>
                        {isDeadlinePassed ? 'Hết hạn' : 'Đang tuyển'}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-200 line-clamp-1 hover:text-emerald-400">
                      <Link to={`/jobs/${job.id}`}>{job.title}</Link>
                    </h3>

                    {/* Meta info labels */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <MapPin className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                        <span className="truncate">{job.location || 'Toàn quốc'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <DollarSign className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                        <span>Lương: <strong className="text-slate-200">{formatCurrency(job.salary_min, job.currency)} - {formatCurrency(job.salary_max, job.currency)}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <CalendarDays className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                        <span>Hạn nộp: {formatDate(job.deadline_at)}</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed pt-1 select-none">
                      {job.description || 'Không có mô tả chi tiết vị trí tuyển dụng này.'}
                    </p>
                  </div>

                  <Link
                    to={`/jobs/${job.id}`}
                    className="w-full inline-flex items-center justify-center gap-1 bg-slate-800 hover:bg-slate-700 hover:text-white px-4 py-2 rounded-xl text-xs font-bold text-slate-200 transition"
                  >
                    Xem chi tiết việc làm
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
};

export default HomePage;
