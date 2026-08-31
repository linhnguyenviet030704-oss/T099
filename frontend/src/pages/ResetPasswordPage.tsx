import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Lock, Eye, EyeOff, AlertCircle, Briefcase, CheckCircle2 } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { supabase, handleSupabaseError } from "../lib/supabase";
import AnimatedPage from "../components/AnimatedPage";
import Button from "../components/ui/Button";
import LoadingScreen from "../components/LoadingScreen";
import { useLang } from "../context/LangContext";

export default function ResetPasswordPage() {
  const { user, loading: authLoading } = useAuth();
  const { lang, t } = useLang();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (authLoading) return <LoadingScreen text={t.verifyingLink} />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError(t.supabaseConfigError);
      return;
    }
    if (password.length < 8) {
      setError(t.pwMinLengthError);
      return;
    }
    if (password !== confirmPassword) {
      setError(t.pwMismatchError);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;
      setDone(true);
      setTimeout(() => navigate("/profile", { replace: true }), 1500);
    } catch (err: unknown) {
      setError(handleSupabaseError(err));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AnimatedPage className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-indigo-50 dark:from-slate-900 dark:to-slate-800 px-4">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center max-w-sm">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} className="text-emerald-600" />
          </div>
          <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white mb-2">{t.resetPasswordSuccess}</h2>
          <p className="text-slate-500">{t.redirectingProfile}</p>
        </motion.div>
      </AnimatedPage>
    );
  }

  if (!user) {
    return (
      <AnimatedPage className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle size={28} className="text-red-500" />
          </div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white mb-2">{t.invalidResetLinkTitle}</h2>
          <p className="text-slate-500 mb-6 text-sm">{t.invalidResetLinkDesc}</p>
          <Link to="/forgot-password" className="text-indigo-600 font-medium hover:underline text-sm">
            {t.requestNewLink}
          </Link>
        </div>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 py-16 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <Briefcase size={20} className="text-white" />
            </div>
            <span className="font-display font-bold text-2xl text-slate-900 dark:text-white">
              Next<span className="text-indigo-600">Job</span>
            </span>
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-6 mb-2">{t.resetPasswordTitle}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{t.resetPasswordDesc}</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 border border-slate-100 dark:border-slate-700 p-8"
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t.newPasswordLabel}</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPw ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-11 py-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder={t.passwordPlaceholder}
                />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t.confirmPasswordLabel}</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPw ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder={t.confirmPasswordPlaceholder}
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

            <Button type="submit" isLoading={loading} loadingText={t.savingChanges} fullWidth size="lg">
              {t.resetPasswordBtn}
            </Button>
          </form>
        </motion.div>
      </div>
    </AnimatedPage>
  );
}

