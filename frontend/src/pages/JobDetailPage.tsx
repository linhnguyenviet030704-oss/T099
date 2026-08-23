import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  Briefcase, 
  Building2, 
  MapPin, 
  DollarSign, 
  CalendarDays, 
  Send, 
  Link as LinkIcon, 
  CheckCircle2, 
  FileWarning, 
  LogIn, 
  UserPlus, 
  ChevronRight,
  FileDown,
  Clock,
  Bookmark,
  BookmarkCheck,
  ExternalLink
} from 'lucide-react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { INDEX_FAIL_COPY, ingestResume } from '../lib/ingest';
import { JobPost, Resume, Application } from '../types';
import { formatCurrency, formatDate, ENUM_LABELS } from '../lib/format';

const externalUrl = (url: string) => url.startsWith('http') ? url : `https://${url}`;

const getMarketSalaryInsight = (job: JobPost) => {
  // ponytail: placeholder until real salary-market data or paid VIP logic exists.
  const range = `${formatCurrency(job.salary_min, job.currency)} - ${formatCurrency(job.salary_max, job.currency)}`;
  return `Placeholder: mức lương phổ biến trên thị trường cho nhóm việc này sẽ được nạp từ nguồn dữ liệu VIP. Lương tin đăng hiện tại: ${range}.`;
};

