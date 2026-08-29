import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, AlertCircle, Briefcase } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { supabase, handleSupabaseError } from "../lib/supabase";
import { SITE_URL } from "../lib/env";
import AnimatedPage from "../components/AnimatedPage";
import GoogleIcon from "../components/GoogleIcon";

import Button from "../components/ui/Button";
import { useToast } from "../context/ToastContext";
import { useLang } from "../context/LangContext";

export default function LoginPage() {
  const { user, loading: authLoading } = useAuth();
  const { lang, t } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const { success } = useToast();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  if (authLoading) return null;
  if (user) return <Navigate to={from} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError(t.supabaseConfigError);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signErr) throw signErr;
      success(lang === "en" ? "Signed in successfully!" : "Đăng nhập thành công!");
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setError(handleSupabaseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!supabase) {
      setError(t.supabaseConfigError);
      return;
    }
    setError("");
    setGoogleLoading(true);
    try {
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${SITE_URL || window.location.origin}${from}` },
      });
      if (oauthErr) throw oauthErr;
    } catch (err: unknown) {
      setError(handleSupabaseError(err));
      setGoogleLoading(false);
    }
  };

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
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-6 mb-2">{t.welcomeBack}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{t.loginDesc}</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 border border-slate-100 dark:border-slate-700 p-8"
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t.email}</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder={t.emailPlaceholder}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.password}</label>
                <Link to="/forgot-password" className="text-xs text-indigo-600 font-medium hover:underline">
                  {t.forgotPassword}
                </Link>
              </div>
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

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-xl text-sm"
              >
                <AlertCircle size={15} /> {error}
              </motion.div>
            )}

            <Button
              type="submit"
              isLoading={loading}
              loadingText={t.loggingIn}
              fullWidth
              size="lg"
            >
              {t.loginBtn}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-700" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white dark:bg-slate-800 px-3 text-slate-400">{t.or}</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            fullWidth
            size="lg"
            leftIcon={<GoogleIcon />}
            isLoading={googleLoading}
            loadingText={t.redirectingGoogle}
            onClick={() => void handleGoogleLogin()}
          >
            {t.loginWithGoogle}
          </Button>

          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
            {t.noAccount}{" "}
            <Link to="/register" className="text-indigo-600 font-medium hover:underline">
              {t.registerNow}
            </Link>
          </p>
        </motion.div>
      </div>
    </AnimatedPage>
  );
}

