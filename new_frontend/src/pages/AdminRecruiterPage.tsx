import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, CheckCircle, XCircle, Clock, Check, X } from "lucide-react";
import { useApp } from "../context/AppContext";
import { RECRUITER_APP_STATUS_LABELS, formatDate } from "../data/mockData";
import AnimatedPage, { staggerContainer, fadeUp } from "../components/AnimatedPage";
import Badge from "../components/Badge";

type TabType = "pending" | "approved" | "rejected";

export default function AdminRecruiterPage() {
  const { currentUser, recruiterApplications, users, updateRecruiterApplication } = useApp();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>("pending");
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  if (!currentUser || currentUser.role !== "admin") { navigate("/"); return null; }

  const filtered = recruiterApplications.filter((a) => {
    if (a.status !== activeTab) return false;
    const u = users.find((u) => u.id === a.userId);
    const q = search.toLowerCase();
    if (q && !a.companyName.toLowerCase().includes(q) && !u?.email.toLowerCase().includes(q) && !u?.name.toLowerCase().includes(q)) return false;
    return true;
  });

  const counts = {
    pending: recruiterApplications.filter((a) => a.status === "pending").length,
    approved: recruiterApplications.filter((a) => a.status === "approved").length,
    rejected: recruiterApplications.filter((a) => a.status === "rejected").length,
  };

  const handleAction = async (id: string, action: "approved" | "rejected") => {
    if (action === "rejected" && !notes[id]?.trim()) return;
    setProcessing(id);
    await new Promise((r) => setTimeout(r, 600));
    updateRecruiterApplication(id, action, notes[id]);
    setProcessing(null);
  };

  const tabs = [
    { key: "pending" as const, label: "Chờ duyệt", icon: Clock, color: "text-amber-600", badgeColor: "bg-amber-100 text-amber-700" },
    { key: "approved" as const, label: "Đã phê duyệt", icon: CheckCircle, color: "text-emerald-600", badgeColor: "bg-emerald-100 text-emerald-700" },
    { key: "rejected" as const, label: "Đã từ chối", icon: XCircle, color: "text-red-500", badgeColor: "bg-red-100 text-red-700" },
  ];

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white mb-2">Duyệt đăng ký Recruiter</h1>
        <p className="text-slate-500 dark:text-slate-400 mb-8 text-sm">Xem xét và phê duyệt đơn đăng ký nhà tuyển dụng</p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {tabs.map((tab) => (
            <div key={tab.key} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 text-center">
              <tab.icon size={20} className={`${tab.color} mx-auto mb-1`} />
              <p className="font-display text-2xl font-bold text-slate-900 dark:text-white">{counts[tab.key]}</p>
              <p className="text-xs text-slate-500">{tab.label}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo công ty, email, người nộp..."
            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                  : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-indigo-300"
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
              {counts[tab.key] > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? "bg-white/20" : tab.badgeColor}`}>
                  {counts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Applications */}
        {filtered.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center">
            <p className="text-slate-500 text-sm">Không có đơn nào trong danh mục này</p>
          </div>
        ) : (
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-4">
            {filtered.map((app) => {
              const user = users.find((u) => u.id === app.userId);
              return (
                <motion.div
                  key={app.id}
                  variants={fadeUp}
                  className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6"
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-slate-800 dark:text-white">{app.companyName}</h3>
                        {app.status !== "pending" && (
                          <Badge variant={app.status === "approved" ? "success" : "danger"}>
                            {RECRUITER_APP_STATUS_LABELS[app.status]}
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {app.companyEmail && <p>Email: {app.companyEmail}</p>}
                        {app.website && <p>Website: <a href={app.website} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{app.website}</a></p>}
                        {app.licenseUrl && <p>GPKD: <a href={app.licenseUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Xem tài liệu</a></p>}
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <p className="font-medium text-slate-700 dark:text-slate-300">{user?.name}</p>
                      <p>{user?.email}</p>
                      <p className="mt-1">Nộp: {formatDate(app.submittedAt)}</p>
                    </div>
                  </div>

                  {app.status === "pending" && (
                    <div className="space-y-3 border-t border-slate-100 dark:border-slate-700 pt-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                          Ghi chú Admin (bắt buộc nếu từ chối)
                        </label>
                        <input
                          type="text"
                          value={notes[app.id] || ""}
                          onChange={(e) => setNotes((p) => ({ ...p, [app.id]: e.target.value }))}
                          placeholder="Nhập ghi chú..."
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="flex gap-2">
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={() => handleAction(app.id, "rejected")}
                          disabled={processing === app.id || !notes[app.id]?.trim()}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                        >
                          <X size={14} /> Từ chối
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={() => handleAction(app.id, "approved")}
                          disabled={processing === app.id}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
                        >
                          {processing === app.id ? "Đang xử lý..." : <><Check size={14} /> Phê duyệt</>}
                        </motion.button>
                      </div>
                    </div>
                  )}

                  {app.status === "rejected" && app.adminNote && (
                    <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800">
                      <p className="text-xs text-red-600 dark:text-red-400"><span className="font-medium">Lý do từ chối:</span> {app.adminNote}</p>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
    </AnimatedPage>
  );
}
