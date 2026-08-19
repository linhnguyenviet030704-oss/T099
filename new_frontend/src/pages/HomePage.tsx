import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Search, Users, TrendingUp, Zap, CheckCircle2, Building2 } from "lucide-react";
import { useApp } from "../context/AppContext";
import { useLang } from "../context/LangContext";
import { staggerContainer, fadeUp } from "../components/AnimatedPage";
import JobCard from "../components/JobCard";

export default function HomePage() {
  const { currentUser, jobs, companies } = useApp();
  const { t } = useLang();
  const navigate = useNavigate();

  const activeJobs = jobs.filter((j) => j.status === "active").slice(0, 3);

  const ctaHref = !currentUser ? "/register" : currentUser.role === "recruiter" || currentUser.role === "admin" ? "/dashboard" : "/jobs";
  const ctaLabel = !currentUser ? t.startFree : currentUser.role === "recruiter" ? t.toDashboard : currentUser.role === "admin" ? t.toAdminMenu : t.findJobNow;

  const stats = [
    { label: t.statJobs, value: "2,400+", icon: Zap, color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30" },
    { label: t.statCandidates, value: "18,500+", icon: Users, color: "text-purple-600 bg-purple-50 dark:bg-purple-900/30" },
    { label: t.statCompanies, value: "340+", icon: Building2, color: "text-orange-600 bg-orange-50 dark:bg-orange-900/30" },
    { label: t.statSuccess, value: "87%", icon: TrendingUp, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30" },
  ];

  const features = [
    {
      title: t.forCandidate,
      desc: t.forCandidateDesc,
      cta: t.viewMyProfile,
      href: currentUser ? "/profile" : "/register",
      icon: "🎯",
      gradient: "from-indigo-500 to-purple-500",
    },
    {
      title: t.forRecruiter,
      desc: t.forRecruiterDesc,
      cta: t.registerRecruiter,
      href: currentUser?.role === "recruiter" ? "/dashboard" : "/recruiter-register",
      icon: "🏢",
      gradient: "from-orange-400 to-pink-500",
    },
    {
      title: t.forAdmin,
      desc: t.forAdminDesc,
      cta: t.accessAdmin,
      href: "/admin",
      icon: "⚡",
      gradient: "from-emerald-400 to-teal-500",
    },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      {/* Hero */}
      <section className="relative overflow-hidden pt-20 pb-28">
        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-gradient-to-br from-indigo-100/70 via-purple-50/50 to-pink-50/30 dark:from-indigo-900/20 dark:via-purple-900/10 dark:to-transparent rounded-full blur-3xl" />
          <div className="absolute top-20 right-10 w-64 h-64 bg-orange-100/60 dark:bg-orange-900/10 rounded-full blur-3xl animate-float" style={{ animationDelay: "1s" }} />
          <div className="absolute bottom-10 left-10 w-48 h-48 bg-purple-100/60 dark:bg-purple-900/10 rounded-full blur-3xl animate-float" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="text-center max-w-4xl mx-auto"
          >
            <motion.div variants={fadeUp}>
              <span className="inline-flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-sm font-medium px-4 py-1.5 rounded-full mb-6 border border-indigo-100 dark:border-indigo-800">
                <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                {t.heroTag}
              </span>
            </motion.div>

            <motion.h1 variants={fadeUp} className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold text-slate-900 dark:text-white mb-6 leading-snug">
              {t.heroTitle1}
              <br />
              <span className="gradient-text">{t.heroTitle2}</span>
            </motion.h1>

            <motion.p variants={fadeUp} className="text-xl text-slate-600 dark:text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
              {t.heroDesc}
            </motion.p>

            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-4 justify-center">
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                <Link
                  to={ctaHref}
                  className="inline-flex items-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-2xl shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30 transition-all"
                >
                  {ctaLabel} <ArrowRight size={18} />
                </Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                <Link
                  to="/jobs"
                  className="inline-flex items-center gap-2 px-8 py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-2xl hover:border-indigo-300 hover:text-indigo-600 transition-all"
                >
                  <Search size={18} /> {t.searchJobs}
                </Link>
              </motion.div>
            </motion.div>
          </motion.div>

          {/* Quick search */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="mt-14 max-w-2xl mx-auto"
          >
            <div className="bg-white dark:bg-slate-800 shadow-xl shadow-slate-200/60 dark:shadow-slate-900/60 rounded-2xl p-2 border border-slate-100 dark:border-slate-700 flex gap-2">
              <div className="flex-1 flex items-center gap-3 px-4">
                <Search size={18} className="text-slate-400" />
                <input
                  type="text"
                  placeholder={t.searchPlaceholder}
                  className="flex-1 bg-transparent text-slate-700 dark:text-slate-200 placeholder-slate-400 text-sm outline-none"
                  onKeyDown={(e) => e.key === "Enter" && navigate("/jobs")}
                />
              </div>
              <button
                onClick={() => navigate("/jobs")}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-xl transition-colors"
              >
                {t.search}
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 bg-slate-50 dark:bg-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {stats.map((stat) => (
              <motion.div
                key={stat.label}
                variants={fadeUp}
                className="bg-white dark:bg-slate-800 rounded-2xl p-6 text-center shadow-sm border border-slate-100 dark:border-slate-700"
              >
                <div className={`w-12 h-12 rounded-xl ${stat.color} flex items-center justify-center mx-auto mb-3`}>
                  <stat.icon size={22} />
                </div>
                <p className="font-display text-3xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{stat.label}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Latest jobs */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex items-end justify-between mb-10"
          >
            <div>
              <h2 className="font-display text-3xl font-bold text-slate-900 dark:text-white">{t.latestJobs}</h2>
              <p className="text-slate-500 dark:text-slate-400 mt-2">{t.latestJobsDesc}</p>
            </div>
            <Link to="/jobs" className="hidden sm:flex items-center gap-1 text-sm font-medium text-indigo-600 hover:gap-2 transition-all">
              {t.viewAll} <ArrowRight size={15} />
            </Link>
          </motion.div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-50px" }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {activeJobs.map((job) => {
              const company = companies.find((c) => c.id === job.companyId)!;
              return (
                <motion.div key={job.id} variants={fadeUp}>
                  <JobCard job={job} company={company} />
                </motion.div>
              );
            })}
          </motion.div>

          <div className="text-center mt-8 sm:hidden">
            <Link to="/jobs" className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600">
              Xem tất cả việc làm <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* Feature paths */}
      <section className="py-20 bg-slate-50 dark:bg-slate-800/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className="font-display text-3xl font-bold text-slate-900 dark:text-white mb-3">
              {t.forYou}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
              {t.forYouDesc}
            </p>
          </motion.div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {features.map((f) => (
              <motion.div
                key={f.title}
                variants={fadeUp}
                whileHover={{ y: -4 }}
                className="bg-white dark:bg-slate-800 rounded-2xl p-7 border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-xl hover:shadow-slate-200/60 dark:hover:shadow-slate-900/60 transition-all group cursor-pointer"
                onClick={() => navigate(f.href)}
              >
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${f.gradient} flex items-center justify-center text-2xl mb-5 shadow-md`}>
                  {f.icon}
                </div>
                <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white mb-3">{f.title}</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-5">{f.desc}</p>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 group-hover:gap-2 transition-all">
                  {f.cta} <ArrowRight size={14} />
                </span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA banner */}
      {!currentUser && (
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 rounded-3xl p-12 text-center text-white relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%23ffffff%22 fill-opacity=%220.05%22%3E%3Cpath d=%22M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-20" />
              <div className="relative">
                <h2 className="font-display text-4xl font-bold mb-4">{t.ctaTitle}</h2>
                <p className="text-indigo-200 text-lg mb-8 max-w-lg mx-auto">
                  {t.ctaDesc}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                    <Link to="/register" className="inline-flex items-center gap-2 px-8 py-4 bg-white text-indigo-700 font-bold rounded-2xl hover:bg-indigo-50 transition-colors shadow-lg">
                      {t.registerFree} <ArrowRight size={18} />
                    </Link>
                  </motion.div>
                  <Link to="/login" className="inline-flex items-center gap-2 px-8 py-4 border border-white/30 text-white font-semibold rounded-2xl hover:bg-white/10 transition-colors">
                    {t.login}
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-10 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center text-sm text-slate-500">
          <p className="mb-2 font-display font-bold text-lg text-slate-800 dark:text-white">Next<span className="text-indigo-600">Job</span></p>
          <p>© 2026 NextJob Vietnam. Nền tảng tuyển dụng thông minh.</p>
        </div>
      </footer>
    </div>
  );
}
