import React, { useEffect, useState, useDeferredValue } from 'react';
import { Link } from 'react-router-dom';
import { 
  Briefcase, 
  Search, 
  MapPin, 
  DollarSign, 
  Clock, 
  Building2, 
  ShieldCheck, 
  Layers3, 
  ArrowRight,
  Filter,
  Bookmark,
  BookmarkCheck
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { JobPost } from '../types';
import { formatCurrency, formatDate, ENUM_LABELS } from '../lib/format';

export const JobsPage: React.FC = () => {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [savedJobIds, setSavedJobIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search input and options
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [showSavedOnly, setShowSavedOnly] = useState(false);

  // Deferred value for buttery smooth typing performance
  const deferredSearch = useDeferredValue(searchTerm);

  useEffect(() => {
    async function fetchJobsList() {
      if (!supabase) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);

        // Fetch all jobs with company join
        const { data, error: qErr } = await supabase
          .from('job_posts')
          .select('*, companies(*)')
          .eq('status', 'published')
          .order('published_at', { ascending: false });

        if (qErr) throw qErr;

        const results = (data || []).map((job: any) => ({
          ...job,
          company: job.companies,
        })) as JobPost[];

        setJobs(results);

        if (user) {
          const { data: savedData, error: savedErr } = await supabase
            .from('saved_jobs')
            .select('job_post_id')
            .eq('user_id', user.id);

          if (savedErr) throw savedErr;
          setSavedJobIds((savedData || []).map((row: any) => row.job_post_id));
        } else {
          setSavedJobIds([]);
          setShowSavedOnly(false);
        }
      } catch (err: any) {
        console.error('Error fetching jobs board:', err);
        setError('Không thể kết nối và truy cập danh bạ tin đăng tuyển dụng.');
      } finally {
        setLoading(false);
      }
    }

    fetchJobsList();
  }, [user]);

  const handleToggleSavedJob = async (jobId: string) => {
    if (!supabase) return;
    if (!user) {
      alert('Vui lòng đăng nhập để lưu công việc.');
      return;
    }

    const isSaved = savedJobIds.includes(jobId);
    setSavedJobIds((ids) => isSaved ? ids.filter((id) => id !== jobId) : [...ids, jobId]);

    const { error: saveErr } = isSaved
      ? await supabase.from('saved_jobs').delete().eq('user_id', user.id).eq('job_post_id', jobId)
      : await supabase.from('saved_jobs').insert({ user_id: user.id, job_post_id: jobId });

    if (saveErr) {
      setSavedJobIds((ids) => isSaved ? [...ids, jobId] : ids.filter((id) => id !== jobId));
      alert('Không thể cập nhật việc đã lưu. Vui lòng thử lại.');
    }
  };

  // Compute stats
  const totalPublished = jobs.length;
  const activeCount = jobs.filter(job => {
    const isPast = job.deadline_at && new Date(job.deadline_at).getTime() < Date.now();
    return !isPast;
  }).length;

  // Retrieve locations list for filtering dropdown
  const uniqueLocations = Array.from(
    new Set(jobs.map((j) => j.location?.trim()).filter(Boolean))
  ) as string[];

  // Execute clientside search filtering
  const filteredJobs = jobs.filter((job) => {
    // 1. Filter by dropdown location
    if (selectedLocation !== 'all' && job.location !== selectedLocation) {
      return false;
    }

    if (showSavedOnly && !savedJobIds.includes(job.id)) {
      return false;
    }

    // 2. Filter by employment type
    if (selectedType !== 'all' && job.employment_type !== selectedType) {
      return false;
    }

    // 3. Filter by search query text
    const query = deferredSearch.toLowerCase().trim();
    if (!query) return true;

    return (
      job.title.toLowerCase().includes(query) ||
      (job.company?.name || '').toLowerCase().includes(query) ||
      (job.location || '').toLowerCase().includes(query) ||
      (job.description || '').toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-8 py-2 animate-fade-in">
      
      {/* Title block */}
      <section className="border-b border-slate-800 pb-4">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight flex items-center gap-2">
          <Briefcase className="h-7 w-7 text-emerald-400" />
          Sàn tìm kiếm việc làm Công khai
        </h1>
        <p className="text-xs text-slate-400 mt-1">Kết nối hồ sơ với danh bạ hàng trăm doanh nghiệp. Khám phá các cơ hội tốt nhất.</p>
      </section>

      {/* Stats indicators and Search bar layout */}
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-md grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
        
        {/* Statistics tracker */}
        <div className="md:col-span-3 flex md:flex-col justify-between md:justify-center gap-4 py-2 border-b md:border-b-0 md:border-r border-slate-800 shrink-0">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Đang hiệu lực</p>
            <h4 className="text-2xl font-black text-emerald-400 font-mono mt-0.5">{activeCount} tin tuyển dụng</h4>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Tổng bài viết đăng</p>
            <h4 className="text-base font-bold text-slate-300 font-mono">{totalPublished} tin tổng cộng</h4>
          </div>
          {user && (
            <button
              type="button"
              onClick={() => setShowSavedOnly((value) => !value)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${
                showSavedOnly
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
              }`}
            >
              <BookmarkCheck className="h-3.5 w-3.5" />
              Chỉ việc đã lưu ({savedJobIds.length})
            </button>
          )}
        </div>

        {/* Dynamic client-side search controls */}
        <div className="md:col-span-9 grid grid-cols-1 sm:grid-cols-12 gap-3.5">
          
          <div className="sm:col-span-6 relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
              <Search className="h-4 w-4" />
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tiêu đề, tên ty, mô tả..."
              className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none placeholder:text-slate-600 transition"
              id="jobs-search-input"
            />
          </div>

          <div className="sm:col-span-3 relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
              <Filter className="h-4 w-4" />
            </span>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none transition cursor-pointer"
            >
              <option value="all">Mọi loại hình</option>
              {Object.entries(ENUM_LABELS.employment_type).map(([key, val]) => (
                <option key={key} value={key}>{val}</option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3 relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
              <MapPin className="h-4 w-4" />
            </span>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none transition cursor-pointer"
            >
              <option value="all">Toàn quốc</option>
              {uniqueLocations.map((loc) => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>

        </div>

      </section>

      {/* Main Listing Grid display */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 animate-pulse">
              <div className="h-5 bg-slate-800 rounded w-1/4" />
              <div className="h-7 bg-slate-800 rounded w-1/2" />
              <div className="h-4 bg-slate-800 rounded w-1/3" />
              <div className="h-10 bg-slate-800 rounded-xl w-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-2xl text-center text-sm max-w-xl mx-auto">
          {error}
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="text-center py-20 bg-slate-900 border border-slate-800 rounded-3xl max-w-xl mx-auto">
          <Layers3 className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <h4 className="text-sm font-bold text-slate-300">Không tìm thấy vị trí phù hợp</h4>
          <p className="text-xs text-slate-400 mt-1 leading-normal px-6">Hãy thử giảm thiểu điều kiện lọc hoặc nhập lại từ khóa đơn giản hơn để tìm kiếm các bài viết khác.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {filteredJobs.map((job) => {
            const isDeadlinePassed = job.deadline_at && new Date(job.deadline_at).getTime() < Date.now();
            const isSaved = savedJobIds.includes(job.id);
            return (
              <div
                key={job.id}
                className="bg-slate-900 border border-slate-800 hover:border-emerald-500/20 rounded-3xl p-6 flex flex-col justify-between gap-6 transition hover:shadow-xl hover:shadow-emerald-950/5 relative group"
              >
                
                <div className="space-y-4">
                  
                  {/* Company descriptor + Badge */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">
                        {job.company?.name || 'Công ty ẩn danh'}
                      </span>
                      {job.company?.website_url && (
                        <p className="text-[9px] text-emerald-400 font-mono leading-none">{job.company.website_url}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleSavedJob(job.id)}
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition cursor-pointer ${
                          isSaved
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-emerald-400 hover:bg-slate-800'
                        }`}
                        aria-label={isSaved ? 'Bỏ lưu công việc' : 'Lưu công việc'}
                        title={isSaved ? 'Bỏ lưu công việc' : 'Lưu công việc'}
                      >
                        {isSaved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                      </button>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest font-mono ${
                        isDeadlinePassed
                          ? 'bg-red-500/20 text-red-500 border border-red-500/30'
                          : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                      }`}>
                        {isDeadlinePassed ? 'Hết hạn' : 'Đang mở'}
                      </span>
                    </div>
                  </div>

                  {/* Job title */}
                  <div className="space-y-1">
                    <h3 className="text-base font-extrabold text-slate-200 line-clamp-1 group-hover:text-emerald-400 transition-colors">
                      <Link to={`/jobs/${job.id}`}>{job.title}</Link>
                    </h3>
                    <p className="text-[11px] text-emerald-400 font-mono font-medium">
                      {ENUM_LABELS.employment_type[job.employment_type as keyof typeof ENUM_LABELS.employment_type] || job.employment_type}
                    </p>
                  </div>

                  {/* Core specifications indicators */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 border-t border-slate-800/80 font-mono text-[10px]">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <MapPin className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">{job.location || 'Toàn quốc'}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-400">
                      <DollarSign className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">
                        {formatCurrency(job.salary_min, job.currency)} - {formatCurrency(job.salary_max, job.currency)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-400 sm:col-span-2">
                      <Clock className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      <span>Hạn ứng tuyển: <strong className="text-slate-300">{formatDate(job.deadline_at)}</strong></span>
                    </div>
                  </div>

                  {/* Description brief snippets */}
                  <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed font-light">
                    {job.description || 'Không có mô tả vắn tắt nào được thiết đặt cho bài viết này.'}
                  </p>

                </div>

                {/* Foot card button */}
                <div className="pt-2 border-t border-slate-800/50 flex items-center justify-between gap-4">
                  <span className="text-[9px] text-slate-500 font-mono">
                    Đăng ngày: {formatDate(job.published_at || job.created_at)}
                  </span>
                  
                  <Link
                    to={`/jobs/${job.id}`}
                    className="inline-flex items-center gap-1.5 bg-slate-800 group-hover:bg-emerald-500 group-hover:text-slate-950 text-slate-200 px-4 py-2 rounded-xl text-xs font-bold transition duration-200"
                  >
                    Xem &amp; Ứng tuyển
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};

export default JobsPage;
