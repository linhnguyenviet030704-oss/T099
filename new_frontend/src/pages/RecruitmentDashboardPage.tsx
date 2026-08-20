import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Users, Briefcase, Check, X } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useCurrentProfile } from "../profile/ProfileProvider";
import { supabase, handleSupabaseError } from "../lib/supabase";
import { getResumeSignedUrl } from "../lib/storage";
import type { Application, ApplicationStatus, CompanyMember, EmploymentType, JobPost, JobPostStatus, Profile } from "../types";
import { ENUM_LABELS, formatDate } from "../lib/format";
import { APP_STATUS_COLORS, JOB_STATUS_COLORS, salaryRange, TERMINAL_APP_STATUSES } from "../lib/ui";
import AnimatedPage from "../components/AnimatedPage";

export default function RecruitmentDashboardPage() {
  const { user } = useAuth();
  const { profile } = useCurrentProfile();
  const [memberships, setMemberships] = useState<CompanyMember[]>([]);
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, Profile>>({});
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showCreateJob, setShowCreateJob] = useState(false);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [stageNote, setStageNote] = useState("");
  const [newStatus, setNewStatus] = useState<ApplicationStatus>("screening");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobSaving, setJobSaving] = useState(false);
  const [newJob, setNewJob] = useState({
    title: "", description: "", requirements: "", benefits: "",
    location: "", employment_type: "full_time" as EmploymentType,
    salaryMin: "", salaryMax: "", currency: "VND", deadline: "", status: "published" as JobPostStatus,
  });

  const isAdmin = profile?.role === "admin";

  const fetchWorkspace = useCallback(async () => {
    if (!supabase || !user) return;
    try {
      setLoading(true);
      setError(null);
      let items: CompanyMember[] = [];
      if (isAdmin) {
        const { data: companiesData, error: cErr } = await supabase.from("companies").select("*").order("name");
        if (cErr) throw cErr;
        items = (companiesData || []).map((c: any) => ({
          id: `admin-${c.id}`, company_id: c.id, user_id: user.id, role: "owner", is_active: true,
          invited_by_user_id: null, created_at: c.created_at, updated_at: c.updated_at, company: c,
        }));
      } else {
        const { data: memberData, error: mErr } = await supabase
          .from("company_members")
          .select("*, companies(*)")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .in("role", ["owner", "recruiter"]);
        if (mErr) throw mErr;
        items = (memberData || []).map((m: any) => ({ ...m, company: m.companies })) as CompanyMember[];
      }
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
      let jobsQuery = supabase.from("job_posts").select("*").eq("company_id", companyId).order("updated_at", { ascending: false });
      if (!isAdmin) jobsQuery = jobsQuery.eq("created_by_user_id", user.id);
      const { data: jobsData, error: jobsErr } = await jobsQuery;
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
  }, [user, isAdmin, selectedCompanyId]);

  useEffect(() => { if (user) void fetchWorkspace(); }, [user, fetchWorkspace]);

  const handleCreateJob = async () => {
    if (!supabase || !user || !selectedCompanyId || !newJob.title.trim() || !newJob.description.trim()) return;
    setJobSaving(true);
    try {
      const { error: insErr } = await supabase.from("job_posts").insert({
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
      });
      if (insErr) throw insErr;
      setShowCreateJob(false);
      setNewJob({ title: "", description: "", requirements: "", benefits: "", location: "", employment_type: "full_time", salaryMin: "", salaryMax: "", currency: "VND", deadline: "", status: "published" });
      await fetchWorkspace();
    } catch (err: unknown) {
      alert(handleSupabaseError(err));
    } finally {
      setJobSaving(false);
    }
  };

  const handleUpdateJobStatus = async (jobId: string, status: JobPostStatus) => {
    if (!supabase) return;
    const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === "published") payload.published_at = new Date().toISOString();
    if (status === "closed") payload.closed_at = new Date().toISOString();
    const { error: uErr } = await supabase.from("job_posts").update(payload).eq("id", jobId);
    if (uErr) alert(handleSupabaseError(uErr));
    else await fetchWorkspace();
  };

  const handleAddStage = async (appId: string) => {
    if (!supabase || !user) return;
    const { error: sErr } = await supabase.from("application_stages").insert({
      application_id: appId,
      changed_by_user_id: user.id,
      stage: newStatus,
      note: stageNote.trim() || null,
      is_system_generated: false,
    });
    if (sErr) alert(handleSupabaseError(sErr));
    else {
      setSelectedApp(null);
      setStageNote("");
      await fetchWorkspace();
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
          <select
            value={selectedCompanyId}
            onChange={(e) => { setSelectedCompanyId(e.target.value); setSelectedJobId(null); }}
            className="px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
          >
            {memberships.map((m) => <option key={m.company_id} value={m.company_id}>{m.company?.name || m.company_id}</option>)}
          </select>
        </div>
        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
        {loading ? <p className="text-sm text-slate-500">Đang tải...</p> : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm">Tin tuyển dụng ({companyJobs.length})</h2>
                <button onClick={() => setShowCreateJob((v) => !v)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-xl">
                  <Plus size={13} /> Tạo tin
                </button>
              </div>
              <AnimatePresence>
                {showCreateJob && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-indigo-200 p-5 space-y-3">
                      <input placeholder="Tiêu đề *" value={newJob.title} onChange={(e) => setNewJob((p) => ({ ...p, title: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm" />
                      <textarea rows={3} placeholder="Mô tả công việc *" value={newJob.description} onChange={(e) => setNewJob((p) => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none" />
                      <div className="grid grid-cols-2 gap-2">
                        <input placeholder="Địa điểm" value={newJob.location} onChange={(e) => setNewJob((p) => ({ ...p, location: e.target.value }))} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm" />
                        <select value={newJob.employment_type} onChange={(e) => setNewJob((p) => ({ ...p, employment_type: e.target.value as EmploymentType }))} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm">
                          {Object.entries(ENUM_LABELS.employment_type).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <input type="date" value={newJob.deadline} onChange={(e) => setNewJob((p) => ({ ...p, deadline: e.target.value }))} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm" />
                        <select value={newJob.status} onChange={(e) => setNewJob((p) => ({ ...p, status: e.target.value as JobPostStatus }))} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm">
                          <option value="draft">Bản nháp</option>
                          <option value="published">Đang tuyển</option>
                        </select>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setShowCreateJob(false)} className="px-3 py-1.5 text-xs">Hủy</button>
                        <button onClick={() => void handleCreateJob()} disabled={jobSaving || !newJob.title || !newJob.description} className="px-4 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-xl disabled:opacity-60">
                          {jobSaving ? "Đang tạo..." : "Tạo tin"}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {companyJobs.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border p-8 text-center">
                  <Briefcase size={32} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">Chưa có tin nào</p>
                </div>
              ) : companyJobs.map((job) => {
                const appCount = applications.filter((a) => a.job_post_id === job.id).length;
                return (
                  <button
                    key={job.id}
                    onClick={() => setSelectedJobId(selectedJobId === job.id ? null : job.id)}
                    className={`w-full text-left p-4 rounded-xl border ${selectedJobId === job.id ? "bg-indigo-50 border-indigo-200" : "bg-white dark:bg-slate-800 border-slate-200"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium line-clamp-2">{job.title}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${JOB_STATUS_COLORS[job.status]}`}>{ENUM_LABELS.job_post_status[job.status]}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Users size={11} />{appCount} đơn</span>
                      <span>Hạn: {formatDate(job.deadline_at)}</span>
                    </div>
                    <div className="flex gap-1 mt-2">
                      {(["published", "closed", "archived"] as JobPostStatus[]).filter((s) => s !== job.status).map((s) => (
                        <span
                          key={s}
                          onClick={(e) => { e.stopPropagation(); void handleUpdateJobStatus(job.id, s); }}
                          className="text-xs px-2 py-0.5 bg-slate-100 rounded-full"
                        >
                          → {ENUM_LABELS.job_post_status[s]}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="lg:col-span-2">
              {!selectedJob ? (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border p-12 text-center h-full flex flex-col items-center justify-center">
                  <Briefcase size={48} className="text-slate-200 mb-4" />
                  <p className="text-slate-500 text-sm">Chọn một tin tuyển dụng để xem đơn ứng viên</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border overflow-hidden">
                  <div className="p-5 border-b border-slate-100">
                    <h2 className="font-semibold">{selectedJob.title}</h2>
                    <p className="text-xs text-slate-500 mt-1">{jobApps.length} đơn • {salaryRange(selectedJob)} • {selectedJob.location}</p>
                  </div>
                  {jobApps.length === 0 ? (
                    <div className="p-12 text-center text-sm text-slate-500">Chưa có ứng viên nào nộp đơn</div>
                  ) : jobApps.map((app) => {
                    const cand = profilesMap[app.applicant_user_id];
                    const isSelected = selectedApp === app.id;
                    return (
                      <div key={app.id} className="p-4 border-b border-slate-100">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{cand?.full_name || app.applicant_user_id}</p>
                            <p className="text-xs text-slate-500">{app.resume_title_snapshot || "CV"}</p>
                            {app.resume_storage_path_snapshot && (
                              <button
                                className="text-xs text-indigo-600 mt-1"
                                onClick={() => void getResumeSignedUrl(app.resume_storage_path_snapshot!).then((url) => window.open(url, "_blank"))}
                              >
                                Mở CV
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2.5 py-1 rounded-full ${APP_STATUS_COLORS[app.current_status]}`}>{ENUM_LABELS.application_status[app.current_status]}</span>
                            {!TERMINAL_APP_STATUSES.includes(app.current_status) && (
                              <button onClick={() => setSelectedApp(isSelected ? null : app.id)} className="text-xs px-2 py-1 bg-slate-100 rounded-lg">Cập nhật</button>
                            )}
                          </div>
                        </div>
                        {isSelected && (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as ApplicationStatus)} className="px-3 py-2 bg-slate-50 border rounded-xl text-xs">
                              {(Object.keys(ENUM_LABELS.application_status) as ApplicationStatus[]).filter((s) => !TERMINAL_APP_STATUSES.includes(s) || s === "rejected").map((s) => (
                                <option key={s} value={s}>{ENUM_LABELS.application_status[s]}</option>
                              ))}
                            </select>
                            <input value={stageNote} onChange={(e) => setStageNote(e.target.value)} placeholder="Ghi chú" className="px-3 py-2 bg-slate-50 border rounded-xl text-xs" />
                            <div className="col-span-2 flex justify-end gap-2">
                              <button onClick={() => setSelectedApp(null)} className="p-1.5"><X size={12} /></button>
                              <button onClick={() => void handleAddStage(app.id)} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-xl"><Check size={12} /> Lưu</button>
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
