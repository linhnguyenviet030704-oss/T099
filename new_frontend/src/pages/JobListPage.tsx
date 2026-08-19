import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Filter, X, Bookmark } from "lucide-react";
import { useApp } from "../context/AppContext";
import { JOB_TYPE_LABELS, type JobType } from "../data/mockData";
import JobCard from "../components/JobCard";
import AnimatedPage from "../components/AnimatedPage";
import { staggerContainer, fadeUp } from "../components/AnimatedPage";
import Badge from "../components/Badge";

const JOB_TYPES: JobType[] = ["full-time", "part-time", "internship", "contract", "remote", "hybrid"];

export default function JobListPage() {
  const { jobs, companies, currentUser, savedJobs } = useApp();
  const [query, setQuery] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<JobType[]>([]);
  const [location, setLocation] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const activeJobs = jobs.filter((j) => j.status === "active");

  const filtered = useMemo(() => {
    return activeJobs.filter((j) => {
      const company = companies.find((c) => c.id === j.companyId);
      const q = query.toLowerCase();
      if (query && !j.title.toLowerCase().includes(q) && !company?.name.toLowerCase().includes(q) && !j.location.toLowerCase().includes(q) && !j.description.toLowerCase().includes(q)) return false;
      if (selectedTypes.length && !selectedTypes.includes(j.type)) return false;
      if (location && !j.location.toLowerCase().includes(location.toLowerCase())) return false;
      if (savedOnly && !savedJobs.has(j.id)) return false;
      return true;
    });
  }, [activeJobs, query, selectedTypes, location, savedOnly, savedJobs, companies]);

  const toggleType = (t: JobType) =>
    setSelectedTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const clearFilters = () => { setQuery(""); setSelectedTypes([]); setLocation(""); setSavedOnly(false); };
  const hasFilters = query || selectedTypes.length || location || savedOnly;

  const locations = [...new Set(activeJobs.map((j) => j.location))];

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white mb-2">Việc làm</h1>
          <p className="text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-indigo-600">{filtered.length}</span> tin đang tuyển /&nbsp;
            <span className="text-slate-600 dark:text-slate-300">{activeJobs.length}</span> tổng tin
          </p>

          {/* Search bar */}
          <div className="mt-6 flex gap-3">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tiêu đề, công ty, địa điểm, mô tả..."
                className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
              {query && (
                <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={16} />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border font-medium text-sm transition-all ${
                showFilters || hasFilters
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200"
                  : "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-indigo-300"
              }`}
            >
              <Filter size={16} />
              Lọc
              {hasFilters && <span className="w-5 h-5 bg-white/30 rounded-full text-xs flex items-center justify-center">{(selectedTypes.length + (location ? 1 : 0) + (savedOnly ? 1 : 0))}</span>}
            </button>
          </div>

          {/* Filters panel */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-4 p-5 bg-slate-50 dark:bg-slate-700/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4">
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Loại hình</p>
                    <div className="flex flex-wrap gap-2">
                      {JOB_TYPES.map((t) => (
                        <button
                          key={t}
                          onClick={() => toggleType(t)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
                            selectedTypes.includes(t)
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-indigo-300"
                          }`}
                        >
                          {JOB_TYPE_LABELS[t]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Địa điểm</p>
                      <select
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        className="w-full px-3 py-2.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">Tất cả địa điểm</option>
                        {locations.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>

                    {currentUser && (
                      <div className="flex items-end">
                        <button
                          onClick={() => setSavedOnly((v) => !v)}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                            savedOnly
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600"
                          }`}
                        >
                          <Bookmark size={14} />
                          Đã lưu ({savedJobs.size})
                        </button>
                      </div>
                    )}
                  </div>

                  {hasFilters && (
                    <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1">
                      <X size={12} /> Xóa tất cả bộ lọc
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Job grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <div className="text-5xl mb-4">🔍</div>
            <h3 className="font-display text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">Không tìm thấy kết quả</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">Thử điều chỉnh từ khóa hoặc bộ lọc của bạn</p>
            <button onClick={clearFilters} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors">
              Xóa bộ lọc
            </button>
          </motion.div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {filtered.map((job) => {
              const company = companies.find((c) => c.id === job.companyId)!;
              return (
                <motion.div key={job.id} variants={fadeUp}>
                  <JobCard job={job} company={company} />
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
    </AnimatedPage>
  );
}
