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
  MessageCircle,
  Share2,
  Cpu,
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
    channel: "email" as "email" | "zalo" | "facebook",
    contactValue: "",
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
      {/* Khối Viewport đầu tiên: Sử dụng 100dvh để khớp chuẩn 100% viewport trên cả local và production (kể cả khi có Bookmark bar) */}
      <div className="min-h-[calc(100dvh-3.5rem)] flex flex-col justify-between pt-4 sm:pt-6 pb-2.5 sm:pb-3.5 px-4 sm:px-6 relative overflow-hidden">
        {/* Background Decorative Elements & Animations */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Subtle Technology Grid Mesh Pattern */}
          <div className="absolute inset-0 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:28px_28px] opacity-[0.12] dark:opacity-[0.08]" />

          {/* Animated Ambient Glow Orbs */}
          <div className="absolute -left-28 top-12 w-96 h-96 bg-gradient-to-br from-indigo-500/15 to-purple-500/10 dark:from-indigo-600/15 dark:to-purple-600/10 rounded-full blur-3xl animate-pulse-glow" />
          <div className="absolute -right-28 top-16 w-96 h-96 bg-gradient-to-br from-purple-500/15 to-pink-500/10 dark:from-purple-600/15 dark:to-pink-600/10 rounded-full blur-3xl animate-pulse-glow [animation-delay:3s]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[750px] h-[400px] bg-gradient-to-tr from-indigo-100/40 via-purple-50/20 to-pink-50/10 dark:from-indigo-900/15 dark:via-purple-900/10 dark:to-transparent rounded-full blur-3xl" />
        </div>

        {/* Floating Decorative Badges 2 bên (Trang trí sườn màn hình lớn - Scale cân xứng) */}
        <motion.div
          initial={{ opacity: 0, x: -35 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="hidden xl:flex absolute left-4 2xl:left-12 top-20 lg:top-24 items-center gap-3.5 p-3.5 bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl border border-indigo-100/90 dark:border-indigo-900/60 rounded-2xl shadow-lg shadow-indigo-500/5 animate-float pointer-events-none max-w-[250px]"
        >
          <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/90 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold shrink-0 border border-indigo-100 dark:border-indigo-800/50">
            <Cpu size={20} />
          </div>
          <div className="text-left min-w-0">
            <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm text-slate-800 dark:text-white truncate">
              <span>Git Repo Evaluator</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">5 tiêu chuẩn đánh giá mã</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 35 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.25 }}
          className="hidden xl:flex absolute right-4 2xl:right-12 top-20 lg:top-24 items-center gap-3.5 p-3.5 bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl border border-purple-100/90 dark:border-purple-900/60 rounded-2xl shadow-lg shadow-purple-500/5 animate-float-slow pointer-events-none max-w-[250px]"
        >
          <div className="w-11 h-11 rounded-xl bg-purple-50 dark:bg-purple-950/90 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold shrink-0 border border-purple-100 dark:border-purple-800/50">
            <Sparkles size={20} />
          </div>
          <div className="text-left min-w-0">
            <div className="flex items-center gap-1 font-bold text-xs sm:text-sm text-slate-800 dark:text-white truncate">
              <span>AI Interview Question</span>
              <span className="text-amber-500 text-xs">★ 98%</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">Rubric 3 cấp độ chuẩn hóa</p>
          </div>
        </motion.div>

        {/* 1. Hero Content & Scaled Stats Bar - Scale lớn ấn tượng */}
        <div className="max-w-7xl mx-auto w-full relative z-10">
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="text-center max-w-4xl mx-auto">
            <motion.div variants={fadeUp}>
              <span className="inline-flex items-center gap-2 bg-indigo-50/90 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs sm:text-sm font-semibold px-4 py-1.5 rounded-full mb-3.5 sm:mb-4.5 border border-indigo-100 dark:border-indigo-800 shadow-2xs">
                <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                {t.heroTag}
              </span>
            </motion.div>
            <motion.h1 variants={fadeUp} className="font-display text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white mb-3.5 sm:mb-4.5 leading-[1.15] tracking-tight">
              {t.heroTitle1}{" "}
              <span className="gradient-text">{t.heroTitle2}</span>
            </motion.h1>
            <motion.p variants={fadeUp} className="text-sm sm:text-base lg:text-lg text-slate-600 dark:text-slate-300 mb-6 sm:mb-7 max-w-3xl mx-auto leading-relaxed">
              {t.heroDesc}
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-wrap gap-3.5 justify-center items-center">
              <Link to={ctaHref} className="inline-flex items-center justify-center gap-2 px-6 sm:px-7 py-3 sm:py-3.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm sm:text-base font-bold rounded-2xl shadow-md shadow-indigo-500/25 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all">
                {ctaLabel} <ArrowRight size={16} />
              </Link>
              <Link to="/jobs" className="inline-flex items-center justify-center gap-2 px-6 sm:px-7 py-3 sm:py-3.5 bg-white/95 dark:bg-slate-800/95 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm sm:text-base font-bold rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all">
                <Search size={16} /> {t.searchJobs}
              </Link>
            </motion.div>

            {/* Scaled Stats Bar - To rõ, nổi bật và có độ lớn ấn tượng */}
            <motion.div variants={fadeUp} className="mt-7 sm:mt-9 lg:mt-11 grid grid-cols-2 sm:grid-cols-4 gap-3.5 sm:gap-4.5 text-left max-w-5xl mx-auto">
              {stats.map((stat) => (
                <div key={stat.label} className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl border border-slate-200/90 dark:border-slate-700/80 rounded-2xl p-4 sm:p-4.5 flex items-center gap-3.5 sm:gap-4 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600 transition-all group">
                  <div className={`w-11 h-11 sm:w-13 sm:h-13 rounded-2xl ${stat.color} flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform`}>
                    <stat.icon size={22} />
                  </div>
                  <div className="min-w-0">
                    <p className={`font-display text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white leading-tight ${statsLoading && !landingStats ? "opacity-40 animate-pulse" : "opacity-100"}`}>
                      {stat.value}
                    </p>
                    <p className="text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400 truncate mt-0.5">{stat.label}</p>
                  </div>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>

        {/* 2. Latest Jobs Section - Scale nhỏ gọn và neo sát mép đáy màn hình */}
        <div className="max-w-6xl mx-auto w-full relative z-10 pt-2 pb-1">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="font-display text-xs sm:text-sm font-bold text-slate-900 dark:text-white tracking-tight leading-tight flex items-center gap-1.5">
                <span>{t.latestJobs}</span>
                <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 text-[9px] font-semibold border border-indigo-100 dark:border-indigo-800/50">
                  Mới
                </span>
              </h2>
              <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t.latestJobsDesc}</p>
            </div>
            <Link to="/jobs" className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
              {t.viewAll} <ArrowRight size={11} />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} compact />
            ))}
          </div>
        </div>
      </div>

      {/* Target Audiences Features - Compact */}
      <section className="py-8 sm:py-10 bg-slate-50/70 dark:bg-slate-800/30 border-y border-slate-100 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {features.map((f) => (
            <button
              key={f.title}
              type="button"
              onClick={() => navigate(f.href)}
              className="text-left bg-white dark:bg-slate-800/90 rounded-xl p-4 border border-slate-200/70 dark:border-slate-700/70 shadow-xs hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-700 transition-all cursor-pointer group"
            >
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${f.gradient} flex items-center justify-center text-lg mb-2.5 shadow-xs`}>{f.icon}</div>
              <h3 className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{f.title}</h3>
              <p className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed mb-2.5 line-clamp-2">{f.desc}</p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400">{f.cta} <ArrowRight size={11} /></span>
            </button>
          ))}
        </div>
      </section>

      {/* Section Liên hệ & FAQ (#contact) - Compact & High-Density */}
      <section id="contact" className="py-10 sm:py-12 bg-white dark:bg-slate-900 scroll-mt-14">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-6">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 mb-1.5">
              <Sparkles size={11} className="text-indigo-500" />
              {t.contactBadge}
            </span>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {t.contactHeroTitle}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {t.contactHeroDesc}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Cột trái: Kênh liên hệ & Trust cards */}
            <div className="lg:col-span-5 space-y-3">
              <div className="bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 rounded-xl p-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  {lang === "en" ? "Direct Channels" : "Kênh liên lạc trực tiếp"}
                </p>
                <div className="space-y-1.5">
                  {contactChannels.map((c) => (
                    <a
                      key={c.email}
                      href={`mailto:${c.email}`}
                      className="flex items-center gap-2.5 p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors"
                    >
                      <div className={`p-1.5 rounded-md ${c.iconColor}`}>
                        <c.icon size={13} />
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
              <div className="bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-sm">
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {t.contactFormTitle}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-3.5">
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
                      <CheckCircle2 size={26} className="text-emerald-500 mx-auto mb-2" />
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
                          <User size={13} className="absolute left-2.5 top-2 text-slate-400" />
                        </div>
                      </div>

                      {/* Kênh nhận phản hồi & Input liên hệ */}
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {t.contactChannelLabel || "Kênh nhận phản hồi"} *
                        </label>
                        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-900/70 rounded-lg border border-slate-200/70 dark:border-slate-700/70">
                          <button
                            type="button"
                            onClick={() => setContactForm({ ...contactForm, channel: "email" })}
                            className={`flex items-center justify-center gap-1 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                              contactForm.channel === "email"
                                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-2xs"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                            }`}
                          >
                            <Mail size={12} />
                            <span>Email</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setContactForm({ ...contactForm, channel: "zalo" })}
                            className={`flex items-center justify-center gap-1 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                              contactForm.channel === "zalo"
                                ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                            }`}
                          >
                            <MessageCircle size={12} />
                            <span>Zalo</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setContactForm({ ...contactForm, channel: "facebook" })}
                            className={`flex items-center justify-center gap-1 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                              contactForm.channel === "facebook"
                                ? "bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-2xs"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                            }`}
                          >
                            <Share2 size={12} />
                            <span>Facebook</span>
                          </button>
                        </div>

                        {/* Input động theo Channel */}
                        <div className="relative pt-0.5">
                          {contactForm.channel === "email" ? (
                            <>
                              <input
                                type="email"
                                required
                                value={contactForm.contactValue}
                                onChange={(e) => setContactForm({ ...contactForm, contactValue: e.target.value })}
                                placeholder={t.contactEmailPlaceholder}
                                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 transition-all outline-hidden focus:border-indigo-500"
                              />
                              <Mail size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                            </>
                          ) : contactForm.channel === "zalo" ? (
                            <>
                              <input
                                type="tel"
                                required
                                value={contactForm.contactValue}
                                onChange={(e) => setContactForm({ ...contactForm, contactValue: e.target.value })}
                                placeholder={t.contactZaloPlaceholder || "Nhập số điện thoại Zalo..."}
                                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 transition-all outline-hidden focus:border-blue-500"
                              />
                              <MessageCircle size={13} className="absolute left-2.5 top-2.5 text-blue-500" />
                            </>
                          ) : (
                            <>
                              <input
                                type="text"
                                required
                                value={contactForm.contactValue}
                                onChange={(e) => setContactForm({ ...contactForm, contactValue: e.target.value })}
                                placeholder={t.contactFbPlaceholder || "Nhập link Facebook hoặc username..."}
                                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 transition-all outline-hidden focus:border-sky-500"
                              />
                              <Share2 size={13} className="absolute left-2.5 top-2.5 text-sky-500" />
                            </>
                          )}
                        </div>
                      </div>

                      {/* Công ty */}
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
                          <Briefcase size={13} className="absolute left-2.5 top-2 text-slate-400" />
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
