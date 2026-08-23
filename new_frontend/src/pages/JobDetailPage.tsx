import { useCallback, useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, DollarSign, Calendar, Bookmark, BookmarkCheck, CheckCircle2 } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { supabase, handleSupabaseError } from "../lib/supabase";
import { INDEX_FAIL_COPY, ingestResume } from "../lib/ingest";
import type { Application, JobPost, Resume } from "../types";
import { ENUM_LABELS, formatDate } from "../lib/format";
import { APP_STATUS_COLORS, isDeadlinePassed, salaryRange } from "../lib/ui";
import Badge from "../components/Badge";
import AnimatedPage from "../components/AnimatedPage";
import JobCard from "../components/JobCard";

import Button from "../components/ui/Button";
import { Skeleton } from "../components/ui/Skeleton";
import { useToast } from "../context/ToastContext";
import { motion } from "framer-motion";

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { success: toastSuccess, info } = useToast();
  const [job, setJob] = useState<JobPost | null>(null);
  const [similarJobs, setSimilarJobs] = useState<JobPost[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [existingApp, setExistingApp] = useState<Application | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [indexWarning, setIndexWarning] = useState(false);
  const [success, setSuccess] = useState(false);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !id) return;
    try {
      setLoading(true);
      setError(null);
      const { data: jobData, error: jobErr } = await supabase.from("job_posts").select("*, companies(*)").eq("id", id).maybeSingle();
      if (jobErr) throw jobErr;
      if (!jobData) {
        setError("Không tìm thấy tin tuyển dụng.");
        return;
      }
      const parsed = { ...jobData, company: jobData.companies } as JobPost;
      setJob(parsed);
      const { data: similarData } = await supabase.from("job_posts").select("*, companies(*)").eq("status", "published").neq("id", id).limit(12);
      setSimilarJobs(
        ((similarData || []) as any[])
          .map((item) => ({ ...item, company: item.companies }) as JobPost)
          .filter((item) => item.employment_type === parsed.employment_type || item.location === parsed.location || item.company_id === parsed.company_id)
          .slice(0, 3),
      );
      if (user) {
        const { data: savedData } = await supabase.from("saved_jobs").select("id").eq("user_id", user.id).eq("job_post_id", id).maybeSingle();
        setIsSaved(Boolean(savedData));
        const { data: resumesData } = await supabase.from("resumes").select("*").eq("user_id", user.id).is("deleted_at", null);
        const loaded = (resumesData || []) as Resume[];
        setResumes(loaded);
        const def = loaded.find((r) => r.is_default) || loaded[0];
        if (def) setSelectedResumeId(def.id);
        const { data: appData } = await supabase.from("job_submits").select("*").eq("job_post_id", id).eq("applicant_user_id", user.id).maybeSingle();
        if (appData) setExistingApp(appData as Application);
      }
    } catch (err: unknown) {
      setError(handleSupabaseError(err));
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => { void load(); }, [load]);

  const handleToggleSaved = async () => {
    if (!supabase || !id || !user) {
      navigate("/login");
      return;
    }
    const nextSaved = !isSaved;
    setIsSaved(nextSaved);
    if (nextSaved) toastSuccess("Đã lưu tin tuyển dụng!");
    else info("Đã bỏ lưu tin tuyển dụng");
    const { error: saveErr } = isSaved
      ? await supabase.from("saved_jobs").delete().eq("user_id", user.id).eq("job_post_id", id)
      : await supabase.from("saved_jobs").insert({ user_id: user.id, job_post_id: id });
    if (saveErr) setIsSaved(isSaved);
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !user || !id || !job) return;
    if (expired || job.status !== "published") {
      setFormErr("Tin tuyển dụng đã hết hạn hoặc không còn nhận hồ sơ.");
      return;
    }
    if (!selectedResumeId) {
      setFormErr("Vui lòng chọn CV.");
      return;
    }
    setSubmitting(true);
    setFormErr(null);
    try {
      const { data, error: insErr } = await supabase.from("job_submits").insert({
        job_post_id: id,
        applicant_user_id: user.id,
        resume_id: selectedResumeId,
        cover_letter: coverLetter.trim() || null,
      }).select("*").single();
      if (insErr) throw insErr;
      try {
        if (session?.access_token) await ingestResume(selectedResumeId, session.access_token);
      } catch {
        setIndexWarning(true);
      }
      setSuccess(true);
      toastSuccess("Đã nộp đơn ứng tuyển thành công!");
      setExistingApp(data as Application);
    } catch (err: unknown) {
      setFormErr(handleSupabaseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <Skeleton className="h-6 w-24" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white dark:bg-slate-800 rounded-2xl border p-6 space-y-4">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-8 w-3/4" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-2xl border p-6 space-y-3">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
              </div>
            </div>
            <div>
              <div className="bg-white dark:bg-slate-800 rounded-2xl border p-6 space-y-4">
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </AnimatedPage>
    );
  }

  if (error || !job) {
    return (
      <AnimatedPage className="min-h-screen flex flex-col items-center justify-center gap-4">
        <h2 className="font-display text-xl font-bold">Không tìm thấy tin tuyển dụng</h2>
        <Button onClick={() => navigate("/jobs")}>Quay lại danh sách</Button>
      </AnimatedPage>
    );
  }

  const expired = isDeadlinePassed(job.deadline_at);
  const company = job.company;

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <Link to="/jobs" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600 mb-6">
          <ArrowLeft size={14} /> Việc làm
        </Link>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-500 mb-1">{company?.name}</p>
                  <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white">{job.title}</h1>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Badge variant="primary">{ENUM_LABELS.employment_type[job.employment_type]}</Badge>
                    {expired ? <Badge variant="danger">Hết hạn</Badge> : <Badge variant="success">Đang tuyển</Badge>}
                  </div>
                </div>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={() => void handleToggleSaved()}
                  className={`p-2 rounded-xl transition-colors ${isSaved ? "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30" : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"}`}
                >
                  {isSaved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
                </motion.button>
              </div>
              <div className="grid sm:grid-cols-3 gap-3 mt-5 text-sm text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1.5"><MapPin size={14} />{job.location || "Toàn quốc"}</span>
                <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400"><DollarSign size={14} />{salaryRange(job)}</span>
                <span className="flex items-center gap-1.5"><Calendar size={14} />Hạn {formatDate(job.deadline_at)}</span>
              </div>
            </div>
            {[["Mô tả công việc", job.description], ["Yêu cầu", job.requirements], ["Phúc lợi", job.benefits]].map(([title, body]) => body ? (
              <div key={title} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
                <h2 className="font-semibold text-slate-900 dark:text-white mb-3">{title}</h2>
                <div className="prose-content text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">{body}</div>
              </div>
            ) : null)}
            {similarJobs.length > 0 && (
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white mb-3">Việc tương tự</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  {similarJobs.map((j) => <JobCard key={j.id} job={j} compact />)}
                </div>
              </div>
            )}
          </div>
          <div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden sticky top-24">
              {!user ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">Đăng nhập để ứng tuyển vị trí này</p>
                  <Button fullWidth onClick={() => navigate("/login")}>Đăng nhập</Button>
                </div>
              ) : existingApp || success ? (
                <div className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 size={18} className="text-emerald-500" />
                    <span className="font-semibold text-sm">Đã nộp đơn</span>
                  </div>
                  {existingApp && (
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${APP_STATUS_COLORS[existingApp.current_status]}`}>
                      {ENUM_LABELS.application_status[existingApp.current_status]}
                    </span>
                  )}
                  {indexWarning && <p className="text-xs text-amber-600 mt-2">{INDEX_FAIL_COPY}</p>}
                  <Link to="/applications" className="mt-4 block text-center text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:underline">Xem đơn của tôi</Link>
                </div>
              ) : expired ? (
                <div className="p-6 text-sm text-slate-500">Tin tuyển dụng này đã hết hạn.</div>
              ) : resumes.length === 0 ? (
                <div className="p-6 text-center text-sm">
                  <p className="mb-3">Bạn chưa có CV. Tải CV lên để ứng tuyển.</p>
                  <Link to="/cv-vault" className="text-indigo-600 font-medium">Đến Tủ hồ sơ/CV</Link>
                </div>
              ) : (
                <form onSubmit={handleApply} className="p-6 space-y-3">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Chọn CV</label>
                  <select value={selectedResumeId} onChange={(e) => setSelectedResumeId(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm">
                    {resumes.map((r) => <option key={r.id} value={r.id}>{r.title || r.original_filename}</option>)}
                  </select>
                  <textarea rows={4} value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} placeholder="Thư giới thiệu (tùy chọn)" className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm resize-none" />
                  {formErr && <p className="text-xs text-red-500">{formErr}</p>}
                  <Button
                    type="submit"
                    isLoading={submitting}
                    loadingText="Đang nộp..."
                    fullWidth
                  >
                    Nộp đơn
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </AnimatedPage>
  );
}
