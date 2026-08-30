// Trang chủ (HomePage) - NextJob AI
// Giao diện tinh gọn (compact), thông tin súc tích, tích hợp section Contact (#contact) và FAQ

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Search,
  Users,
  TrendingUp,
  Zap,
  Building2,
  Sparkles,
  Mail,
  LifeBuoy,
  Handshake,
  ShieldCheck,
  Eye,
  UserCheck,
  ChevronDown,
  CheckCircle2,
  Send,
  User,
  Briefcase,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useCurrentProfile } from "../profile/ProfileProvider";
import { useLang } from "../context/LangContext";
import { useToast } from "../context/ToastContext";
import { API_BASE_URL } from "../lib/env";
import { supabase } from "../lib/supabase";
import type { JobPost } from "../types";
import { staggerContainer, fadeUp } from "../components/AnimatedPage";
import JobCard from "../components/JobCard";

// Kiểu dữ liệu cho các số liệu thống kê thực tế trên trang chủ
interface LandingStats {
  jobs_count: number;
  candidates_count: number;
  companies_count: number;
  success_rate: number;
}

export default function HomePage() {
  const { user } = useAuth();
  const { isRecruiter, isAdmin } = useCurrentProfile();
  const { t, lang } = useLang();
  const { success } = useToast();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [landingStats, setLandingStats] = useState<LandingStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Form liên hệ trên trang chủ
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    company: "",
    role: "",
    need: "",
    message: "",
  });
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex((prev) => (prev === index ? null : index));
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setContactSubmitting(true);
    setTimeout(() => {
      setContactSubmitting(false);
      setContactSubmitted(true);
      success(t.contactSuccessTitle || (lang === "en" ? "Request sent successfully!" : "Yêu cầu đã được gửi thành công!"));
    }, 600);
  };

  // Tải danh sách công việc mới nhất
  useEffect(() => {
    if (!supabase) return;
    void supabase
      .from("job_posts")
      .select("*, companies(*)")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(3)
      .then(({ data }) => {
        setJobs(
          ((data || []) as any[]).map((job) => ({ ...job, company: job.companies })) as JobPost[],
        );
      });
  }, []);

  // Tải các số liệu thống kê thực tế từ Database / Backend
  useEffect(() => {
    let isMounted = true;

    async function fetchStats() {
      try {
        // 1. Thử gọi hàm RPC get_landing_stats trực tiếp từ Supabase
        if (supabase) {
          try {
            const { data: rpcData, error: rpcError } = await supabase.rpc("get_landing_stats");
            if (!rpcError && rpcData && typeof rpcData === "object") {
              if (isMounted) {
                setLandingStats({
                  jobs_count: Number((rpcData as any).jobs_count || 0),
                  candidates_count: Number((rpcData as any).candidates_count || 0),
                  companies_count: Number((rpcData as any).companies_count || 0),
                  success_rate: Number((rpcData as any).success_rate || 0),
                });
                setStatsLoading(false);
                return;
              }
            }
          } catch {
            // Chuyển sang fallback tiếp theo
          }
        }

        // 2. Thử gọi API backend GET /api/v1/stats/landing
        if (API_BASE_URL) {
          try {
            const response = await fetch(`${API_BASE_URL}/api/v1/stats/landing`);
            if (response.ok) {
              const apiData = await response.json();
              if (isMounted && apiData) {
                setLandingStats({
                  jobs_count: Number(apiData.jobs_count || 0),
                  candidates_count: Number(apiData.candidates_count || 0),
                  companies_count: Number(apiData.companies_count || 0),
                  success_rate: Number(apiData.success_rate || 0),
                });
                setStatsLoading(false);
                return;
              }
            }
          } catch {
            // Chuyển sang fallback đếm
          }
        }

        // 3. Fallback: Truy vấn đếm trực tiếp các bảng công khai trong Supabase
        if (supabase) {
          const [jobsRes, companiesRes] = await Promise.all([
            supabase.from("job_posts").select("id", { count: "exact", head: true }).eq("status", "published"),
            supabase.from("companies").select("id", { count: "exact", head: true }),
          ]);

          const jobsCount = jobsRes.count ?? 0;
          const companiesCount = companiesRes.count ?? 0;

          if (isMounted) {
            setLandingStats((prev) => ({
              jobs_count: jobsCount,
              candidates_count: prev?.candidates_count || 0,
              companies_count: companiesCount,
              success_rate: prev?.success_rate || 0,
            }));
            setStatsLoading(false);
          }
        }
      } catch (err) {
        console.warn("Lỗi khi tải số liệu thống kê:", err);
      } finally {
        if (isMounted) {
          setStatsLoading(false);
        }
      }
    }

    void fetchStats();

    return () => {
      isMounted = false;
    };
  }, []);

  const ctaHref = !user ? "/register" : isRecruiter || isAdmin ? "/dashboard" : "/jobs";
  const ctaLabel = !user ? t.startFree : isRecruiter ? t.toDashboard : isAdmin ? t.toAdminMenu : t.findJobNow;

  // Định dạng số liệu hiển thị thực tế
  const formatStatValue = (val: number | undefined, isPercentage = false): string => {
    if (val === undefined || val === null) {
      return statsLoading ? "..." : isPercentage ? "0%" : "0";
    }
    if (isPercentage) {
      return `${val}%`;
    }
    if (val > 0) {
      return `${val.toLocaleString()}+`;
    }
    return `${val.toLocaleString()}`;
  };

  const stats = [
    {
      label: t.statJobs,
      value: formatStatValue(landingStats?.jobs_count),
      icon: Zap,
      color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30",
    },
    {
      label: t.statCandidates,
      value: formatStatValue(landingStats?.candidates_count),
      icon: Users,
      color: "text-purple-600 bg-purple-50 dark:bg-purple-900/30",
    },
    {
      label: t.statCompanies,
      value: formatStatValue(landingStats?.companies_count),
      icon: Building2,
      color: "text-orange-600 bg-orange-50 dark:bg-orange-900/30",
    },
    {
      label: t.statSuccess,
      value: formatStatValue(landingStats?.success_rate, true),
      icon: TrendingUp,
      color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30",
    },
  ];

  const features = [
    {
      title: t.forCandidate,
      desc: t.forCandidateDesc,
      cta: t.viewMyProfile,
      href: user ? "/profile" : "/register",
      icon: "🎯",
      gradient: "from-indigo-500 to-purple-500",
    },
    {
      title: t.forRecruiter,
      desc: t.forRecruiterDesc,
      cta: t.registerRecruiter,
      href: isRecruiter ? "/dashboard" : "/recruiter-register",
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

  const contactChannels = [
    {
      title: t.contactSales,
      email: t.contactSalesEmail,
      icon: Mail,
      iconColor: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40",
    },
    {
      title: t.contactSupport,
      email: t.contactSupportEmail,
      icon: LifeBuoy,
      iconColor: "text-sky-600 bg-sky-50 dark:bg-sky-950/40",
    },
    {
      title: t.contactPartnership,
      email: t.contactPartnershipEmail,
      icon: Handshake,
      iconColor: "text-purple-600 bg-purple-50 dark:bg-purple-950/40",
    },
  ];

  const trustCards = [
    {
      title: t.trustControlTitle,
      desc: t.trustControlDesc,
      icon: ShieldCheck,
      color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40",
    },
    {
      title: t.trustEvidenceTitle,
      desc: t.trustEvidenceDesc,
      icon: Eye,
      color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40",
    },
    {
      title: t.trustHumanTitle,
      desc: t.trustHumanDesc,
      icon: UserCheck,
      color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40",
    },
  ];

  const faqItems = [
    { q: t.faqQ1, a: t.faqA1 },
    { q: t.faqQ2, a: t.faqA2 },
    { q: t.faqQ3, a: t.faqA3 },
    { q: t.faqQ4, a: t.faqA4 },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 transition-colors">
      {/* Hero Section - Compact */}
      <section className="relative overflow-hidden pt-10 sm:pt-14 pb-12 sm:pb-14">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[750px] h-[450px] bg-gradient-to-br from-indigo-100/60 via-purple-50/40 to-pink-50/20 dark:from-indigo-900/20 dark:via-purple-900/10 dark:to-transparent rounded-full blur-3xl" />
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 relative">
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="text-center max-w-3xl mx-auto">
            <motion.div variants={fadeUp}>
              <span className="inline-flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold px-3 py-1 rounded-full mb-4 border border-indigo-100 dark:border-indigo-800">
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                {t.heroTag}
              </span>
            </motion.div>
            <motion.h1 variants={fadeUp} className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 dark:text-white mb-4 leading-tight tracking-tight">
              {t.heroTitle1}
              <br />
              <span className="gradient-text">{t.heroTitle2}</span>
            </motion.h1>
            <motion.p variants={fadeUp} className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-6 max-w-xl mx-auto leading-relaxed">
              {t.heroDesc}
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to={ctaHref} className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-md shadow-indigo-500/20 transition-all">
                {ctaLabel} <ArrowRight size={15} />
              </Link>
              <Link to="/jobs" className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs sm:text-sm font-semibold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-all">
                <Search size={15} /> {t.searchJobs}
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Stats Section - Compact */}
      <section className="py-8 bg-slate-50/80 dark:bg-slate-800/40 border-y border-slate-100 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-white dark:bg-slate-800/90 rounded-xl p-4 text-center shadow-xs border border-slate-200/70 dark:border-slate-700/70">
              <div className={`w-9 h-9 rounded-lg ${stat.color} flex items-center justify-center mx-auto mb-2`}>
                <stat.icon size={18} />
              </div>
              <p className={`font-display text-2xl font-bold text-slate-900 dark:text-white transition-opacity duration-300 ${statsLoading && !landingStats ? "opacity-40 animate-pulse" : "opacity-100"}`}>
                {stat.value}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Latest Jobs Section - Compact */}
      <section className="py-10 sm:py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{t.latestJobs}</h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">{t.latestJobsDesc}</p>
            </div>
            <Link to="/jobs" className="flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
              {t.viewAll} <ArrowRight size={13} />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} compact />
            ))}
          </div>
        </div>
      </section>

      {/* Target Audiences Features - Compact */}
      <section className="py-10 sm:py-12 bg-slate-50/70 dark:bg-slate-800/30 border-y border-slate-100 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {features.map((f) => (
            <button
              key={f.title}
              type="button"
              onClick={() => navigate(f.href)}
              className="text-left bg-white dark:bg-slate-800/90 rounded-xl p-5 border border-slate-200/70 dark:border-slate-700/70 shadow-xs hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-700 transition-all cursor-pointer group"
            >
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${f.gradient} flex items-center justify-center text-xl mb-3 shadow-xs`}>{f.icon}</div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white mb-1.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{f.title}</h3>
              <p className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed mb-3 line-clamp-3">{f.desc}</p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400">{f.cta} <ArrowRight size={12} /></span>
            </button>
          ))}
        </div>
      </section>

      {/* Section Liên hệ & FAQ (#contact) - Compact & High-Density */}
      <section id="contact" className="py-12 sm:py-14 bg-white dark:bg-slate-900 scroll-mt-14">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 mb-2">
              <Sparkles size={12} className="text-indigo-500" />
              {t.contactBadge}
            </span>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              {t.contactHeroTitle}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1.5">
              {t.contactHeroDesc}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Cột trái: Kênh liên hệ & Trust cards */}
            <div className="lg:col-span-5 space-y-3.5">
              <div className="bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 rounded-xl p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                  {lang === "en" ? "Direct Channels" : "Kênh liên lạc trực tiếp"}
                </p>
                <div className="space-y-2">
                  {contactChannels.map((c) => (
                    <a
                      key={c.email}
                      href={`mailto:${c.email}`}
                      className="flex items-center gap-2.5 p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors"
                    >
                      <div className={`p-1.5 rounded-md ${c.iconColor}`}>
                        <c.icon size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800 dark:text-white leading-tight">{c.title}</p>
                        <p className="text-xs text-indigo-600 dark:text-indigo-400 truncate">{c.email}</p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>

              {/* Trust cards */}
              <div className="space-y-2">
                {trustCards.map((c) => (
                  <div key={c.title} className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70">
                    <div className={`p-1.5 rounded-lg ${c.color} shrink-0 mt-0.5`}>
                      <c.icon size={13} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">{c.title}</p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">{c.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cột phải: Form liên hệ compact */}
            <div className="lg:col-span-7">
              <div className="bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-5 shadow-sm">
                <h3 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  {t.contactFormTitle}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-4">
                  {t.contactFormDesc}
                </p>

                <AnimatePresence mode="wait">
                  {contactSubmitted ? (
                    <motion.div
                      key="sub"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-center py-6"
                    >
                      <CheckCircle2 size={28} className="text-emerald-500 mx-auto mb-2" />
                      <p className="text-sm font-bold text-slate-900 dark:text-white mb-1">{t.contactSuccessTitle}</p>
                      <p className="text-xs text-slate-500 mb-3">{t.contactSuccessDesc}</p>
                      <button
                        type="button"
                        onClick={() => setContactSubmitted(false)}
                        className="text-xs font-semibold text-indigo-600 hover:underline cursor-pointer"
                      >
                        {t.contactSendAnother}
                      </button>
                    </motion.div>
                  ) : (
                    <motion.form key="form" onSubmit={handleContactSubmit} className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          {t.contactName} *
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            required
                            value={contactForm.name}
                            onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                            placeholder={t.contactNamePlaceholder}
                            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 transition-all outline-hidden focus:border-indigo-500"
                          />
                          <User size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            {t.contactEmail} *
                          </label>
                          <div className="relative">
                            <input
                              type="email"
                              required
                              value={contactForm.email}
                              onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                              placeholder={t.contactEmailPlaceholder}
                              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 transition-all outline-hidden focus:border-indigo-500"
                            />
                            <Mail size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            {t.contactCompany}
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              value={contactForm.company}
                              onChange={(e) => setContactForm({ ...contactForm, company: e.target.value })}
                              placeholder={t.contactCompanyPlaceholder}
                              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 transition-all outline-hidden focus:border-indigo-500"
                            />
                            <Briefcase size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            {t.contactRole}
                          </label>
                          <select
                            value={contactForm.role}
                            onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 outline-hidden focus:border-indigo-500"
                          >
                            <option value="">{t.contactRoleSelect}</option>
                            <option value="founder">{t.contactRoleFounder}</option>
                            <option value="hr-lead">{t.contactRoleHrLead}</option>
                            <option value="ta">{t.contactRoleTa}</option>
                            <option value="tech-lead">{t.contactRoleTechLead}</option>
                            <option value="candidate">{t.contactRoleCandidate}</option>
                            <option value="other">{t.contactRoleOther}</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            {t.contactNeed}
                          </label>
                          <select
                            value={contactForm.need}
                            onChange={(e) => setContactForm({ ...contactForm, need: e.target.value })}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 outline-hidden focus:border-indigo-500"
                          >
                            <option value="">{t.contactNeedSelect}</option>
                            <option value="interview">{t.contactNeedInterview}</option>
                            <option value="assessment">{t.contactNeedAssessment}</option>
                            <option value="evidence">{t.contactNeedEvidence}</option>
                            <option value="rollout">{t.contactNeedRollout}</option>
                            <option value="other">{t.contactNeedOther}</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          {t.contactMessage}
                        </label>
                        <textarea
                          rows={2}
                          value={contactForm.message}
                          onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                          placeholder={t.contactMessagePlaceholder}
                          className="w-full p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:bg-white dark:focus:bg-slate-900 outline-hidden focus:border-indigo-500 resize-none"
                        />
                      </div>

                      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
                        <button
                          type="submit"
                          disabled={contactSubmitting}
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs disabled:opacity-50 transition-all cursor-pointer"
                        >
                          {contactSubmitting ? (
                            <>
                              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              <span>{t.contactSubmitting}</span>
                            </>
                          ) : (
                            <>
                              <Send size={12} />
                              <span>{t.contactSubmit}</span>
                            </>
                          )}
                        </button>
                        <p className="text-[10px] text-slate-400 text-center sm:text-right">{t.contactFootnote}</p>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Section FAQ Accordion on HomePage */}
          <div className="mt-12 bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 rounded-2xl p-5 sm:p-6">
            <div className="mb-4">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 mb-1">
                {t.faqBadge}
              </span>
              <h3 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                {t.faqTitle}
              </h3>
            </div>

            <div className="divide-y divide-slate-200/60 dark:divide-slate-700/60">
              {faqItems.map((item, idx) => {
                const isOpen = openFaqIndex === idx;
                return (
                  <div key={idx} className="py-2.5">
                    <button
                      type="button"
                      onClick={() => toggleFaq(idx)}
                      className="w-full flex items-center justify-between gap-3 text-left py-1 cursor-pointer focus:outline-hidden"
                    >
                      <span className={`text-xs sm:text-sm font-semibold transition-colors ${isOpen ? "text-indigo-600 dark:text-indigo-400" : "text-slate-800 dark:text-slate-200 hover:text-indigo-600"}`}>
                        {item.q}
                      </span>
                      <ChevronDown
                        size={15}
                        className={`text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180 text-indigo-600 dark:text-indigo-400" : ""}`}
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          <p className="pt-1.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                            {item.a}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {!user && (
        <section className="py-10 bg-slate-50/70 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 rounded-2xl p-6 sm:p-8 text-center text-white shadow-md">
              <h2 className="font-display text-2xl sm:text-3xl font-bold mb-2">{t.ctaTitle}</h2>
              <p className="text-indigo-100 text-xs sm:text-sm mb-5 max-w-md mx-auto">{t.ctaDesc}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link to="/register" className="inline-flex items-center justify-center gap-1.5 px-6 py-2.5 bg-white text-indigo-700 font-bold text-xs rounded-xl shadow-xs hover:bg-indigo-50 transition-colors">{t.registerFree}</Link>
                <Link to="/login" className="inline-flex items-center justify-center gap-1.5 px-6 py-2.5 border border-white/40 text-white font-semibold text-xs rounded-xl hover:bg-white/10 transition-colors">{t.login}</Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Footer - Compact */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-6 bg-white dark:bg-slate-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-base text-slate-800 dark:text-white">Next<span className="text-indigo-600">Job</span></span>
              <span>— {lang === "en" ? "© 2026 NextJob AI. Smart recruitment platform." : "© 2026 NextJob AI. Nền tảng tuyển dụng thông minh."}</span>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <Link to="/jobs" className="hover:text-indigo-600 transition-colors">{t.jobs}</Link>
              <Link to="/repo-evaluation" className="hover:text-indigo-600 transition-colors">{t.repoEvaluation || "Repo Evaluation"}</Link>
              <Link to="/contact" className="hover:text-indigo-600 transition-colors">{t.contact || "Liên hệ"}</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
