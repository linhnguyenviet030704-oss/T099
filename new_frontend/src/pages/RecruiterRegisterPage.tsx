import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Building2, Mail, Globe, FileText, AlertCircle, CheckCircle2, Clock, XCircle, LayoutDashboard } from "lucide-react";
import { useApp } from "../context/AppContext";
import AnimatedPage from "../components/AnimatedPage";
import Badge from "../components/Badge";

export default function RecruiterRegisterPage() {
  const { currentUser, recruiterApplications, submitRecruiterApplication } = useApp();
  const navigate = useNavigate();

  const [form, setForm] = useState({ companyName: "", companyEmail: "", website: "", licenseUrl: "" });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  if (!currentUser) { navigate("/login"); return null; }
  if (currentUser.role === "recruiter" || currentUser.role === "admin") {
    return (
      <AnimatedPage className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-900 px-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-10 text-center max-w-sm">
          <LayoutDashboard size={40} className="text-emerald-500 mx-auto mb-3" />
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white mb-2">Bạn đã là Nhà tuyển dụng</h2>
          <p className="text-slate-500 text-sm mb-5">Truy cập Bàn tuyển dụng để quản lý tin đăng và đơn ứng viên.</p>
          <Link to="/dashboard" className="block w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-colors">
            Đến Bàn tuyển dụng
          </Link>
        </div>
      </AnimatedPage>
    );
  }

  const myApp = recruiterApplications.find((a) => a.userId === currentUser.id);

  const handleChange = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyName.trim()) { setError("Tên công ty là bắt buộc."); return; }
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 800));
    submitRecruiterApplication(form);
    setSubmitting(false);
    setSuccess(true);
  };

  // Show existing application
  if (myApp && !success) {
    const statusConfig = {
      pending: { icon: Clock, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-900/20", label: "Chờ duyệt" },
      approved: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20", label: "Đã phê duyệt" },
      rejected: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/20", label: "Đã từ chối" },
    }[myApp.status];

    return (
      <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center px-4">
        <div className="w-full max-w-lg">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-8">
            <div className={`flex items-center gap-3 p-4 rounded-xl ${statusConfig.bg} mb-6`}>
              <statusConfig.icon size={22} className={statusConfig.color} />
              <div>
                <p className="font-semibold text-slate-800 dark:text-white">Trạng thái: {statusConfig.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">Nộp ngày {myApp.submittedAt}</p>
              </div>
            </div>

            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white mb-4">
              {myApp.status === "pending" ? "Đơn đăng ký đang chờ xét duyệt" : `Đơn đăng ký Nhà tuyển dụng`}
            </h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Tên công ty</span>
                <span className="font-medium text-slate-900 dark:text-white">{myApp.companyName}</span>
              </div>
              {myApp.companyEmail && (
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Email công ty</span>
                  <span className="font-medium text-slate-900 dark:text-white">{myApp.companyEmail}</span>
                </div>
              )}
              {myApp.website && (
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Website</span>
                  <a href={myApp.website} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{myApp.website}</a>
                </div>
              )}
            </div>

            {myApp.status === "rejected" && myApp.adminNote && (
              <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800">
                <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Ghi chú từ Admin:</p>
                <p className="text-sm text-red-600 dark:text-red-300">{myApp.adminNote}</p>
              </div>
            )}
          </div>
        </div>
      </AnimatedPage>
    );
  }

  if (success) {
    return (
      <AnimatedPage className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, delay: 0.1 }}>
            <CheckCircle2 size={56} className="text-emerald-500 mx-auto mb-4" />
          </motion.div>
          <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white mb-2">Đã gửi đơn!</h2>
          <p className="text-slate-500 mb-6">Admin sẽ xem xét và phản hồi trong vòng 1-2 ngày làm việc.</p>
          <Link to="/" className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-colors">
            Về trang chủ
          </Link>
        </motion.div>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-12">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-orange-400 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-200">
            <Building2 size={26} className="text-white" />
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white mb-2">Đăng ký Nhà tuyển dụng</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Điền thông tin công ty để được phê duyệt bởi Admin</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-8"
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Tên công ty <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Building2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  value={form.companyName}
                  onChange={handleChange("companyName")}
                  placeholder="Tên công ty của bạn"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email công ty</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={form.companyEmail}
                  onChange={handleChange("companyEmail")}
                  placeholder="hr@company.com"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Website công ty</label>
              <div className="relative">
                <Globe size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="url"
                  value={form.website}
                  onChange={handleChange("website")}
                  placeholder="https://company.com"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Đường dẫn giấy phép kinh doanh</label>
              <div className="relative">
                <FileText size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="url"
                  value={form.licenseUrl}
                  onChange={handleChange("licenseUrl")}
                  placeholder="https://..."
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-xl text-sm">
                <AlertCircle size={15} /> {error}
              </div>
            )}

            <motion.button
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-orange-200"
            >
              {submitting ? "Đang gửi..." : "Gửi đơn đăng ký"}
            </motion.button>
          </form>
        </motion.div>
      </div>
    </AnimatedPage>
  );
}
