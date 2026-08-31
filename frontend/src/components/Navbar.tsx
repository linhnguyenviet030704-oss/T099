import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase, User, FileText, BookOpen, LogOut, Sun, Moon,
  Menu, X, ChevronDown, Star, LayoutDashboard, Shield, GitBranch, MessageSquareCode, Compass,
} from "lucide-react";
import { NotificationBell } from "./notifications/NotificationBell";
import { useTheme } from "../context/AppContext";
import { useLang } from "../context/LangContext";
import { useAuth } from "../auth/AuthProvider";
import { useCurrentProfile } from "../profile/ProfileProvider";
import { getEnumLabels } from "../lib/format";

export default function Navbar() {
  const { darkMode, toggleDarkMode } = useTheme();
  const { lang, t, toggleLang } = useLang();
  const { user, signOut } = useAuth();
  const { profile, isRecruiter, isAdmin } = useCurrentProfile();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname === path || location.pathname.startsWith(path + "/");

  const handleLogout = async () => {
    await signOut();
    navigate("/");
    setMobileOpen(false);
    setProfileOpen(false);
  };

  const role = profile?.role || "candidate";
  const displayName = profile?.full_name || user?.email || t.account;
  const displayEmail = profile?.email || user?.email || "";
  const isCandidate = role === "candidate";

  const navLinks = [
    { label: t.home, href: "/", always: true },
    { label: t.jobs, href: "/jobs", always: true },
    { label: t.repoEvaluation || (lang === "en" ? "Repo Evaluation" : "Đánh giá Repo"), href: "/repo-evaluation", always: true },
    { label: t.aiSuggestions, href: "/ai-suggestions", candidate: true },
    { label: t.cvAssessment || (lang === "en" ? "CV Assessment" : "Đánh giá CV"), href: "/cv-assessment", candidate: true },
    { label: t.aiCandidates, href: "/ai-candidates", recruiter: true },
    { label: t.aiInterview || (lang === "en" ? "AI Interview" : "Phỏng vấn AI"), href: "/ai-interview", recruiter: true },
    { label: t.dashboard, href: "/dashboard", recruiter: true },
    { label: t.adminMenu, href: "/admin", admin: true },
    { label: t.contact || (lang === "en" ? "Contact" : "Liên hệ"), href: "/contact", always: true },
  ];

  const userLinks = [
    { label: t.profile, href: "/profile", icon: User, always: true },
    { label: t.repoEvaluation || (lang === "en" ? "Repo Evaluation" : "Đánh giá Repo"), href: "/repo-evaluation", icon: GitBranch, always: true },
    { label: t.cvVault, href: "/cv-vault", icon: FileText, candidate: true },
    { label: t.cvAssessment || (lang === "en" ? "CV Assessment" : "Đánh giá CV"), href: "/cv-assessment", icon: Compass, candidate: true },
    { label: t.applications, href: "/applications", icon: BookOpen, candidate: true },
    { label: t.recruiterRegister, href: "/recruiter-register", icon: Star, candidate: true },
    { label: t.aiInterview || (lang === "en" ? "AI Interview" : "Phỏng vấn AI"), href: "/ai-interview", icon: MessageSquareCode, recruiter: true },
    { label: t.dashboard, href: "/dashboard", icon: LayoutDashboard, recruiter: true },
    { label: t.adminMenu, href: "/admin", icon: Shield, admin: true },
    { label: t.contact || (lang === "en" ? "Contact" : "Liên hệ"), href: "/contact", icon: MessageSquareCode, always: true },
  ];

  const visibleNavLinks = navLinks.filter((l) => {
    if (l.always) return true;
    if (!user) return false;
    if (l.candidate) return isCandidate;
    if (l.recruiter) return isRecruiter;
    if (l.admin) return isAdmin;
    return false;
  });

  const visibleUserLinks = userLinks.filter((l) => {
    if (l.always) return true;
    if (!user) return false;
    if (l.candidate) return isCandidate;
    if (l.recruiter) return isRecruiter;
    if (l.admin) return isAdmin;
    return false;
  });

  const roleColors: Record<string, string> = {
    candidate: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    recruiter: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    admin: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  };

  return (
    <header className="sticky top-0 z-40 w-full">
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-b border-slate-200/70 dark:border-slate-800 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <Link to="/" className="flex items-center gap-2 group">
              <motion.div
                whileHover={{ rotate: 5 }}
                className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-xs"
              >
                <Briefcase size={14} className="text-white" />
              </motion.div>
              <span className="font-display font-bold text-lg text-slate-900 dark:text-white tracking-tight">
                Next<span className="text-indigo-600">Job</span>
              </span>
            </Link>

            <nav className="hidden lg:flex items-center gap-0.5">
              {visibleNavLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`relative px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    isActive(link.href)
                      ? "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-400"
                      : "text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:bg-slate-100/70 dark:hover:bg-slate-800"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-1.5">
              <motion.button
                onClick={toggleLang}
                whileTap={{ scale: 0.92 }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-all bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300 hover:text-indigo-600"
                title="Switch language"
              >
                <AnimatePresence mode="wait">
                  <motion.span key={lang} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.12 }}>
                    {lang === "vi" ? "🇻🇳 VI" : "🇬🇧 EN"}
                  </motion.span>
                </AnimatePresence>
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={toggleDarkMode}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                title="Đổi giao diện"
              >
                <AnimatePresence mode="wait">
                  <motion.div key={darkMode ? "moon" : "sun"} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
                    {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                  </motion.div>
                </AnimatePresence>
              </motion.button>

              <NotificationBell />

              {user ? (
                <div className="relative hidden md:block">
                  <button
                    onClick={() => setProfileOpen((v) => !v)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full overflow-hidden bg-gradient-to-br from-indigo-400 to-purple-500 flex-shrink-0">
                      {profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center text-white font-semibold text-xs">
                          {displayName[0]?.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-semibold text-slate-800 dark:text-white leading-tight">
                        {displayName.split(" ").pop()}
                      </p>
                      <span className={`text-[10px] px-1 py-0.2 rounded-full font-medium ${roleColors[role] || ""}`}>
                        {getEnumLabels(lang).profile_role[role]}
                      </span>
                    </div>
                    <ChevronDown size={12} className={`text-slate-400 transition-transform ${profileOpen ? "rotate-180" : ""}`} />
                  </button>

                  <AnimatePresence>
                    {profileOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.97 }}
                        transition={{ duration: 0.12 }}
                        className="absolute right-0 top-full mt-1.5 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden z-50"
                        onMouseLeave={() => setProfileOpen(false)}
                      >
                        <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-700">
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{displayEmail}</p>
                        </div>
                        <div className="py-1">
                          {visibleUserLinks.map((link) => (
                            <Link
                              key={link.href}
                              to={link.href}
                              onClick={() => setProfileOpen(false)}
                              className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700 hover:text-indigo-600 transition-colors"
                            >
                              <link.icon size={14} />
                              {link.label}
                            </Link>
                          ))}
                        </div>
                        <div className="border-t border-slate-100 dark:border-slate-700 p-1">
                          <button
                            onClick={() => void handleLogout()}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors w-full"
                          >
                            <LogOut size={14} />
                            {t.logout}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="hidden md:flex items-center gap-1.5">
                  <Link to="/login" className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-indigo-600 transition-colors">
                    {t.login}
                  </Link>
                  <Link to="/register" className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs">
                    {t.register}
                  </Link>
                </div>
              )}

              <button
                className="lg:hidden p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => setMobileOpen((v) => !v)}
              >
                {mobileOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden border-t border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 shadow-lg"
            >
              <div className="px-3 py-2 space-y-0.5">
                {visibleNavLinks.map((link) => (
                  <Link
                    key={link.href}
                    to={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={`block px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      isActive(link.href)
                        ? "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30"
                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                {user ? (
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5 mt-1.5">
                    <p className="px-3 py-1 text-[11px] text-slate-400">{displayEmail}</p>
                    {visibleUserLinks.map((link) => (
                      <Link
                        key={link.href}
                        to={link.href}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                      >
                        <link.icon size={13} />
                        {link.label}
                      </Link>
                    ))}
                    <button
                      onClick={() => void handleLogout()}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg w-full mt-1"
                    >
                      <LogOut size={13} />
                      {t.logout}
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-2 pb-1">
                    <Link to="/login" onClick={() => setMobileOpen(false)} className="flex-1 py-1.5 text-xs font-medium text-center border border-slate-200 dark:border-slate-700 rounded-lg">
                      {t.login}
                    </Link>
                    <Link to="/register" onClick={() => setMobileOpen(false)} className="flex-1 py-1.5 text-xs font-semibold text-center text-white bg-indigo-600 rounded-lg">
                      {t.register}
                    </Link>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
