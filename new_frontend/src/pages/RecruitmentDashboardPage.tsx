import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ChevronDown, Users, Briefcase, Eye, Globe, Edit2, Check, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { JOB_TYPE_LABELS, APP_STATUS_LABELS, APP_STATUS_COLORS, type AppStatus, type JobStatus, formatDate, formatSalary } from "../data/mockData";
import AnimatedPage, { staggerContainer, fadeUp } from "../components/AnimatedPage";
import Badge from "../components/Badge";

const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Bản nháp", active: "Đang tuyển", closed: "Đã đóng", archived: "Lưu trữ",
};

const JOB_STATUS_COLORS: Record<JobStatus, string> = {
  draft: "bg-slate-100 text-slate-600", active: "bg-emerald-100 text-emerald-700",
  closed: "bg-red-100 text-red-600", archived: "bg-slate-100 text-slate-500",
};

const TERMINAL_APP_STATUSES: AppStatus[] = ["accepted", "rejected", "withdrawn"];

export default function RecruitmentDashboardPage() {
  const { currentUser, jobs, companies, applications, cvFiles, updateApplicationStatus, updateJobStatus, createJob } = useApp();
  const navigate = useNavigate();

  const [selectedCompanyId, setSelectedCompanyId] = useState(companies[0]?.id || "");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showCreateJob, setShowCreateJob] = useState(false);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [stageNote, setStageNote] = useState("");
  const [newStatus, setNewStatus] = useState<AppStatus>("reviewing");
  const [editSocial, setEditSocial] = useState<{ field: string; value: string } | null>(null);

  const [newJob, setNewJob] = useState({
    title: "", description: "", requirements: "", benefits: "",
    location: "", type: "full-time" as any, salaryMin: "", salaryMax: "",
    currency: "VND", deadline: "", status: "draft" as JobStatus, companyId: "",
  });
  const [creatingJob, setCreatingJob] = useState(false);

  if (!currentUser || (currentUser.role !== "recruiter" && currentUser.role !== "admin")) {
    navigate("/");
    return null;
  }

  const myCompany = companies.find((c) => c.id === selectedCompanyId);
  const companyJobs = jobs.filter((j) =>
    j.companyId === selectedCompanyId && (currentUser.role === "admin" || j.recruiterId === currentUser.id)
  );
  const selectedJob = selectedJobId ? jobs.find((j) => j.id === selectedJobId) : null;
  const jobApps = selectedJobId ? applications.filter((a) => a.jobId === selectedJobId) : [];

  const handleCreateJob = async () => {
    if (!newJob.title || !newJob.description) return;
    setCreatingJob(true);
    await new Promise((r) => setTimeout(r, 600));
    createJob({
      ...newJob,
      companyId: selectedCompanyId,
      salaryMin: newJob.salaryMin ? Number(newJob.salaryMin) : undefined,
      salaryMax: newJob.salaryMax ? Number(newJob.salaryMax) : undefined,
    });
    setCreatingJob(false);
    setShowCreateJob(false);
    setNewJob({ title: "", description: "", requirements: "", benefits: "", location: "", type: "full-time", salaryMin: "", salaryMax: "", currency: "VND", deadline: "", status: "draft", companyId: "" });
  };

  const handleUpdateApp = (appId: string) => {
    updateApplicationStatus(appId, newStatus, stageNote);
    setSelectedApp(null);
    setStageNote("");
  };

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white">Bàn tuyển dụng</h1>
          <div className="flex items-center gap-3">
            <select
              value={selectedCompanyId}
              onChange={(e) => { setSelectedCompanyId(e.target.value); setSelectedJobId(null); }}
              className="px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Job list */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-800 dark:text-white text-sm">Tin tuyển dụng ({companyJobs.length})</h2>
              <button
                onClick={() => setShowCreateJob((v) => !v)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors"
              >
                <Plus size={13} /> Tạo tin
              </button>
            </div>

            {/* Create job form */}
            <AnimatePresence>
              {showCreateJob && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-indigo-200 dark:border-indigo-800 p-5 space-y-3">
                    <input
                      placeholder="Tiêu đề *"
                      value={newJob.title}
                      onChange={(e) => setNewJob((p) => ({ ...p, title: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <textarea
                      rows={3}
                      placeholder="Mô tả công việc *"
                      value={newJob.description}
                      onChange={(e) => setNewJob((p) => ({ ...p, description: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input placeholder="Địa điểm" value={newJob.location} onChange={(e) => setNewJob((p) => ({ ...p, location: e.target.value }))} className="px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      <select value={newJob.type} onChange={(e) => setNewJob((p) => ({ ...p, type: e.target.value as any }))} className="px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        {Object.entries(JOB_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <input type="date" value={newJob.deadline} onChange={(e) => setNewJob((p) => ({ ...p, deadline: e.target.value }))} className="px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      <select value={newJob.status} onChange={(e) => setNewJob((p) => ({ ...p, status: e.target.value as JobStatus }))} className="px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <option value="draft">Bản nháp</option>
                        <option value="active">Đang tuyển</option>
                      </select>
                    </div>
                    <div className="flex gap-2 justify-end pt-1">
                      <button onClick={() => setShowCreateJob(false)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl">Hủy</button>
                      <button onClick={handleCreateJob} disabled={creatingJob || !newJob.title || !newJob.description} className="px-4 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl transition-colors">
                        {creatingJob ? "Đang tạo..." : "Tạo tin"}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {companyJobs.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center">
                <Briefcase size={32} className="text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">Chưa có tin nào</p>
              </div>
            ) : (
              <div className="space-y-2">
                {companyJobs.map((job) => {
                  const appCount = applications.filter((a) => a.jobId === job.id).length;
                  return (
                    <motion.button
                      key={job.id}
                      whileHover={{ x: 2 }}
                      onClick={() => setSelectedJobId(selectedJobId === job.id ? null : job.id)}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${selectedJobId === job.id ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-200"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-slate-800 dark:text-white line-clamp-2">{job.title}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${JOB_STATUS_COLORS[job.status]}`}>{JOB_STATUS_LABELS[job.status]}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="flex items-center gap-1 text-xs text-slate-500"><Users size={11} />{appCount} đơn</span>
                        <span className="text-xs text-slate-400">Hạn: {formatDate(job.deadline)}</span>
                      </div>
                      <div className="flex gap-1 mt-2">
                        {(["active", "closed", "archived"] as JobStatus[]).filter((s) => s !== job.status).map((s) => (
                          <button
                            key={s}
                            onClick={(e) => { e.stopPropagation(); updateJobStatus(job.id, s); }}
                            className="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-full hover:bg-slate-200 transition-colors"
                          >
                            → {JOB_STATUS_LABELS[s]}
                          </button>
                        ))}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Applications */}
          <div className="lg:col-span-2">
            {!selectedJob ? (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center h-full flex flex-col items-center justify-center">
                <Briefcase size={48} className="text-slate-200 dark:text-slate-700 mb-4" />
                <p className="text-slate-500 text-sm">Chọn một tin tuyển dụng để xem đơn ứng viên</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 dark:border-slate-700">
                  <h2 className="font-semibold text-slate-800 dark:text-white">{selectedJob.title}</h2>
                  <p className="text-xs text-slate-500 mt-1">{jobApps.length} đơn ứng tuyển • {formatSalary(selectedJob)} • {selectedJob.location}</p>
                </div>

                {jobApps.length === 0 ? (
                  <div className="p-12 text-center">
                    <Users size={36} className="text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">Chưa có ứng viên nào nộp đơn</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {jobApps.map((app) => {
                      const cv = cvFiles.find((c) => c.id === app.cvId);
                      const isSelected = selectedApp === app.id;
                      return (
                        <div key={app.id} className={`p-4 transition-colors ${isSelected ? "bg-indigo-50 dark:bg-indigo-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-700/30"}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                                {app.candidateId[0].toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-slate-800 dark:text-white">{app.candidateId}</p>
                                <p className="text-xs text-slate-500">{cv?.name || "Không có CV"}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${APP_STATUS_COLORS[app.status]}`}>
                                {APP_STATUS_LABELS[app.status]}
                              </span>
                              {!TERMINAL_APP_STATUSES.includes(app.status) && (
                                <button
                                  onClick={() => setSelectedApp(isSelected ? null : app.id)}
                                  className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-200 transition-colors flex items-center gap-1"
                                >
                                  <Edit2 size={11} /> Cập nhật
                                </button>
                              )}
                            </div>
                          </div>

                          <AnimatePresence>
                            {isSelected && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden mt-3"
                              >
                                <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-indigo-100 dark:border-indigo-800 space-y-3">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Trạng thái mới</label>
                                      <select
                                        value={newStatus}
                                        onChange={(e) => setNewStatus(e.target.value as AppStatus)}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                      >
                                        {(Object.keys(APP_STATUS_LABELS) as AppStatus[]).filter((s) => !TERMINAL_APP_STATUSES.includes(s)).map((s) => (
                                          <option key={s} value={s}>{APP_STATUS_LABELS[s]}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Ghi chú</label>
                                      <input
                                        type="text"
                                        value={stageNote}
                                        onChange={(e) => setStageNote(e.target.value)}
                                        placeholder="Ghi chú (tùy chọn)"
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                      />
                                    </div>
                                  </div>
                                  <div className="flex justify-end gap-2">
                                    <button onClick={() => setSelectedApp(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"><X size={12} /></button>
                                    <button onClick={() => handleUpdateApp(app.id)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors">
                                      <Check size={12} /> Lưu
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AnimatedPage>
  );
}
