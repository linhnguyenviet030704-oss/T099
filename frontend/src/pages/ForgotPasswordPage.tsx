import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, AlertCircle, Briefcase, CheckCircle2, ArrowLeft } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { supabase, handleSupabaseError } from "../lib/supabase";
import { SITE_URL } from "../lib/env";
import AnimatedPage from "../components/AnimatedPage";
import Button from "../components/ui/Button";

export default function ForgotPasswordPage() {
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  if (authLoading) return null;
  if (user) return <Navigate to="/profile" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError("Hệ thống Supabase chưa được cấu hình.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${SITE_URL || window.location.origin}/reset-password`,
      });
      if (resetErr) throw resetErr;
      setSent(true);
    } catch (err: unknown) {
      setError(handleSupabaseError(err));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AnimatedPage className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-indigo-50 dark:from-slate-900 dark:to-slate-800 px-4">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center max-w-sm">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} className="text-emerald-600" />
          </div>
          <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white mb-2">Kiểm tra email</h2>
          <p className="text-slate-500 mb-6">
            Nếu <span className="font-medium text-slate-700 dark:text-slate-300">{email.trim()}</span> tồn tại trong hệ thống, chúng tôi đã gửi một liên kết để đặt lại mật khẩu.
          </p>
          <Link to="/login" className="text-indigo-600 font-medium hover:underline text-sm">
            Quay lại đăng nhập
          </Link>
        </motion.div>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 py-16 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 group">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <Briefcase size={20} className="text-white" />
            </div>
            <span className="font-display font-bold text-2xl text-slate-900 dark:text-white">
              Next<span className="text-indigo-600">Job</span>
            </span>
          </Link>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-6 mb-2">Quên mật khẩu?</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Nhập email để nhận liên kết đặt lại mật khẩu</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 border border-slate-100 dark:border-slate-700 p-8"
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="ten@email.com"
                />
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-xl text-sm"
              >
                <AlertCircle size={15} /> {error}
              </motion.div>
            )}

            <Button type="submit" isLoading={loading} loadingText="Đang gửi..." fullWidth size="lg">
              Gửi liên kết đặt lại
            </Button>
          </form>

          <Link to="/login" className="mt-6 flex items-center justify-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-indigo-600 transition-colors">
            <ArrowLeft size={14} /> Quay lại đăng nhập
          </Link>
        </motion.div>
      </div>
    </AnimatedPage>
  );
}