export const JobDetailPage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const { user, session } = useAuth();

  const [job, setJob] = useState<JobPost | null>(null);
  const [similarJobs, setSimilarJobs] = useState<JobPost[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [existingApp, setExistingApp] = useState<Application | null>(null);
  const [isSavedJob, setIsSavedJob] = useState(false);

  // loading / submitting states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingSavedJob, setSavingSavedJob] = useState(false);
  const [indexWarning, setIndexWarning] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form states
  const [selectedResumeId, setSelectedResumeId] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);

  const fetchJobWorkspace = useCallback(async () => {
    if (!supabase || !jobId) return;
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch job details joined with companies
      const { data: jobData, error: jobErr } = await supabase
        .from('job_posts')
        .select('*, companies(*)')
        .eq('id', jobId)
        .maybeSingle();

      if (jobErr) throw jobErr;
      if (!jobData) {
        setError('Không tìm thấy tin tuyển dụng yêu cầu.');
        setLoading(false);
        return;
      }

      const parsedJob = {
        ...jobData,
        company: jobData.companies,
      } as JobPost;

      setJob(parsedJob);

      const { data: similarData } = await supabase
        .from('job_posts')
        .select('*, companies(*)')
        .eq('status', 'published')
        .neq('id', jobId)
        .order('published_at', { ascending: false })
        .limit(12);

      const related = ((similarData || []).map((item: any) => ({
        ...item,
        company: item.companies,
      })) as JobPost[])
        .filter((item) =>
          item.employment_type === parsedJob.employment_type
          || Boolean(parsedJob.location && item.location === parsedJob.location)
          || item.company_id === parsedJob.company_id,
        )
        .slice(0, 3);
      setSimilarJobs(related);

      // 2. Fetch authenticated user data, such as resumes and previous applications to this job
      if (user) {
        const { data: savedData } = await supabase
          .from('saved_jobs')
          .select('id')
          .eq('user_id', user.id)
          .eq('job_post_id', jobId)
          .maybeSingle();

        setIsSavedJob(Boolean(savedData));

        // Fetch active resumes
        const { data: resumesData } = await supabase
          .from('resumes')
          .select('*')
          .eq('user_id', user.id)
          .is('deleted_at', null);

        const loadedResumes = (resumesData || []) as Resume[];
        setResumes(loadedResumes);

        // Pre-select the default resume or the first one
        const defaultResume = loadedResumes.find((r) => r.is_default);
        if (defaultResume) {
          setSelectedResumeId(defaultResume.id);
        } else if (loadedResumes.length > 0) {
          setSelectedResumeId(loadedResumes[0].id);
        }

        // Fetch application matching this job
        const { data: appData } = await supabase
          .from('job_submits')
          .select('*')
          .eq('job_post_id', jobId)
          .eq('applicant_user_id', user.id)
          .maybeSingle();

        if (appData) {
          setExistingApp(appData as Application);
        }
      } else {
        setIsSavedJob(false);
      }

    } catch (err: any) {
      console.error('Error loading job details:', err);
      setError(handleSupabaseError(err));
    } finally {
      setLoading(false);
    }
  }, [jobId, user]);

  useEffect(() => {
    fetchJobWorkspace();
  }, [jobId, user, fetchJobWorkspace]);

  const handleToggleSavedJob = async () => {
    if (!supabase || !jobId) return;
    if (!user) {
      alert('Vui lòng đăng nhập để lưu công việc.');
      return;
    }

    setSavingSavedJob(true);
    setFormErr(null);

    try {
      const { error: saveErr } = isSavedJob
        ? await supabase.from('saved_jobs').delete().eq('user_id', user.id).eq('job_post_id', jobId)
        : await supabase.from('saved_jobs').insert({ user_id: user.id, job_post_id: jobId });

      if (saveErr) throw saveErr;
      setIsSavedJob((value) => !value);
    } catch (err: any) {
      console.error('Save job error:', err);
      setFormErr(handleSupabaseError(err));
    } finally {
      setSavingSavedJob(false);
    }
  };

  // Execute application submission
  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !user || !jobId || !job) return;

    setFormErr(null);

    if (isDeadlinePassed(job.deadline_at) || job.status !== 'published') {
      setFormErr('Tin tuyển dụng này đã hết hạn hoặc không còn nhận hồ sơ.');
      return;
    }

    setSubmitting(true);

    if (!selectedResumeId) {
      setFormErr('Vui lòng lựa chọn tệp CV đại diện để nộp đơn tuyển.');
      setSubmitting(false);
      return;
    }

    try {
      // Create new application
      const payload = {
        job_post_id: jobId,
        applicant_user_id: user.id,
        resume_id: selectedResumeId,
        cover_letter: coverLetter.trim() || null,
      };

      const { data, error } = await supabase
        .from('job_submits')
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;

      try {
        if (session?.access_token) await ingestResume(selectedResumeId, session.access_token);
      } catch {
        setIndexWarning(true);
      }

      setSuccess(true);
      setExistingApp(data as Application);
    } catch (err: any) {
      console.error('Error submitting application:', err);
      setFormErr(handleSupabaseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-20 animate-pulse space-y-4">
        <div className="h-6 bg-slate-900 rounded-xl w-1/4 mx-auto" />
        <div className="h-20 bg-slate-900 rounded-2xl w-3/4 mx-auto" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="text-center py-16 bg-slate-900/40 border border-slate-800 rounded-3xl max-w-xl mx-auto space-y-4">
        <FileWarning className="h-12 w-12 text-slate-500 mx-auto" />
        <h3 className="text-base font-bold text-slate-300">Không tìm thấy tin đăng tuyển</h3>
        <p className="text-xs text-slate-400">{error || 'Có lỗi bất định xảy ra khi liên kết tin tuyển dụng.'}</p>
        <Link to="/jobs" className="inline-block bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-bold px-4 py-2 rounded-xl">Quay lại danh sách</Link>
      </div>
    );
  }

  const isDeadlinePassed = job.deadline_at && new Date(job.deadline_at).getTime() < Date.now();
  const mapQuery = encodeURIComponent(job.location || job.company?.name || job.title);
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
  const mapEmbedUrl = `https://maps.google.com/maps?q=${mapQuery}&output=embed`;
  const companySocialLinks = [
    ['Facebook', job.company?.facebook_url],
    ['LinkedIn', job.company?.linkedin_url],
    ['X/Twitter', job.company?.twitter_url],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <div className="space-y-8 py-2 animate-fade-in">
      
      {/* Navigation Breadcrumb trail */}
      <nav aria-label="Breadcrumb navigation" className="flex items-center gap-1.5 text-xs text-slate-500 select-none">
        <Link to="/jobs" className="hover:text-slate-300">Sàn việc làm</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-slate-300 font-medium truncate max-w-xs">{job.title}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column — Detailed Job Parameters & Contents */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
            
            {/* Summary Title & Headers */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest font-mono ${
                  isDeadlinePassed 
                    ? 'bg-red-500/25 text-red-400 border border-red-500/30' 
                    : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                }`}>
                  {isDeadlinePassed ? 'Hết hạn nộp đơn' : 'Đang tiếp nhận hồ sơ'}
                </span>
                <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded text-[9px] font-mono select-none uppercase tracking-wider font-semibold border border-slate-700">
                  {ENUM_LABELS.employment_type[job.employment_type as keyof typeof ENUM_LABELS.employment_type] || job.employment_type}
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight leading-snug">
                {job.title}
              </h1>

              <p className="text-sm text-emerald-400 font-bold flex items-center gap-1">
                <Building2 className="h-4.5 w-4.5" />
                {job.company?.name || 'Công ty đăng tuyển'}
              </p>

              <button
                type="button"
                onClick={handleToggleSavedJob}
                disabled={savingSavedJob}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-black transition cursor-pointer ${
                  isSavedJob
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-emerald-400'
                }`}
                id="save-job-toggle"
              >
                {isSavedJob ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                {savingSavedJob ? 'Đang lưu...' : isSavedJob ? 'Đã lưu công việc' : 'Lưu công việc'}
              </button>
            </div>

            {/* Quick Meta Stats panels */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-4 border-y border-slate-850/60 font-mono text-xs text-slate-300 select-none">
              
              <div className="space-y-1">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Mức lương tuyển dụng</p>
                <div className="flex items-center gap-1">
                  <DollarSign className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span className="font-bold text-slate-100 font-sans">
                    {formatCurrency(job.salary_min, job.currency)} - {formatCurrency(job.salary_max, job.currency)}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Hình thức địa điểm</p>
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span className="font-bold text-slate-100">{job.location || 'Toàn quốc'}</span>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Hạn làm việc ứng tuyển</p>
                <div className="flex items-center gap-1">
                  <CalendarDays className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span className="font-bold text-slate-100">{formatDate(job.deadline_at)}</span>
                </div>
              </div>

            </div>

            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
              <div className="flex items-start gap-2.5">
                <DollarSign className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-xs font-black uppercase tracking-widest text-amber-400">Mức lương phổ biến trên thị trường</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">{getMarketSalaryInsight(job)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-850 overflow-hidden bg-slate-950/40">
              <div className="flex items-center justify-between gap-3 border-b border-slate-850 px-4 py-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-emerald-400" />
                  Bản đồ địa điểm làm việc
                </h3>
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 hover:text-emerald-300"
                >
                  Mở map <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <iframe
                title="Bản đồ địa điểm làm việc"
                src={mapEmbedUrl}
                loading="lazy"
                className="h-56 w-full border-0"
              />
            </div>

            {/* Content text description parameters */}
            <div className="space-y-6 pt-2 font-light text-slate-300 text-sm leading-relaxed">
              
              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 select-none border-b border-slate-850 pb-1">1. Mô tả chi tiết công việc</h3>
                <p className="whitespace-pre-line leading-relaxed">{job.description}</p>
              </div>

              {job.requirements && (
                <div className="space-y-2">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 select-none border-b border-slate-850 pb-1">2. Yêu cầu chuyên môn ứng viên</h3>
                  <p className="whitespace-pre-line leading-relaxed">{job.requirements}</p>
                </div>
              )}

              {job.benefits && (
                <div className="space-y-2">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 select-none border-b border-slate-850 pb-1">3. Quyền lợi và chế độ phúc lợi</h3>
                  <p className="whitespace-pre-line leading-relaxed">{job.benefits}</p>
                </div>
              )}

            </div>

          </div>

          {/* Company details section */}
          {job.company && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 select-none border-b border-slate-850 pb-1.5 flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-emerald-400" />
                Về Công ty tuyển dụng
              </h3>
              
              <div className="space-y-2 text-sm">
                <h4 className="font-extrabold text-slate-200">{job.company.name}</h4>
                {job.company.description && (
                  <p className="text-slate-400 leading-relaxed font-light">{job.company.description}</p>
                )}
                {job.company.website_url && (
                  <div className="pt-2">
                    <a
                      href={externalUrl(job.company.website_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300"
                    >
                      <LinkIcon className="h-4 w-4" />
                      Website doanh nghiệp
                    </a>
                  </div>
                )}
                {companySocialLinks.length > 0 && (
                  <div className="pt-2 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Mạng xã hội</p>
                    <div className="flex flex-wrap gap-2">
                      {companySocialLinks.map(([label, url]) => (
                        <a
                          key={label}
                          href={externalUrl(url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-[10px] font-bold text-slate-300 hover:text-emerald-400 hover:bg-slate-800"
                        >
                          <LinkIcon className="h-3.5 w-3.5" />
                          {label}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {similarJobs.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 select-none border-b border-slate-850 pb-1.5 flex items-center gap-1.5">
                <Briefcase className="h-4 w-4 text-emerald-400" />
                Việc làm tương tự
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {similarJobs.map((item) => (
                  <Link
                    key={item.id}
                    to={`/jobs/${item.id}`}
                    className="rounded-2xl border border-slate-850 bg-slate-950/40 p-4 hover:bg-slate-800 transition"
                  >
                    <p className="text-xs font-black text-slate-200 line-clamp-2">{item.title}</p>
                    <p className="mt-1 text-[10px] text-emerald-400 font-mono line-clamp-1">{item.company?.name || 'Công ty tuyển dụng'}</p>
                    <p className="mt-2 text-[10px] text-slate-500 font-mono line-clamp-1">{item.location || 'Toàn quốc'}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column — 5 Conditional Apply Branches panel */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5 sticky top-24">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-3 flex items-center gap-1.5 select-none">
              <Send className="h-4.5 w-4.5 text-emerald-400" />
              Gửi hồ sơ ứng tuyển
            </h3>

            {/* Dynamic Application branch resolver */}

            {/* BRANCH 1: User is not authenticated/anonymous */}
            {!user ? (
              <div className="text-center py-4 space-y-4">
                <p className="text-xs text-slate-400 leading-normal">Bạn cần đăng nhập bằng tài khoản thành viên để nộp đơn ứng tuyển cho vị trí này.</p>
                <div className="flex flex-col gap-2 pt-2">
                  <Link
                    to="/auth/sign-in"
                    className="w-full inline-flex items-center justify-center gap-1 bg-slate-850 hover:bg-slate-800 text-slate-200 py-2.5 rounded-xl text-xs font-semibold border border-slate-800"
                  >
                    <LogIn className="h-4 w-4 text-slate-400" />
                    Đăng nhập tài khoản
                  </Link>
                  <Link
                    to="/auth/sign-up"
                    className="w-full inline-flex items-center justify-center gap-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-emerald-500/10"
                  >
                    <UserPlus className="h-4 w-4" />
                    Đăng ký tài khoản
                  </Link>
                </div>
              </div>
            ) :

            /* BRANCH 2: Already submitted application to this job post */
            existingApp ? (
              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 space-y-4">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-xs font-black text-emerald-400 uppercase tracking-wider">Hồ sơ đã được gửi</h5>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">Ngày nộp: {formatDate(existingApp.applied_at)}</p>
                  </div>
                </div>

                <div className="border-t border-slate-850 pt-3 text-xs space-y-2">
                  <p className="text-slate-400 select-none leading-relaxed">Bạn đã ứng tuyển vào vị trí này. Xem chi tiết trạng thái hoặc viết hồi đáp tại danh mục đơn ứng tuyển của bạn.</p>
                  
                  {existingApp.resume_title_snapshot && (
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850/60 font-mono text-[9px] text-slate-400 flex items-center gap-1.5 select-none">
                      <FileDown className="h-3.5 w-3.5 text-slate-500" />
                      <span>CV Snapshot: <span className="text-slate-300 font-sans font-bold">{existingApp.resume_title_snapshot}</span></span>
                    </div>
                  )}

                  <div className="pt-2">
                    <span className="block text-[10px] text-slate-500 font-mono uppercase font-bold tracking-wider mb-1 select-none">Trạng thái hiện tại</span>
                    <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      existingApp.current_status === 'rejected' 
                        ? 'bg-red-500/20 text-red-400' 
                        : existingApp.current_status === 'accepted' || existingApp.current_status === 'offer'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {ENUM_LABELS.application_status[existingApp.current_status]}
                    </span>
                  </div>

                  <div className="pt-3">
                    <Link
                      to="/my-applications"
                      className="w-full inline-flex items-center justify-center gap-1.5 bg-slate-955 hover:bg-slate-800 text-slate-300 py-2.5 rounded-xl text-xs font-bold border border-slate-800 transition text-center col-span-2"
                    >
                      Bảng đơn của tôi
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </div>
            ) :

            /* BRANCH 3: Authenticated candidate has no resumes */
            resumes.length === 0 ? (
              <div className="text-center py-4 space-y-4">
                <p className="text-xs text-slate-400 leading-normal">Tài khoản ứng viên chưa sở hữu tập tin tài liệu CV. Hãy xây dựng và tải lên một tệp CV đại diện hợp lệ để ứng tuyển.</p>
                <Link
                  to="/profile/resumes"
                  className="w-full inline-flex items-center justify-center gap-1 mb-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold py-2.5 rounded-xl border border-emerald-500/20 transition cursor-pointer"
                >
                  Tải tệp Hồ sơ/CV lên ngay
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            ) :

            /* BRANCH 4: Job deadline passed */
            isDeadlinePassed ? (
              <div className="bg-slate-955 text-center py-4 border border-slate-850 rounded-2xl p-4">
                <p className="text-xs font-bold text-red-500 uppercase tracking-widest font-mono select-none">Hết hạn nộp đơn</p>
                <p className="text-[11px] text-slate-400 mt-1 leading-normal select-none">Hạn chót tiếp nhận hồ sơ đã trôi qua. Bạn không thể thực hiện hành động nộp đơn vào thời điểm này.</p>
                <button
                  disabled
                  className="w-full py-2.5 bg-slate-800 text-slate-600 rounded-xl text-xs font-semibold cursor-not-allowed mt-4"
                >
                  Nút nộp bị khóa
                </button>
              </div>
            ) :

            /* BRANCH 5: Eligible to apply (Authenticated + HAS Resumes + Job Valid) */
            (
              <div className="space-y-4">
                
                {success && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-xs flex items-center gap-1.5 select-none">
                    <CheckCircle2 className="h-4.5 w-4.5" />
                    <div>
                      <p>Ứng tuyển hồ sơ thành công! Đang lưu.</p>
                      {indexWarning && <p className="mt-1 text-amber-400">{INDEX_FAIL_COPY}</p>}
                    </div>
                  </div>
                )}

                {formErr && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-xs leading-normal">
                    {formErr}
                  </div>
                )}

                <form onSubmit={handleApplySubmit} className="space-y-4">
                  
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="resume-picker">
                      Chọn CV ứng tuyển <span className="text-emerald-500">*</span>
                    </label>
                    <select
                      id="resume-picker"
                      required
                      value={selectedResumeId}
                      onChange={(e) => setSelectedResumeId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
                    >
                      {resumes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title} {r.is_default ? '(Mặc định)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="coverletter-textarea">
                      Giới thiệu bản thân / Thư giới thiệu
                    </label>
                    <textarea
                      id="coverletter-textarea"
                      rows={5}
                      maxLength={5000}
                      value={coverLetter}
                      onChange={(e) => setCoverLetter(e.target.value)}
                      placeholder="Trình bày lý do bạn là ứng viên phù hợp, kinh nghiệm tích lũy phù hợp tin đăng tuyển này (tối đa 5000 ký tự)..."
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none font-light leading-relaxed"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-600 select-none text-slate-950 font-bold py-3 rounded-xl text-xs transition duration-155 flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/10 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    id="apply-form-submit-btn"
                  >
                    {submitting ? (
                      <>
                        <Clock className="h-4 w-4 animate-spin" />
                        Đang nộp hồ sơ...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 animate-pulse" />
                        Bấm nộp đơn ngay
                      </>
                    )}
                  </button>

                </form>

              </div>
            )}

          </div>
        </div>

      </div>

    </div>
  );
};

export default JobDetailPage;
