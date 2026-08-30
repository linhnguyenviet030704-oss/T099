import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Search, Users, TrendingUp, Zap, Building2 } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useCurrentProfile } from "../profile/ProfileProvider";
import { useLang } from "../context/LangContext";
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
  const { profile, isRecruiter, isAdmin } = useCurrentProfile();
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [landingStats, setLandingStats] = useState<LandingStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

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
            // Chuyển sang phương thức tiếp theo nếu RPC chưa được tạo
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
            // Chuyển sang fallback truy vấn trực tiếp bảng công khai
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

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <section className="relative overflow-hidden pt-20 pb-28">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-gradient-to-br from-indigo-100/70 via-purple-50/50 to-pink-50/30 dark:from-indigo-900/20 dark:via-purple-900/10 dark:to-transparent rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative">
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="text-center max-w-4xl mx-auto">
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
              <Link to={ctaHref} className="inline-flex items-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-2xl shadow-lg shadow-indigo-200">
                {ctaLabel} <ArrowRight size={18} />
              </Link>
              <Link to="/jobs" className="inline-flex items-center gap-2 px-8 py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-2xl">
                <Search size={18} /> {t.searchJobs}
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section className="py-16 bg-slate-50 dark:bg-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-white dark:bg-slate-800 rounded-2xl p-6 text-center shadow-sm border border-slate-100 dark:border-slate-700">
              <div className={`w-12 h-12 rounded-xl ${stat.color} flex items-center justify-center mx-auto mb-3`}>
                <stat.icon size={22} />
              </div>
              <p className={`font-display text-3xl font-bold text-slate-900 dark:text-white transition-opacity duration-300 ${statsLoading && !landingStats ? "opacity-40 animate-pulse" : "opacity-100"}`}>
                {stat.value}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="font-display text-3xl font-bold text-slate-900 dark:text-white">{t.latestJobs}</h2>
              <p className="text-slate-500 dark:text-slate-400 mt-2">{t.latestJobsDesc}</p>
            </div>
            <Link to="/jobs" className="hidden sm:flex items-center gap-1 text-sm font-medium text-indigo-600">
              {t.viewAll} <ArrowRight size={15} />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-slate-50 dark:bg-slate-800/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((f) => (
            <button
              key={f.title}
              type="button"
              onClick={() => navigate(f.href)}
              className="text-left bg-white dark:bg-slate-800 rounded-2xl p-7 border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-xl transition-all"
            >
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${f.gradient} flex items-center justify-center text-2xl mb-5`}>{f.icon}</div>
              <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white mb-3">{f.title}</h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-5">{f.desc}</p>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600">{f.cta} <ArrowRight size={14} /></span>
            </button>
          ))}
        </div>
      </section>

      {!user && (
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 rounded-3xl p-12 text-center text-white">
              <h2 className="font-display text-4xl font-bold mb-4">{t.ctaTitle}</h2>
              <p className="text-indigo-200 text-lg mb-8">{t.ctaDesc}</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/register" className="inline-flex items-center gap-2 px-8 py-4 bg-white text-indigo-700 font-bold rounded-2xl">{t.registerFree}</Link>
                <Link to="/login" className="inline-flex items-center gap-2 px-8 py-4 border border-white/30 text-white font-semibold rounded-2xl">{t.login}</Link>
              </div>
            </div>
          </div>
        </section>
      )}

      <footer className="border-t border-slate-200 dark:border-slate-800 py-10 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center text-sm text-slate-500">
          <p className="mb-2 font-display font-bold text-lg text-slate-800 dark:text-white">Next<span className="text-indigo-600">Job</span></p>
          <p>{lang === "en" ? "© 2026 NextJob Vietnam. Smart recruitment platform." : "© 2026 NextJob Vietnam. Nền tảng tuyển dụng thông minh."}</p>
        </div>
      </footer>
    </div>
  );
}
