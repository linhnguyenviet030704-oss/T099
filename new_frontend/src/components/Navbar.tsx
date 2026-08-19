import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase, User, FileText, BookOpen, LogOut, Sun, Moon,
  Menu, X, ChevronDown, Star, LayoutDashboard, Shield, Bell,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { useLang } from "../context/LangContext";
import { ROLE_LABELS } from "../data/mockData";

export default function Navbar() {
  const { currentUser, darkMode, toggleDarkMode, logout } = useApp();
  const { lang, t, toggleLang } = useLang();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + "/");

  const handleLogout = () => {
    logout();
    navigate("/");
    setMobileOpen(false);
    setProfileOpen(false);
  };

  const navLinks = [
    { label: t.home, href: "/", always: true },
    { label: t.jobs, href: "/jobs", always: true },
    { label: t.aiSuggestions, href: "/ai-suggestions", roles: ["candidate"] },
    { label: t.aiCandidates, href: "/ai-candidates", roles: ["recruiter", "admin"] },
    { label: t.dashboard, href: "/dashboard", roles: ["recruiter", "admin"] },
  ];

  const userLinks = [
    { label: t.profile, href: "/profile", icon: User, always: true },
    { label: t.cvVault, href: "/cv-vault", icon: FileText, always: true },
    { label: t.applications, href: "/applications", icon: BookOpen, always: true },
    { label: t.recruiterRegister, href: "/recruiter-register", icon: Star, roles: ["candidate"] },
    { label: t.adminMenu, href: "/admin", icon: Shield, roles: ["admin"] },
  ];

  const visibleNavLinks = navLinks.filter(
    (l) => l.always || (currentUser && l.roles?.includes(currentUser.role))
  );

  const visibleUserLinks = userLinks.filter(
    (l) => l.always || (currentUser && l.roles?.includes(currentUser.role))
  );

  const roleColors: Record<string, string> = {
    candidate: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    recruiter: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    admin: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  };

  return (
    <header className="sticky top-0 z-40 w-full">
      <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-700/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 group">
              <motion.div
                whileHover={{ rotate: 5 }}
                className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md"
              >
                <Briefcase size={16} className="text-white" />
              </motion.div>
              <span className="font-display font-bold text-xl text-slate-900 dark:text-white">
                Next<span className="text-indigo-600">Job</span>
              </span>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              {visibleNavLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`relative px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isActive(link.href)
                      ? "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-400"
                      : "text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  {link.label}
                  {isActive(link.href) && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute inset-0 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg -z-10"
                    />
                  )}
                </Link>
              ))}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-2">
              {/* Lang toggle */}
              <motion.button
                onClick={toggleLang}
                whileTap={{ scale: 0.92 }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300 hover:text-indigo-600"
                title="Switch language"
              >
                <AnimatePresence mode="wait">
                  <motion.span key={lang} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.15 }}>
                    {lang === "vi" ? "🇻🇳 VI" : "🇬🇧 EN"}
                  </motion.span>
                </AnimatePresence>
              </motion.button>

              <button
                onClick={toggleDarkMode}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                title="Đổi giao diện"
              >
                <AnimatePresence mode="wait">
                  <motion.div key={darkMode ? "moon" : "sun"} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
                    {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                  </motion.div>
                </AnimatePresence>
              </button>

              {currentUser ? (
                <div className="relative hidden md:block">
                  <button
                    onClick={() => setProfileOpen((v) => !v)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-indigo-400 to-purple-500 flex-shrink-0">
                      {currentUser.avatar ? (
                        <img src={currentUser.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center text-white font-semibold text-sm">
                          {currentUser.name[0]}
                        </span>
                      )}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-slate-800 dark:text-white leading-tight">{currentUser.name.split(" ").pop()}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${roleColors[currentUser.role] || ""}`}>
                        {ROLE_LABELS[currentUser.role]}
                      </span>
                    </div>
                    <ChevronDown size={14} className={`text-slate-400 transition-transform ${profileOpen ? "rotate-180" : ""}`} />
                  </button>

                  <AnimatePresence>
                    {profileOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden"
                        onMouseLeave={() => setProfileOpen(false)}
                      >
                        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{currentUser.email}</p>
                        </div>
                        {visibleUserLinks.map((link) => (
                          <Link
                            key={link.href}
                            to={link.href}
                            onClick={() => setProfileOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700 hover:text-indigo-600 transition-colors"
                          >
                            <link.icon size={15} />
                            {link.label}
                          </Link>
                        ))}
                        <div className="border-t border-slate-100 dark:border-slate-700 p-1">
                          <button
                            onClick={handleLogout}
                            className="flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors w-full"
                          >
                            <LogOut size={15} />
                            {t.logout}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="hidden md:flex items-center gap-2">
                  <Link
                    to="/login"
                    className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-indigo-600 transition-colors"
                  >
                    {t.login}
                  </Link>
                  <Link
                    to="/register"
                    className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors"
                  >
                    {t.register}
                  </Link>
                </div>
              )}

              {/* Mobile menu button */}
              <button
                className="md:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => setMobileOpen((v) => !v)}
              >
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="md:hidden border-t border-slate-200 dark:border-slate-700 overflow-hidden"
            >
              <div className="px-4 py-3 space-y-1">
                {visibleNavLinks.map((link) => (
                  <Link
                    key={link.href}
                    to={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={`block px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      isActive(link.href)
                        ? "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30"
                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                {currentUser ? (
                  <>
                    <div className="border-t border-slate-100 dark:border-slate-700 pt-2 mt-2">
                      <p className="px-3 py-1 text-xs text-slate-500">{currentUser.email}</p>
                      {visibleUserLinks.map((link) => (
                        <Link
                          key={link.href}
                          to={link.href}
                          onClick={() => setMobileOpen(false)}
                          className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 rounded-xl"
                        >
                          <link.icon size={15} />
                          {link.label}
                        </Link>
                      ))}
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-xl w-full mt-1"
                      >
                        <LogOut size={15} />
                        Đăng xuất
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex gap-2 pt-2">
                    <Link
                      to="/login"
                      onClick={() => setMobileOpen(false)}
                      className="flex-1 py-2.5 text-sm font-medium text-center border border-slate-200 rounded-xl"
                    >
                      Đăng nhập
                    </Link>
                    <Link
                      to="/register"
                      onClick={() => setMobileOpen(false)}
                      className="flex-1 py-2.5 text-sm font-semibold text-center text-white bg-indigo-600 rounded-xl"
                    >
                      Đăng ký
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
