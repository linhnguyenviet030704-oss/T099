import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Users, Briefcase, Check, X, Pencil, Sparkles, Building2 } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useCurrentProfile } from "../profile/ProfileProvider";
import { supabase, handleSupabaseError } from "../lib/supabase";
import { getResumeSignedUrl } from "../lib/storage";
import type { Application, ApplicationStatus, CompanyMember, EmploymentType, JobPost, JobPostStatus, Profile } from "../types";
import { ENUM_LABELS, formatDate } from "../lib/format";
import { APP_STATUS_COLORS, JOB_STATUS_COLORS, salaryRange, TERMINAL_APP_STATUSES } from "../lib/ui";
import AnimatedPage from "../components/AnimatedPage";

import Button from "../components/ui/Button";
import { Skeleton } from "../components/ui/Skeleton";
import { useToast } from "../context/ToastContext";

export default function RecruitmentDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useCurrentProfile();
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
      toastError("Chưa có công ty được duyệt", "Bạn chưa có công ty được duyệt. Vui lòng gửi đơn Đăng ký Nhà tuyển dụng!");
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
      toastError("Chưa có công ty", "Tài khoản của bạn chưa có công ty được Admin phê duyệt.");
      navigate("/register-recruiter");
      return;
    }
    if (!newJob.title.trim()) {
      setFieldErrors({ title: true });
      titleInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      titleInputRef.current?.focus();
      toastError("Thiếu thông tin", "Vui lòng nhập tiêu đề công việc!");
      return;
    }
    if (!newJob.description.trim()) {
      setFieldErrors({ description: true });
      descInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      descInputRef.current?.focus();
      toastError("Thiếu thông tin", "Vui lòng nhập mô tả công việc!");
      return;
    }
    if (!supabase || !user) {
      toastError("Lỗi hệ thống", "Vui lòng đăng nhập lại để thực hiện.");
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
        success("Đã cập nhật tin tuyển dụng!");
      } else {
        const { error: err } = await supabase.from("job_posts").insert(payload);
        if (err) throw err;
        success("Đã tạo tin tuyển dụng mới!");
      }

      setShowCreateJob(false);
      resetForm();
      await fetchWorkspace();
    } catch (err: unknown) {
      toastError(editingJob ? "Cập nhật tin thất bại" : "Tạo tin thất bại", handleSupabaseError(err));
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
        success("Đã đăng tin tuyển dụng! Tin đã hiển thị công khai trên trang Việc làm (/jobs).");
      } else {
        success(`Đã chuyển trạng thái sang: ${ENUM_LABELS.job_post_status[status]}`);
      }
      await fetchWorkspace();
    } catch (err: unknown) {
      toastError("Cập nhật thất bại", handleSupabaseError(err));
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
      success("Đã cập nhật trạng thái đơn ứng tuyển!");
      setSelectedApp(null);
      setStageNote("");
      await fetchWorkspace();
    } catch (err: unknown) {
      toastError("Cập nhật thất bại", handleSupabaseError(err));
    } finally {
      setUpdatingApp(false);
    }
  };

  const companyJobs = jobs;
  const selectedJob = selectedJobId ? jobs.find((j) => j.id === selectedJobId) : null;
  const jobApps = selectedJobId ? applications.filter((a) => a.job_post_id === selectedJobId) : [];

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white">Bàn tuyển dụng</h1>
          {memberships.length > 0 && (
            <select
              ref={companySelectRef}
              value={selectedCompanyId}
              onChange={(e) => { setSelectedCompanyId(e.target.value); setSelectedJobId(null); setFieldErrors((p) => ({ ...p, company: false })); }}
              className={`px-3 py-2.5 bg-white dark:bg-slate-800 border rounded-xl text-sm transition-all ${fieldErrors.company ? "border-red-500 ring-2 ring-red-400" : "border-slate-200 dark:border-slate-700"}`}
            >
              {memberships.map((m) => <option key={m.company_id} value={m.company_id}>{m.company?.name || m.company_id}</option>)}
            </select>
          )}
        </div>
        {memberships.length === 0 && !loading && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl p-6 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/50 rounded-xl flex items-center justify-center text-amber-600 dark:text-amber-300 shrink-0">
                <Building2 size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white text-base">Chưa có công ty được phê duyệt</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  Nhà tuyển dụng cần hoàn tất Đăng ký Nhà tuyển dụng và được Admin duyệt thông tin công ty trước khi đăng tin tuyển dụng.
                </p>
              </div>
            </div>
            <Button onClick={() => navigate("/register-recruiter")} leftIcon={<Building2 size={15} />}>
              Đăng ký Nhà tuyển dụng
            </Button>
          </div>
        )}
        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
        {loading ? <p className="text-sm text-slate-500">Đang tải...</p> : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm">Tin tuyển dụng ({companyJobs.length})</h2>
                <button onClick={handleOpenCreateJob} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors">
                  <Plus size={13} /> Tạo tin
                </button>
              </div>
              <AnimatePresence>
                {showCreateJob && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-indigo-200 dark:border-indigo-800 p-5 space-y-4 shadow-sm">
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2">
                        <h3 className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                          {editingJob ? <Pencil size={14} className="text-indigo-600" /> : <Plus size={14} className="text-indigo-600" />}
                          {editingJob ? "Chỉnh sửa tin tuyển dụng" : "Tạo tin tuyển dụng mới"}
                        </h3>
                        <button onClick={() => { setShowCreateJob(false); resetForm(); }} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                          <X size={14} />
                        </button>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Tiêu đề công việc *</label>
                        <input
                          ref={titleInputRef}
                          placeholder="Ví dụ: Kỹ sư AI, Frontend Developer..."
                          value={newJob.title}
                          onChange={(e) => { setNewJob((p) => ({ ...p, title: e.target.value })); setFieldErrors((p) => ({ ...p, title: false })); }}
                          className={`w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border rounded-xl text-sm transition-all ${fieldErrors.title ? "border-red-500 ring-2 ring-red-400" : "border-slate-200 dark:border-slate-600"}`}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Mô tả công việc *</label>
                        <textarea
                          ref={descInputRef}
                          rows={3}
                          placeholder="Mô tả chi tiết công việc, nhiệm vụ chính..."
                          value={newJob.description}
                          onChange={(e) => { setNewJob((p) => ({ ...p, description: e.target.value })); setFieldErrors((p) => ({ ...p, description: false })); }}
                          className={`w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border rounded-xl text-sm resize-none transition-all ${fieldErrors.description ? "border-red-500 ring-2 ring-red-400" : "border-slate-200 dark:border-slate-600"}`}
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-purple-700 dark:text-purple-300">Yêu cầu ứng viên (AI Matching)</label>
                          <span className="text-[11px] font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/40 px-2 py-0.5 rounded-full flex items-center gap-1 border border-purple-200 dark:border-purple-800">
                            <Sparkles size={11} /> Cốt lõi cho AI Candidate Matching
                          </span>
                        </div>
                        <textarea
                          rows={4}
                          placeholder="Kỹ năng bắt buộc, kinh nghiệm, bằng cấp... (Ví dụ: Python, FastAPI, 2 năm kinh nghiệm NLP, ReactJS...)"
                          value={newJob.requirements}
                          onChange={(e) => setNewJob((p) => ({ ...p, requirements: e.target.value }))}
                          className="w-full px-3 py-2 bg-purple-50/30 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/60 rounded-xl text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Quyền lợi & Phúc lợi</label>
                        <textarea rows={2} placeholder="Chế độ bảo hiểm, thưởng năm, du lịch, hỗ trợ máy tính..." value={newJob.benefits} onChange={(e) => setNewJob((p) => ({ ...p, benefits: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm resize-none" />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Địa điểm</label>
                          <input placeholder="Hà Nội, TP.HCM..." value={newJob.location} onChange={(e) => setNewJob((p) => ({ ...p, location: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Hình thức</label>
                          <select value={newJob.employment_type} onChange={(e) => setNewJob((p) => ({ ...p, employment_type: e.target.value as EmploymentType }))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm">
                            {Object.entries(ENUM_LABELS.employment_type).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Lương tối thiểu</label>
                          <input type="number" placeholder="Ví dụ: 15000000" value={newJob.salaryMin} onChange={(e) => setNewJob((p) => ({ ...p, salaryMin: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Lương tối đa</label>
                          <input type="number" placeholder="Ví dụ: 25000000" value={newJob.salaryMax} onChange={(e) => setNewJob((p) => ({ ...p, salaryMax: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Hạn nộp</label>
                          <input type="date" value={newJob.deadline} onChange={(e) => setNewJob((p) => ({ ...p, deadline: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Tiền tệ / Trạng thái</label>
                          <div className="grid grid-cols-2 gap-1">
                            <select value={newJob.currency} onChange={(e) => setNewJob((p) => ({ ...p, currency: e.target.value }))} className="w-full px-2 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-xs">
                              <option value="VND">VND</option>
                              <option value="USD">USD</option>
                            </select>
                            <select value={newJob.status} onChange={(e) => setNewJob((p) => ({ ...p, status: e.target.value as JobPostStatus }))} className="w-full px-2 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-xs">
                              <option value="draft">Bản nháp</option>
                              <option value="published">Đang tuyển</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end pt-2 border-t border-slate-100 dark:border-slate-700">
                        <Button variant="ghost" size="xs" onClick={() => { setShowCreateJob(false); resetForm(); }}>Hủy</Button>
                        <Button size="xs" onClick={() => void handleSaveJob()} disabled={jobSaving} isLoading={jobSaving} loadingText="Đang lưu...">
                          {editingJob ? "Lưu thay đổi" : "Tạo tin"}
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {companyJobs.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center">
                  <Briefcase size={32} className="text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">Chưa có tin nào</p>
                </div>
              ) : companyJobs.map((job) => {
                const appCount = applications.filter((a) => a.job_post_id === job.id).length;
                return (
                  <motion.button
                    key={job.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedJobId(selectedJobId === job.id ? null : job.id)}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${selectedJobId === job.id ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-300"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium line-clamp-2 text-slate-900 dark:text-white">{job.title}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${JOB_STATUS_COLORS[job.status]}`}>{ENUM_LABELS.job_post_status[job.status]}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOpenEditJob(job); }}
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-200/50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                          title="Sửa tin tuyển dụng"
                        >
                          <Pencil size={12} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1"><Users size={11} />{appCount} đơn</span>
                      <span>Hạn: {formatDate(job.deadline_at)}</span>
                    </div>
                    {job.status === "published" ? (
                      <div className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center justify-between">
                        <span>✓ Đang phát hành trên /jobs</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${job.id}`); }}
                          className="hover:underline text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-0.5"
                        >
                          Xem trên /jobs ↗
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                        ⚠️ Đang ở dạng <b>{ENUM_LABELS.job_post_status[job.status]}</b>. Bấm <b>→ Đang tuyển</b> bên dưới để hiển thị lên /jobs.
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
                          → {ENUM_LABELS.job_post_status[s]}
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
                  <p className="text-slate-500 dark:text-slate-400 text-sm">Chọn một tin tuyển dụng để xem đơn ứng viên</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="p-5 border-b border-slate-100 dark:border-slate-700">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="font-semibold text-slate-900 dark:text-white">{selectedJob.title}</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{jobApps.length} đơn • {salaryRange(selectedJob)} • {selectedJob.location || "Chưa có địa điểm"}</p>
                      </div>
                      <Button size="xs" variant="outline" leftIcon={<Pencil size={12} />} onClick={() => handleOpenEditJob(selectedJob)}>
                        Sửa tin
                      </Button>
                    </div>
                    {selectedJob.requirements ? (
                      <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/60 rounded-xl">
                        <div className="flex items-center justify-between text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">
                          <span className="flex items-center gap-1.5"><Sparkles size={12} /> Yêu cầu ứng viên (AI Matching):</span>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">{selectedJob.requirements}</p>
                      </div>
                    ) : (
                      <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl flex items-center justify-between text-xs text-amber-800 dark:text-amber-300">
                        <span>⚠️ Tin này chưa có <b>Yêu cầu ứng viên</b>. Thêm yêu cầu để AI matching chính xác hơn.</span>
                        <button onClick={() => handleOpenEditJob(selectedJob)} className="underline font-semibold hover:text-amber-900 dark:hover:text-amber-200 shrink-0 ml-2">Thêm ngay</button>
                      </div>
                    )}
                  </div>
                  {jobApps.length === 0 ? (
                    <div className="p-12 text-center text-sm text-slate-500 dark:text-slate-400">Chưa có ứng viên nào nộp đơn</div>
                  ) : jobApps.map((app) => {
                    const cand = profilesMap[app.applicant_user_id];
                    const isSelected = selectedApp === app.id;
                    return (
                      <div key={app.id} className="p-4 border-b border-slate-100 dark:border-slate-700">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900 dark:text-white">{cand?.full_name || app.applicant_user_id}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{app.resume_title_snapshot || "CV"}</p>
                            {app.resume_storage_path_snapshot && (
                              <button
                                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-1"
                                onClick={() => void getResumeSignedUrl(app.resume_storage_path_snapshot!).then((url) => window.open(url, "_blank"))}
                              >
                                Mở CV
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${APP_STATUS_COLORS[app.current_status]}`}>{ENUM_LABELS.application_status[app.current_status]}</span>
                            {!TERMINAL_APP_STATUSES.includes(app.current_status) && (
                              <Button size="xs" variant="outline" onClick={() => setSelectedApp(isSelected ? null : app.id)}>Cập nhật</Button>
                            )}
                          </div>
                        </div>
                        {isSelected && (
                          <div className="mt-3 grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-700/40 p-3 rounded-xl border border-slate-200 dark:border-slate-600">
                            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as ApplicationStatus)} className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs text-slate-900 dark:text-white">
                              {(Object.keys(ENUM_LABELS.application_status) as ApplicationStatus[]).filter((s) => !TERMINAL_APP_STATUSES.includes(s) || s === "rejected").map((s) => (
                                <option key={s} value={s}>{ENUM_LABELS.application_status[s]}</option>
                              ))}
                            </select>
                            <input value={stageNote} onChange={(e) => setStageNote(e.target.value)} placeholder="Ghi chú" className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs text-slate-900 dark:text-white" />
                            <div className="col-span-2 flex justify-end gap-2">
                              <Button size="xs" variant="ghost" onClick={() => setSelectedApp(null)}>Hủy</Button>
                              <Button size="xs" leftIcon={<Check size={12} />} onClick={() => void handleAddStage(app.id)} isLoading={updatingApp} loadingText="Đang lưu...">Lưu</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AnimatedPage>
  );
}
