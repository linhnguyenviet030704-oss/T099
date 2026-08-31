import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, AlertCircle, User, Briefcase, CheckCircle2 } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { supabase, handleSupabaseError } from "../lib/supabase";
import { SITE_URL } from "../lib/env";
import AnimatedPage from "../components/AnimatedPage";
import GoogleIcon from "../components/GoogleIcon";
import Button from "../components/ui/Button";
import { useLang } from "../context/LangContext";

export default function RegisterPage() {
  const { user, loading: authLoading } = useAuth();
  const { lang, t } = useLang();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<"session" | "confirm" | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  if (authLoading) return null;
  if (user && !success) return <Navigate to="/profile" replace />;

  const handleGoogleRegister = async () => {
    if (!supabase) {
      setError(t.supabaseConfigError);
      return;
    }
    setError("");
    setGoogleLoading(true);
    try {
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${SITE_URL || window.location.origin}/profile` },
      });
      if (oauthErr) throw oauthErr;
    } catch (err: unknown) {
      setError(handleSupabaseError(err));
      setGoogleLoading(false);
    }
  };

  const handleChange = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!supabase) {
      setError(t.supabaseConfigError);
      return;
    }
    if (form.password.length < 8) {
      setError(t.pwMinLengthError);
      return;
    }
    setLoading(true);
    try {
      const { data, error: registerErr } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: { full_name: form.name.trim() },
          emailRedirectTo: `${SITE_URL || window.location.origin}/profile`,
        },
      });
      if (registerErr) throw registerErr;
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        const { error: resendErr } = await supabase.auth.resend({
          type: "signup",
          email: form.email.trim(),
          options: {
            emailRedirectTo: `${SITE_URL || window.location.origin}/profile`,
          },
        });
        if (resendErr) throw resendErr;
        setSuccess("confirm");
        setForm((p) => ({ ...p, password: "" }));
        return;
      }
      if (data.session) {
        setSuccess("session");
        setTimeout(() => navigate("/profile", { replace: true }), 1500);
      } else {
        setSuccess("confirm");
        setForm((p) => ({ ...p, password: "" }));
      }
    } catch (err: unknown) {
      setError(handleSupabaseError(err));
    } finally {
      setLoading(false);
    }
  };

  const pwStrength = form.password.length === 0 ? 0 : form.password.length < 8 ? 1 : form.password.length < 12 ? 2 : 3;
  const pwColors = ["", "bg-red-400", "bg-amber-400", "bg-emerald-500"];
  const pwLabels = ["", t.pwWeak, t.pwMedium, t.pwStrong];

  if (success) {
    return (
      <AnimatedPage className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-indigo-50 dark:from-slate-900 dark:to-slate-800 px-4">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center max-w-sm">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} className="text-emerald-600" />
          </div>
          <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white mb-2">
            {success === "session" ? t.registerSuccess : t.checkEmailTitle}
          </h2>
          <p className="text-slate-500">
            {success === "session" ? t.redirectingProfile : t.checkEmailDesc}
          </p>
        </motion.div>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 py-16 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <Briefcase size={20} className="text-white" />
            </div>
            <span className="font-display font-bold text-2xl text-slate-900 dark:text-white">Next<span className="text-indigo-600">Job</span></span>
          </Link>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-6 mb-2">{t.createAccount}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{t.registerDesc}</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 border border-slate-100 dark:border-slate-700 p-8"
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t.fullName}</label>
              <div className="relative">
                <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={handleChange("name")}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={t.fullNamePlaceholder}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t.email}</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={handleChange("email")}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={t.emailPlaceholder}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t.password}</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPw ? "text" : "password"}
                  required
                  value={form.password}
                  onChange={handleChange("password")}
                  className="w-full pl-10 pr-11 py-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={t.passwordPlaceholder}
                />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {form.password.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 flex gap-1">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= pwStrength ? pwColors[pwStrength] : "bg-slate-200"}`} />
                    ))}
                  </div>
                  <span className="text-xs text-slate-500">{pwLabels[pwStrength]}</span>
                </div>
              )}
            </div>
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-xl text-sm">
                <AlertCircle size={15} /> {error}
              </div>
            )}
            <Button
              type="submit"
              isLoading={loading}
              loadingText={t.registering}
              fullWidth
              size="lg"
            >
              {t.registerBtn}
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
            onClick={() => void handleGoogleRegister()}
          >
            {t.registerWithGoogle}
          </Button>

          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
            {t.hasAccount}{" "}
            <Link to="/login" className="text-indigo-600 font-medium hover:underline">{t.loginLink}</Link>
          </p>
        </motion.div>
      </div>
    </AnimatedPage>
  );
}

