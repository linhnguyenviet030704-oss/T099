import { useCallback, useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, DollarSign, Calendar, Bookmark, BookmarkCheck, CheckCircle2 } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useCurrentProfile } from "../profile/ProfileProvider";
import { useLang } from "../context/LangContext";
import { supabase, handleSupabaseError } from "../lib/supabase";
import { INDEX_FAIL_COPY, ingestResume } from "../lib/ingest";
import type { Application, JobPost, Resume } from "../types";
import { getEnumLabels, formatDate } from "../lib/format";
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
  const { profile } = useCurrentProfile();
  const { lang, t } = useLang();
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

  const enumLabels = getEnumLabels(lang);

  const load = useCallback(async () => {
    if (!supabase || !id) return;
    try {
      setLoading(true);
      setError(null);
      const { data: jobData, error: jobErr } = await supabase.from("job_posts").select("*, companies(*)").eq("id", id).maybeSingle();
      if (jobErr) throw jobErr;
      if (!jobData) {
        setError(t.jobNotFound);
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
  }, [id, user, t.jobNotFound]);

  useEffect(() => { void load(); }, [load]);

  const handleToggleSaved = async () => {
    if (!supabase || !id || !user) {
      navigate("/login");
      return;
    }
    const nextSaved = !isSaved;
    setIsSaved(nextSaved);
    if (nextSaved) toastSuccess(t.savedJobToast);
    else info(t.unsavedJobToast);
    const { error: saveErr } = isSaved
      ? await supabase.from("saved_jobs").delete().eq("user_id", user.id).eq("job_post_id", id)
      : await supabase.from("saved_jobs").insert({ user_id: user.id, job_post_id: id });
    if (saveErr) setIsSaved(isSaved);
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !user || !id || !job) return;
    if (expired || job.status !== "published") {
      setFormErr(t.jobExpiredError);
      return;
    }
    if (!selectedResumeId) {
      setFormErr(t.selectResumeError);
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
      toastSuccess(t.appliedSuccess);
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
        <h2 className="font-display text-xl font-bold">{t.jobNotFound}</h2>
        <Button onClick={() => navigate("/jobs")}>{t.backToList}</Button>
      </AnimatedPage>
    );
  }

  const expired = isDeadlinePassed(job.deadline_at);
  const company = job.company;

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
        <Link to="/jobs" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-indigo-600 mb-3.5 transition-colors">
          <ArrowLeft size={13} /> {t.jobs}
        </Link>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white dark:bg-slate-800/90 rounded-xl border border-slate-200/80 dark:border-slate-700/80 p-4 sm:p-5 shadow-xs">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-0.5">{company?.name}</p>
                  <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white leading-tight">{job.title}</h1>
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    <Badge variant="primary">{enumLabels.employment_type[job.employment_type]}</Badge>
                    {expired ? <Badge variant="danger">{t.expired}</Badge> : <Badge variant="success">{t.hiring}</Badge>}
                  </div>
                </div>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={() => void handleToggleSaved()}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${isSaved ? "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30" : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"}`}
                >
                  {isSaved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                </motion.button>
              </div>
              <div className="grid sm:grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1.5"><MapPin size={13} className="text-slate-400 shrink-0" />{job.location || (lang === "en" ? "Nationwide" : "Toàn quốc")}</span>
                <span className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400"><DollarSign size={13} className="text-emerald-500 shrink-0" />{salaryRange(job, lang)}</span>
                <span className="flex items-center gap-1.5"><Calendar size={13} className="text-slate-400 shrink-0" />{t.deadline} {formatDate(job.deadline_at, false, lang)}</span>
              </div>
            </div>
            {[[t.jobDescription, job.description], [t.requirements, job.requirements], [t.benefits, job.benefits]].map(([title, body]) => body ? (
              <div key={title} className="bg-white dark:bg-slate-800/90 rounded-xl border border-slate-200/80 dark:border-slate-700/80 p-4 sm:p-5 shadow-xs">
                <h2 className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white mb-2">{title}</h2>
                <div className="prose-content text-xs sm:text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed">{body}</div>
              </div>
            ) : null)}
            {similarJobs.length > 0 && (
              <div className="pt-2">
                <h2 className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white mb-2.5">{t.similarJobs}</h2>
                <div className="grid md:grid-cols-2 gap-3">
                  {similarJobs.map((j) => <JobCard key={j.id} job={j} compact />)}
                </div>
              </div>
            )}
          </div>
          <div>
            <div className="bg-white dark:bg-slate-800/90 rounded-xl border border-slate-200/80 dark:border-slate-700/80 overflow-hidden sticky top-20 shadow-xs">
              {!user ? (
                <div className="p-4 sm:p-5 text-center">
                  <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">{t.loginToApply}</p>
                  <Button fullWidth size="sm" onClick={() => navigate("/login")}>{t.login}</Button>
                </div>
              ) : profile?.role !== "candidate" ? (
                <div className="p-4 sm:p-5 text-center text-xs text-slate-500 dark:text-slate-400">
                  {t.candidateOnlyApply}
                </div>
              ) : existingApp || success ? (
                <div className="p-4 sm:p-5">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                    <span className="font-semibold text-xs text-slate-800 dark:text-white">{t.appliedSuccess}</span>
                  </div>
                  {existingApp && (
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${APP_STATUS_COLORS[existingApp.current_status]}`}>
                      {enumLabels.application_status[existingApp.current_status]}
                    </span>
                  )}
                  {indexWarning && <p className="text-xs text-amber-600 mt-2">{INDEX_FAIL_COPY}</p>}
                  <Link to="/applications" className="mt-3 block text-center text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">{t.viewMyApps}</Link>
                </div>
              ) : expired ? (
                <div className="p-4 sm:p-5 text-xs text-slate-500">{t.jobExpiredDesc}</div>
              ) : resumes.length === 0 ? (
                <div className="p-4 sm:p-5 text-center text-xs">
                  <p className="mb-2.5 text-slate-600 dark:text-slate-300">{t.noCVToApply}</p>
                  <Link to="/cv-vault" className="text-indigo-600 dark:text-indigo-400 font-semibold">{t.goToCVVault}</Link>
                </div>
              ) : (
                <form onSubmit={handleApply} className="p-4 sm:p-5 space-y-2.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">{t.chooseCV}</label>
                  <select value={selectedResumeId} onChange={(e) => setSelectedResumeId(e.target.value)} className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-xs">
                    {resumes.map((r) => <option key={r.id} value={r.id}>{r.title || r.original_filename}</option>)}
                  </select>
                  <textarea rows={3} value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} placeholder={t.coverLetterPlaceholder} className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-xs resize-none" />
                  {formErr && <p className="text-xs text-rose-500">{formErr}</p>}
                  <Button
                    type="submit"
                    size="sm"
                    isLoading={submitting}
                    loadingText={t.submittingApp}
                    fullWidth
                  >
                    {t.submitApp}
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
