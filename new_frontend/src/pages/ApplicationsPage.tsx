import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ExternalLink, ChevronDown, ChevronUp, X, MapPin, DollarSign, Search } from "lucide-react";
import { useApp } from "../context/AppContext";
import { APP_STATUS_LABELS, APP_STATUS_COLORS, formatDate, formatSalary, type AppStatus } from "../data/mockData";
import AnimatedPage, { staggerContainer, fadeUp } from "../components/AnimatedPage";
import Badge from "../components/Badge";
import ConfirmModal from "../components/ConfirmModal";

const TERMINAL_STATUSES: AppStatus[] = ["accepted", "rejected", "withdrawn"];

const STATUS_ICONS: Record<AppStatus, string> = {
  submitted: "📩",
  reviewing: "👀",
  interview: "📅",
  offer: "🎉",
  accepted: "✅",
  rejected: "❌",
  withdrawn: "↩️",
};

export default function ApplicationsPage() {
  const { currentUser, applications, jobs, companies, cvFiles, withdrawApplication } = useApp();
  const navigate = useNavigate();
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [withdrawId, setWithdrawId] = useState<string | null>(null);

  if (!currentUser) { navigate("/login"); return null; }

  const myApps = applications.filter((a) => a.candidateId === currentUser.id);

  const handleWithdraw = () => {
    if (withdrawId) { withdrawApplication(withdrawId); setWithdrawId(null); }
  };

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white mb-8">Đơn ứng tuyển của tôi</h1>

        {myApps.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-16 text-center">
            <div className="text-5xl mb-4">📋</div>
            <p className="font-medium text-slate-700 dark:text-slate-300 mb-2">Chưa có đơn ứng tuyển nào</p>
            <p className="text-sm text-slate-500 mb-6">Tìm việc và nộp đơn để theo dõi tại đây</p>
            <Link to="/jobs" className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-medium text-sm rounded-xl hover:bg-indigo-700 transition-colors">
              <Search size={15} /> Tìm việc làm
            </Link>
          </div>
        ) : (
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-4">
            {myApps.map((app) => {
              const job = jobs.find((j) => j.id === app.jobId);
              const company = job ? companies.find((c) => c.id === job.companyId) : null;
              const cv = cvFiles.find((c) => c.id === app.cvId);
              const isExpanded = expandedApp === app.id;
              const canWithdraw = !TERMINAL_STATUSES.includes(app.status);

              if (!job || !company) return null;

              return (
                <motion.div
                  key={app.id}
                  variants={fadeUp}
                  className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden"
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-700 overflow-hidden flex-shrink-0">
                          {company.logo ? (
                            <img src={company.logo} alt={company.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-sm font-bold text-indigo-600">{company.name[0]}</div>
                          )}
                        </div>
                        <div>
                          <Link to={`/jobs/${job.id}`} className="font-semibold text-slate-900 dark:text-white hover:text-indigo-600 transition-colors flex items-center gap-1">
                            {job.title} <ExternalLink size={12} />
                          </Link>
                          <p className="text-sm text-slate-600 dark:text-slate-400">{company.name}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${APP_STATUS_COLORS[app.status]}`}>
                              <span>{STATUS_ICONS[app.status]}</span>
                              {APP_STATUS_LABELS[app.status]}
                            </span>
                            <span className="text-xs text-slate-500">Nộp {formatDate(app.submittedAt)}</span>
                            {cv && <span className="text-xs text-slate-500">CV: {cv.name}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {canWithdraw && (
                          <button
                            onClick={() => setWithdrawId(app.id)}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                            title="Rút đơn"
                          >
                            <X size={15} />
                          </button>
                        )}
                        <button
                          onClick={() => setExpandedApp(isExpanded ? null : app.id)}
                          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                        >
                          {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Timeline */}
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      className="overflow-hidden border-t border-slate-100 dark:border-slate-700"
                    >
                      <div className="p-5 bg-slate-50 dark:bg-slate-700/30">
                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-4">Tiến trình đơn</p>
                        <div className="space-y-3">
                          {app.stages.map((stage, i) => (
                            <div key={i} className="flex gap-3">
                              <div className="flex flex-col items-center">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${i === app.stages.length - 1 ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40"}`}>
                                  {STATUS_ICONS[stage.status]}
                                </div>
                                {i < app.stages.length - 1 && <div className="w-px flex-1 bg-slate-200 dark:bg-slate-600 mt-1" />}
                              </div>
                              <div className="pb-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-slate-800 dark:text-white">{APP_STATUS_LABELS[stage.status]}</span>
                                  <span className="text-xs text-slate-500">{formatDate(stage.date)}</span>
                                </div>
                                {stage.note && <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{stage.note}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      <ConfirmModal
        open={!!withdrawId}
        title="Rút đơn ứng tuyển"
        message="Bạn có chắc chắn muốn rút đơn ứng tuyển này? Hành động này không thể hoàn tác."
        confirmLabel="Rút đơn"
        danger
        onConfirm={handleWithdraw}
        onCancel={() => setWithdrawId(null)}
      />
    </AnimatedPage>
  );
}
