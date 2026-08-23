import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Filter, X, Bookmark } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabase";
import type { EmploymentType, JobPost } from "../types";
import { ENUM_LABELS } from "../lib/format";
import JobCard from "../components/JobCard";
import AnimatedPage, { staggerContainer, fadeUp } from "../components/AnimatedPage";

import { JobCardSkeleton } from "../components/ui/Skeleton";
import { useToast } from "../context/ToastContext";

const JOB_TYPES = Object.keys(ENUM_LABELS.employment_type) as EmploymentType[];

export default function JobListPage() {
  const { user } = useAuth();
  const { success, info } = useToast();
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<EmploymentType[]>([]);
  const [location, setLocation] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data, error: qErr } = await supabase
          .from("job_posts")
          .select("*, companies(*)")
          .eq("status", "published")
          .order("published_at", { ascending: false });
        if (qErr) throw qErr;
        if (cancelled) return;
        setJobs(((data || []) as any[]).map((job) => ({ ...job, company: job.companies })) as JobPost[]);
        if (user) {
          const { data: savedData } = await supabase.from("saved_jobs").select("job_post_id").eq("user_id", user.id);
          if (!cancelled) setSavedIds((savedData || []).map((row: { job_post_id: string }) => row.job_post_id));
        } else {
          setSavedIds([]);
        }
      } catch {
        if (!cancelled) setError("Không tải được danh sách việc làm.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleToggleSaved = async (jobId: string) => {
    if (!supabase || !user) return;
    const isSaved = savedIds.includes(jobId);
    setSavedIds((ids) => (isSaved ? ids.filter((id) => id !== jobId) : [...ids, jobId]));
    if (isSaved) {
      info("Đã bỏ lưu việc làm");
    } else {
      success("Đã lưu việc làm thành công!");
    }
    const { error: saveErr } = isSaved
      ? await supabase.from("saved_jobs").delete().eq("user_id", user.id).eq("job_post_id", jobId)
      : await supabase.from("saved_jobs").insert({ user_id: user.id, job_post_id: jobId });
    if (saveErr) {
      setSavedIds((ids) => (isSaved ? [...ids, jobId] : ids.filter((id) => id !== jobId)));
    }
  };

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      const q = query.toLowerCase();
      if (query && !j.title.toLowerCase().includes(q) && !(j.company?.name || "").toLowerCase().includes(q) && !(j.location || "").toLowerCase().includes(q) && !(j.description || "").toLowerCase().includes(q)) return false;
      if (selectedTypes.length && !selectedTypes.includes(j.employment_type)) return false;
      if (location && j.location !== location) return false;
      if (savedOnly && !savedIds.includes(j.id)) return false;
      return true;
    });
  }, [jobs, query, selectedTypes, location, savedOnly, savedIds]);

  const toggleType = (t: EmploymentType) =>
    setSelectedTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const clearFilters = () => { setQuery(""); setSelectedTypes([]); setLocation(""); setSavedOnly(false); };
  const hasFilters = query || selectedTypes.length || location || savedOnly;
  const locations = [...new Set(jobs.map((j) => j.location).filter(Boolean))] as string[];

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white mb-2">Việc làm</h1>
          <p className="text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-indigo-600">{filtered.length}</span> tin đang tuyển
          </p>
          <div className="mt-6 flex gap-3">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tiêu đề, công ty, địa điểm, mô tả..."
                className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowFilters((v) => !v)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border font-medium text-sm transition-colors ${showFilters || hasFilters ? "bg-indigo-600 text-white border-indigo-600" : "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200"}`}
            >
              <Filter size={16} /> Lọc
            </motion.button>
          </div>
          <AnimatePresence>
            {showFilters && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="mt-4 p-5 bg-slate-50 dark:bg-slate-700/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {JOB_TYPES.map((t) => (
                      <motion.button
                        key={t}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => toggleType(t)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${selectedTypes.includes(t) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200"}`}
                      >
                        {ENUM_LABELS.employment_type[t]}
                      </motion.button>
                    ))}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <select value={location} onChange={(e) => setLocation(e.target.value)} className="flex-1 px-3 py-2.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm">
                      <option value="">Tất cả địa điểm</option>
                      {locations.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                    {user && (
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setSavedOnly((v) => !v)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${savedOnly ? "bg-indigo-600 text-white border-indigo-600" : "bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200"}`}
                      >
                        <Bookmark size={14} /> Đã lưu ({savedIds.length})
                      </motion.button>
                    )}
                  </div>
                  {hasFilters && <button onClick={clearFilters} className="text-xs text-red-500 font-medium hover:underline">Xóa tất cả bộ lọc</button>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <JobCardSkeleton count={6} />
          </div>
        ) : error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <h3 className="font-display text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">Không tìm thấy kết quả</h3>
            <button onClick={clearFilters} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl">Xóa bộ lọc</button>
          </div>
        ) : (
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((job) => (
              <motion.div key={job.id} variants={fadeUp}>
                <JobCard job={job} saved={savedIds.includes(job.id)} onToggleSave={handleToggleSaved} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </AnimatedPage>
  );
}
