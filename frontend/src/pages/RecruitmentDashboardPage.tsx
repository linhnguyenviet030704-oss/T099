import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Users, Briefcase, Check, X, Pencil, Sparkles, Building2 } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useCurrentProfile } from "../profile/ProfileProvider";
import { useLang } from "../context/LangContext";
import { supabase, handleSupabaseError } from "../lib/supabase";
import { getResumeSignedUrl } from "../lib/storage";
import type { Application, ApplicationStatus, CompanyMember, EmploymentType, JobPost, JobPostStatus, Profile } from "../types";
import { getEnumLabels, formatDate } from "../lib/format";
import { APP_STATUS_COLORS, JOB_STATUS_COLORS, salaryRange, TERMINAL_APP_STATUSES, RECRUITER_STAGE_OPTIONS } from "../lib/ui";
import AnimatedPage from "../components/AnimatedPage";
import Button from "../components/ui/Button";
import { useToast } from "../context/ToastContext";
import CandidateCompareDock, { SelectedCandidateItem } from "../components/candidate/CandidateCompareDock";
import CVComparisonModal from "../components/candidate/CVComparisonModal";

export default function RecruitmentDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useCurrentProfile();
  const { lang, t } = useLang();
  const { success, error: toastError } = useToast();
  const companySelectRef = useRef<HTMLSelectElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const descInputRef = useRef<HTMLTextAreaElement>(null);
  const [fieldErrors, setFieldErrors] = useState<{ company?: boolean; title?: boolean; description?: boolean }>({});
  const [memberships, setMemberships] = useState<CompanyMember[]>([]);
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, Profile>>({});
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showCreateJob, setShowCreateJob] = useState(false);
  const [editingJob, setEditingJob] = useState<JobPost | null>(null);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [stageNote, setStageNote] = useState("");
  const [newStatus, setNewStatus] = useState<ApplicationStatus>("screening");
  const [selectedCompareCandidates, setSelectedCompareCandidates] = useState<SelectedCandidateItem[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobSaving, setJobSaving] = useState(false);
  const [updatingApp, setUpdatingApp] = useState(false);
  const [newJob, setNewJob] = useState({
    title: "",
    description: "",
    requirements: "",
    benefits: "",
    location: "",
    employment_type: "full_time" as EmploymentType,
    salaryMin: "",
    salaryMax: "",
    currency: "VND",
    deadline: "",
    status: "published" as JobPostStatus,
  });

  const enumLabels = getEnumLabels(lang);

  const fetchWorkspace = useCallback(async () => {
    if (!supabase || !user) return;
    try {
      setLoading(true);
      setError(null);
      const { data: memberData, error: mErr } = await supabase
        .from("company_members")
        .select("*, companies(*)")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .in("role", ["owner", "recruiter"]);
      if (mErr) throw mErr;
      const items = (memberData || []).map((m: any) => ({ ...m, company: m.companies })) as CompanyMember[];

      setMemberships(items);
      let companyId = selectedCompanyId;
      if (!companyId || !items.some((m) => m.company_id === companyId)) {
        companyId = items[0]?.company_id || "";
        setSelectedCompanyId(companyId);
      }
      if (!companyId) {
        setJobs([]);
        setApplications([]);
        return;
      }
      const { data: jobsData, error: jobsErr } = await supabase
        .from("job_posts")
        .select("*")
        .eq("company_id", companyId)
        .eq("created_by_user_id", user.id)
        .order("updated_at", { ascending: false });
      if (jobsErr) throw jobsErr;
      const loadedJobs = (jobsData || []) as JobPost[];
      setJobs(loadedJobs);
      if (loadedJobs.length > 0) {
        const { data: appsData, error: appsErr } = await supabase.from("job_submits").select("*").in("job_post_id", loadedJobs.map((j) => j.id)).order("applied_at", { ascending: false });
        if (appsErr) throw appsErr;
        const loadedApps = (appsData || []) as Application[];
        setApplications(loadedApps);
        if (loadedApps.length > 0) {
          const { data: profilesData } = await supabase.from("profiles").select("*").in("id", Array.from(new Set(loadedApps.map((a) => a.applicant_user_id))));
          const map: Record<string, Profile> = {};
          (profilesData || []).forEach((p: Profile) => { map[p.id] = p; });
          setProfilesMap(map);
        } else {
          setProfilesMap({});
        }
      } else {
        setApplications([]);
        setProfilesMap({});
      }
    } catch (err: unknown) {
      setError(handleSupabaseError(err));
    } finally {
      setLoading(false);
    }
  }, [user, selectedCompanyId]);

  useEffect(() => { if (user) void fetchWorkspace(); }, [user, fetchWorkspace]);

  const resetForm = () => {
    setNewJob({
      title: "", description: "", requirements: "", benefits: "",
      location: "", employment_type: "full_time", salaryMin: "", salaryMax: "", currency: "VND", deadline: "", status: "published",
    });
    setEditingJob(null);
    setFieldErrors({});
  };

  const handleOpenCreateJob = () => {
    if (memberships.length === 0) {
      toastError(t.noApprovedCompanyTitle, t.noApprovedCompanyDesc);
      navigate("/register-recruiter");
      return;
    }
    resetForm();
    setShowCreateJob(true);
  };

  const handleOpenEditJob = (job: JobPost) => {
    setEditingJob(job);
    setFieldErrors({});
    setNewJob({
      title: job.title || "",
      description: job.description || "",
      requirements: job.requirements || "",
      benefits: job.benefits || "",
      location: job.location || "",
      employment_type: job.employment_type || "full_time",
      salaryMin: job.salary_min != null ? String(job.salary_min) : "",
      salaryMax: job.salary_max != null ? String(job.salary_max) : "",
      currency: job.currency || "VND",
      deadline: job.deadline_at ? job.deadline_at.split("T")[0] : "",
      status: job.status || "published",
    });
    setShowCreateJob(true);
  };

  const [updatingStatusJobId, setUpdatingStatusJobId] = useState<string | null>(null);

  const handleSaveJob = async () => {
    setFieldErrors({});
    if (!selectedCompanyId) {
      setFieldErrors({ company: true });
      toastError(t.noApprovedCompanyTitle, t.noApprovedCompanyDesc);
      navigate("/register-recruiter");
      return;
    }
    if (!newJob.title.trim()) {
      setFieldErrors({ title: true });
      titleInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      titleInputRef.current?.focus();
      toastError(t.missingField, t.enterJobTitle);
      return;
    }
    if (!newJob.description.trim()) {
      setFieldErrors({ description: true });
      descInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      descInputRef.current?.focus();
      toastError(t.missingField, t.enterJobDesc);
      return;
    }
    if (!supabase || !user) {
      toastError(lang === "en" ? "System Error" : "Lỗi hệ thống", t.pleaseReLogin);
      return;
    }
    setJobSaving(true);
    try {
      const payload: Record<string, unknown> = {
        company_id: selectedCompanyId,
        created_by_user_id: user.id,
        title: newJob.title.trim(),
        description: newJob.description.trim(),
        requirements: newJob.requirements.trim() || null,
        benefits: newJob.benefits.trim() || null,
        location: newJob.location.trim() || null,
        employment_type: newJob.employment_type,
        salary_min: newJob.salaryMin ? Number(newJob.salaryMin) : null,
        salary_max: newJob.salaryMax ? Number(newJob.salaryMax) : null,
        currency: newJob.currency.toUpperCase(),
        status: newJob.status,
        published_at: newJob.status === "published" ? new Date().toISOString() : null,
        deadline_at: newJob.deadline ? new Date(newJob.deadline).toISOString() : null,
        updated_at: new Date().toISOString(),
      };

      if (editingJob) {
        const { error: err } = await supabase.from("job_posts").update(payload).eq("id", editingJob.id);
        if (err) throw err;
        success(t.updateJobSuccess);
      } else {
        const { error: err } = await supabase.from("job_posts").insert(payload);
        if (err) throw err;
        success(t.createJobSuccess);
      }

      setShowCreateJob(false);
      resetForm();
      await fetchWorkspace();
    } catch (err: unknown) {
      toastError(editingJob ? (lang === "en" ? "Update failed" : "Cập nhật tin thất bại") : (lang === "en" ? "Creation failed" : "Tạo tin thất bại"), handleSupabaseError(err));
    } finally {
      setJobSaving(false);
    }
  };

  const handleUpdateJobStatus = async (jobId: string, status: JobPostStatus) => {
    if (!supabase) return;
    setUpdatingStatusJobId(jobId);
    try {
      const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (status === "published") payload.published_at = new Date().toISOString();
      if (status === "closed") payload.closed_at = new Date().toISOString();
      const { error: uErr } = await supabase.from("job_posts").update(payload).eq("id", jobId);
      if (uErr) throw uErr;
      if (status === "published") {
        success(t.jobPublishedSuccess);
      } else {
        success(`${lang === "en" ? "Changed status to:" : "Đã chuyển trạng thái sang:"} ${enumLabels.job_post_status[status]}`);
      }
      await fetchWorkspace();
    } catch (err: unknown) {
      toastError(lang === "en" ? "Update failed" : "Cập nhật thất bại", handleSupabaseError(err));
    } finally {
      setUpdatingStatusJobId(null);
    }
  };

  const handleAddStage = async (appId: string) => {
    if (!supabase || !user) return;
    setUpdatingApp(true);
    try {
      const { error: sErr } = await supabase.from("application_stages").insert({
        application_id: appId,
        changed_by_user_id: user.id,
        stage: newStatus,
        note: stageNote.trim() || null,
        is_system_generated: false,
      });
      if (sErr) throw sErr;
      success(t.stageUpdatedSuccess);
      setSelectedApp(null);
      setStageNote("");
      await fetchWorkspace();
    } catch (err: unknown) {
      toastError(lang === "en" ? "Update failed" : "Cập nhật thất bại", handleSupabaseError(err));
    } finally {
      setUpdatingApp(false);
    }
  };

  const handleToggleCompare = (app: Application, candName: string) => {
    setSelectedCompareCandidates((prev) => {
      const exists = prev.some((c) => c.id === app.id);
      if (exists) {
        return prev.filter((c) => c.id !== app.id);
      }
      if (prev.length >= 5) {
        toastError(t.compareMax5Title, t.compareMax5CandidateDesc);
        return prev;
      }
      return [
        ...prev,
        {
          id: app.id,
          name: candName,
          subtitle: app.resume_title_snapshot || undefined,
        },
      ];
    });
  };

  const companyJobs = jobs;
  const selectedJob = selectedJobId ? jobs.find((j) => j.id === selectedJobId) : null;
  const jobApps = selectedJobId ? applications.filter((a) => a.job_post_id === selectedJobId) : [];

  return (
    <AnimatedPage className="min-h-[calc(100vh-3.5rem)] bg-slate-50 dark:bg-slate-900 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
        <div className="flex items-center justify-between mb-3.5">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{t.recruiterWorkspace}</h1>
          {memberships.length > 0 && (
            <select
              ref={companySelectRef}
              value={selectedCompanyId}
              onChange={(e) => {
                setSelectedCompanyId(e.target.value);
                setSelectedJobId(null);
                setSelectedCompareCandidates([]);
                setFieldErrors((p) => ({ ...p, company: false }));
              }}
              className={`px-3 py-1.5 bg-white dark:bg-slate-800 border rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-2xs ${fieldErrors.company ? "border-red-500 ring-2 ring-red-400" : "border-slate-200 dark:border-slate-700"}`}
            >
              {memberships.map((m) => <option key={m.company_id} value={m.company_id}>{m.company?.name || m.company_id}</option>)}
            </select>
          )}
        </div>
        {memberships.length === 0 && !loading && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-2.5">
              <div className="w-9 h-9 bg-amber-100 dark:bg-amber-900/50 rounded-xl flex items-center justify-center text-amber-600 dark:text-amber-300 shrink-0">
                <Building2 size={18} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{t.noApprovedCompanyTitle}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  {t.noApprovedCompanyDesc}
                </p>
              </div>
            </div>
            <Button size="sm" onClick={() => navigate("/register-recruiter")} leftIcon={<Building2 size={14} />}>
              {t.recruiterRegister}
            </Button>
          </div>
        )}
        {error && <p className="text-xs text-rose-500 mb-3">{error}</p>}
        {loading ? <p className="text-xs text-slate-500">{lang === "en" ? "Loading..." : "Đang tải..."}</p> : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-xs text-slate-700 dark:text-slate-300">{t.jobListings} ({companyJobs.length})</h2>
                <button onClick={handleOpenCreateJob} className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors cursor-pointer shadow-2xs">
                  <Plus size={12} /> {t.createJob}
                </button>
              </div>
              <AnimatePresence>
                {showCreateJob && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-indigo-200 dark:border-indigo-800 p-4 space-y-3 shadow-xs">
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-1.5">
                        <h3 className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                          {editingJob ? <Pencil size={13} className="text-indigo-600" /> : <Plus size={13} className="text-indigo-600" />}
                          {editingJob ? t.editJobListing : t.createNewJob}
                        </h3>
                        <button onClick={() => { setShowCreateJob(false); resetForm(); }} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                          <X size={13} />
                        </button>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{t.jobTitleLabel}</label>
                        <input
                          ref={titleInputRef}
                          placeholder={t.jobTitlePlaceholder}
                          value={newJob.title}
                          onChange={(e) => { setNewJob((p) => ({ ...p, title: e.target.value })); setFieldErrors((p) => ({ ...p, title: false })); }}
                          className={`w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border rounded-xl text-sm transition-all ${fieldErrors.title ? "border-red-500 ring-2 ring-red-400" : "border-slate-200 dark:border-slate-600"}`}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{t.jobDescLabel}</label>
                        <textarea
                          ref={descInputRef}
                          rows={3}
                          placeholder={t.jobDescPlaceholder}
                          value={newJob.description}
                          onChange={(e) => { setNewJob((p) => ({ ...p, description: e.target.value })); setFieldErrors((p) => ({ ...p, description: false })); }}
                          className={`w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border rounded-xl text-sm resize-none transition-all ${fieldErrors.description ? "border-red-500 ring-2 ring-red-400" : "border-slate-200 dark:border-slate-600"}`}
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-purple-700 dark:text-purple-300">{t.candidateReqAIMatching}</label>
                          <span className="text-[11px] font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/40 px-2 py-0.5 rounded-full flex items-center gap-1 border border-purple-200 dark:border-purple-800">
                            <Sparkles size={11} /> {t.coreForAIMatching}
                          </span>
                        </div>
                        <textarea
                          rows={4}
                          placeholder={t.candidateReqPlaceholder}
                          value={newJob.requirements}
                          onChange={(e) => setNewJob((p) => ({ ...p, requirements: e.target.value }))}
                          className="w-full px-3 py-2 bg-purple-50/30 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/60 rounded-xl text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{t.benefitsLabel}</label>
                        <textarea rows={2} placeholder={t.benefitsPlaceholder} value={newJob.benefits} onChange={(e) => setNewJob((p) => ({ ...p, benefits: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm resize-none" />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">{t.location}</label>
                          <input placeholder={t.locationPlaceholder} value={newJob.location} onChange={(e) => setNewJob((p) => ({ ...p, location: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">{t.employmentType}</label>
                          <select value={newJob.employment_type} onChange={(e) => setNewJob((p) => ({ ...p, employment_type: e.target.value as EmploymentType }))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm">
                            {Object.entries(enumLabels.employment_type).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">{t.minSalary}</label>
                          <input type="number" placeholder={t.salaryPlaceholder} value={newJob.salaryMin} onChange={(e) => setNewJob((p) => ({ ...p, salaryMin: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">{t.maxSalary}</label>
                          <input type="number" placeholder={t.salaryPlaceholder} value={newJob.salaryMax} onChange={(e) => setNewJob((p) => ({ ...p, salaryMax: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">{t.deadline}</label>
                          <input type="date" value={newJob.deadline} onChange={(e) => setNewJob((p) => ({ ...p, deadline: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">{t.currencyStatus}</label>
                          <div className="grid grid-cols-2 gap-1">
                            <select value={newJob.currency} onChange={(e) => setNewJob((p) => ({ ...p, currency: e.target.value }))} className="w-full px-2 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-xs">
                              <option value="VND">VND</option>
                              <option value="USD">USD</option>
                            </select>
                            <select value={newJob.status} onChange={(e) => setNewJob((p) => ({ ...p, status: e.target.value as JobPostStatus }))} className="w-full px-2 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-xs">
                              <option value="draft">{enumLabels.job_post_status.draft}</option>
                              <option value="published">{enumLabels.job_post_status.published}</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end pt-2 border-t border-slate-100 dark:border-slate-700">
                        <Button variant="ghost" size="xs" onClick={() => { setShowCreateJob(false); resetForm(); }}>{t.cancel}</Button>
                        <Button size="xs" onClick={() => void handleSaveJob()} disabled={jobSaving} isLoading={jobSaving} loadingText={t.savingJob}>
                          {editingJob ? t.saveChanges : t.createJobAction}
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {companyJobs.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center">
                  <Briefcase size={32} className="text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">{t.noJobsInWorkspace}</p>
                </div>
              ) : companyJobs.map((job) => {
                const appCount = applications.filter((a) => a.job_post_id === job.id).length;
                return (
                  <motion.button
                    key={job.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setSelectedJobId(selectedJobId === job.id ? null : job.id);
                      setSelectedCompareCandidates([]);
                    }}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${selectedJobId === job.id ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-300"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium line-clamp-2 text-slate-900 dark:text-white">{job.title}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${JOB_STATUS_COLORS[job.status]}`}>{enumLabels.job_post_status[job.status]}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOpenEditJob(job); }}
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-200/50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                          title={t.editJob}
                        >
                          <Pencil size={12} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1"><Users size={11} />{t.applicantCount(appCount)}</span>
                      <span>{t.deadline}: {formatDate(job.deadline_at, false, lang)}</span>
                    </div>
                    {job.status === "published" ? (
                      <div className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center justify-between">
                        <span>✓ {t.publishedOnJobs}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${job.id}`); }}
                          className="hover:underline text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-0.5"
                        >
                          {t.viewOnJobs}
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                        ⚠️ {t.draftStatusHint(enumLabels.job_post_status[job.status])}
                      </div>
                    )}
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {(["published", "closed", "archived"] as JobPostStatus[]).filter((s) => s !== job.status).map((s) => (
                        <motion.span
                          key={s}
                          whileTap={{ scale: 0.92 }}
                          onClick={(e) => { e.stopPropagation(); void handleUpdateJobStatus(job.id, s); }}
                          className="text-xs px-2.5 py-0.5 bg-slate-100 dark:bg-slate-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 hover:text-indigo-600 text-slate-600 dark:text-slate-300 rounded-full font-medium transition-colors cursor-pointer"
                        >
                          → {enumLabels.job_post_status[s]}
                        </motion.span>
                      ))}
                    </div>
                  </motion.button>
                );
              })}
            </div>
            <div className="lg:col-span-2">
              {!selectedJob ? (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center h-full flex flex-col items-center justify-center">
                  <Briefcase size={48} className="text-slate-200 dark:text-slate-700 mb-4" />
                  <p className="text-slate-500 dark:text-slate-400 text-sm">{t.selectJobPrompt}</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="p-5 border-b border-slate-100 dark:border-slate-700">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="font-semibold text-slate-900 dark:text-white">{selectedJob.title}</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t.applicantCount(jobApps.length)} • {salaryRange(selectedJob, lang)} • {selectedJob.location || (lang === "en" ? "Location not set" : "Chưa có địa điểm")}</p>
                      </div>
                      <Button size="xs" variant="outline" leftIcon={<Pencil size={12} />} onClick={() => handleOpenEditJob(selectedJob)}>
                        {t.editJob}
                      </Button>
                    </div>
                    {selectedJob.requirements ? (
                      <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/60 rounded-xl">
                        <div className="flex items-center justify-between text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">
                          <span className="flex items-center gap-1.5"><Sparkles size={12} /> {t.candidateReqAIMatching}:</span>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">{selectedJob.requirements}</p>
                      </div>
                    ) : (
                      <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl flex items-center justify-between text-xs text-amber-800 dark:text-amber-300">
                        <span>⚠️ {t.missingReqWarning}</span>
                        <button onClick={() => handleOpenEditJob(selectedJob)} className="underline font-semibold hover:text-amber-900 dark:hover:text-amber-200 shrink-0 ml-2">{t.addNow}</button>
                      </div>
                    )}
                  </div>
                  {jobApps.length === 0 ? (
                    <div className="p-12 text-center text-sm text-slate-500 dark:text-slate-400">{t.noApplicantsYet}</div>
                  ) : (
                    <div>
                      {jobApps.length >= 2 && (
                        <div className="px-4 py-2 bg-indigo-50/50 dark:bg-indigo-950/20 border-b border-indigo-100 dark:border-indigo-900/40 flex items-center justify-between text-xs text-indigo-700 dark:text-indigo-300">
                          <span className="flex items-center gap-1.5">
                            <Sparkles size={13} className="text-purple-600 dark:text-purple-400" />
                            {t.compareHelperText}
                          </span>
                          {selectedCompareCandidates.length >= 2 && (
                            <button
                              type="button"
                              onClick={() => setShowCompareModal(true)}
                              className="font-bold underline hover:text-indigo-900 dark:hover:text-indigo-100"
                            >
                              {t.compareNow(selectedCompareCandidates.length)}
                            </button>
                          )}
                        </div>
                      )}
                      {jobApps.map((app) => {
                        const cand = profilesMap[app.applicant_user_id];
                        const candName = cand?.full_name || app.applicant_user_id;
                        const isSelected = selectedApp === app.id;
                        const isCompareSelected = selectedCompareCandidates.some((c) => c.id === app.id);

                        return (
                          <div
                            key={app.id}
                            className={`p-4 border-b border-slate-100 dark:border-slate-700 transition-colors ${
                              isCompareSelected ? "bg-indigo-50/40 dark:bg-indigo-950/20" : ""
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3">
                                {/* Checkbox for compare */}
                                <button
                                  type="button"
                                  onClick={() => handleToggleCompare(app, candName)}
                                  className={`mt-0.5 w-5 h-5 rounded-lg border flex items-center justify-center transition-all shrink-0 ${
                                    isCompareSelected
                                      ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                                      : "border-slate-300 dark:border-slate-600 hover:border-indigo-400 bg-white dark:bg-slate-800"
                                  }`}
                                  title={isCompareSelected ? t.compareDeselect : t.compareCandidateHint}
                                >
                                  {isCompareSelected && <Check size={12} strokeWidth={3} />}
                                </button>

                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-slate-900 dark:text-white">{candName}</p>
                                    {isCompareSelected && (
                                      <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-semibold px-2 py-0.2 rounded-full">
                                        {t.compareSelected}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">{app.resume_title_snapshot || "CV"}</p>
                                  {app.resume_storage_path_snapshot && (
                                    <button
                                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-1"
                                      onClick={() => void getResumeSignedUrl(app.resume_storage_path_snapshot!).then((url) => window.open(url, "_blank"))}
                                    >
                                      {t.openCV}
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${APP_STATUS_COLORS[app.current_status]}`}>{enumLabels.application_status[app.current_status]}</span>
                                {!TERMINAL_APP_STATUSES.includes(app.current_status) && (
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() => {
                                      if (isSelected) {
                                        setSelectedApp(null);
                                      } else {
                                        // Nhà tuyển dụng không chuyển về 'pending' (Đã nộp đơn), mặc định 'screening' nếu đang pending
                                        const initialStage: ApplicationStatus = app.current_status === "pending"
                                          ? "screening"
                                          : (RECRUITER_STAGE_OPTIONS.includes(app.current_status) ? app.current_status : "screening");
                                        setSelectedApp(app.id);
                                        setNewStatus(initialStage);
                                        setStageNote("");
                                      }
                                    }}
                                  >
                                    {t.updateStage}
                                  </Button>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <div className="mt-3 grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-700/40 p-3 rounded-xl border border-slate-200 dark:border-slate-600">
                                <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as ApplicationStatus)} className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs text-slate-900 dark:text-white">
                                  {RECRUITER_STAGE_OPTIONS.map((s) => (
                                    <option key={s} value={s}>{enumLabels.application_status[s]}</option>
                                  ))}
                                </select>
                                <input value={stageNote} onChange={(e) => setStageNote(e.target.value)} placeholder={t.stageNotePlaceholder} className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs text-slate-900 dark:text-white" />
                                <div className="col-span-2 flex justify-end gap-2">
                                  <Button size="xs" variant="ghost" onClick={() => setSelectedApp(null)}>{t.cancel}</Button>
                                  <Button size="xs" leftIcon={<Check size={12} />} onClick={() => void handleAddStage(app.id)} isLoading={updatingApp} loadingText={t.savingProfile}>{t.save}</Button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Floating Selection Compare Dock */}
      <CandidateCompareDock
        selectedCandidates={selectedCompareCandidates}
        onRemove={(id) => setSelectedCompareCandidates((prev) => prev.filter((c) => c.id !== id))}
        onClear={() => setSelectedCompareCandidates([])}
        onCompare={() => setShowCompareModal(true)}
      />

      {/* CV Comparison Modal */}
      <CVComparisonModal
        isOpen={showCompareModal}
        onClose={() => setShowCompareModal(false)}
        jobId={selectedJob?.id || ""}
        jobTitle={selectedJob?.title || ""}
        applicationIds={selectedCompareCandidates.map((c) => c.id)}
      />
    </AnimatedPage>
  );
}


