import { motion } from "framer-motion";
import { MapPin, DollarSign, Calendar, Bookmark, BookmarkCheck, ExternalLink, Layers, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useLang } from "../context/LangContext";
import type { JobPost } from "../types";
import { getEnumLabels, formatDate } from "../lib/format";
import { EMPLOYMENT_BADGE, isDeadlinePassed, salaryRange } from "../lib/ui";
import Badge from "./Badge";

interface Props {
  job: JobPost;
  compact?: boolean;
  saved?: boolean;
  onToggleSave?: (jobId: string) => void;
  selectedForCompare?: boolean;
  compareLabel?: string;
  onToggleCompare?: (job: JobPost) => void;
}

export default function JobCard({
  job,
  compact = false,
  saved = false,
  onToggleSave,
  selectedForCompare = false,
  compareLabel,
  onToggleCompare,
}: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { lang, t } = useLang();
  const company = job.company;
  const expired = isDeadlinePassed(job.deadline_at);
  const enumLabels = getEnumLabels(lang);

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      navigate("/login");
      return;
    }
    onToggleSave?.(job.id);
  };

  const handleCompare = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleCompare?.(job);
  };

  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(99,102,241,0.12)" }}
      transition={{ duration: 0.18 }}
      className="group bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-3.5 sm:p-4 cursor-pointer relative overflow-hidden shadow-xs hover:border-indigo-200 dark:hover:border-indigo-700"
      onClick={() => navigate(`/jobs/${job.id}`)}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/0 to-purple-50/0 group-hover:from-indigo-50/40 group-hover:to-purple-50/20 dark:group-hover:from-indigo-950/15 dark:group-hover:to-purple-950/10 transition-all duration-300 pointer-events-none" />

      <div className="relative">
        <div className="flex items-start justify-between gap-2.5 mb-2.5">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-slate-100 dark:bg-slate-700/70 overflow-hidden shrink-0 border border-slate-200/60 dark:border-slate-600/50">
              {company?.logo_storage_path ? (
                <img src={company.logo_storage_path} alt={company.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm sm:text-base font-bold text-indigo-600 dark:text-indigo-400">
                  {(company?.name || "?")[0]}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">{company?.name || (lang === "en" ? "Company" : "Công ty")}</p>
              <h3 className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white leading-snug line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {job.title}
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onToggleCompare && (
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={handleCompare}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  selectedForCompare
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-200 dark:border-slate-700"
                }`}
                title={selectedForCompare ? t.compareDeselect : t.compareAdd}
              >
                {selectedForCompare ? (
                  <>
                    <Check size={11} className="stroke-[3]" />
                    <span>{compareLabel ? `${t.compareJobAction} (${compareLabel})` : t.compareSelected}</span>
                  </>
                ) : (
                  <>
                    <Layers size={11} />
                    <span>{t.compareJobAction}</span>
                  </>
                )}
              </motion.button>
            )}

            {onToggleSave && (
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={handleSave}
                className={`p-1.5 rounded-lg transition-all shrink-0 ${
                  saved
                    ? "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30"
                    : "text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                }`}
                title={saved ? t.unsaveJob : t.saveJob}
              >
                {saved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
              </motion.button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-2.5">
          <Badge variant={EMPLOYMENT_BADGE[job.employment_type] || "muted"}>
            {enumLabels.employment_type[job.employment_type] || job.employment_type}
          </Badge>
          {expired ? <Badge variant="danger">{t.expired}</Badge> : <Badge variant="success">{t.hiring}</Badge>}
        </div>

        <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <MapPin size={12} className="text-slate-400 shrink-0" />
            <span className="truncate">{job.location || (lang === "en" ? "Nationwide" : "Toàn quốc")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <DollarSign size={12} className="text-emerald-500 shrink-0" />
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">{salaryRange(job, lang)}</span>
          </div>
          {!compact && (
            <div className="flex items-center gap-1.5">
              <Calendar size={12} className="text-slate-400 shrink-0" />
              <span>{t.deadline}: {formatDate(job.deadline_at, false, lang)}</span>
            </div>
          )}
        </div>

        {!compact && (
          <p className="mt-2.5 text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
            {job.description}
          </p>
        )}

        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">{t.postedAt(formatDate(job.published_at || job.created_at, false, lang))}</span>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 group-hover:gap-1.5 transition-all">
            {t.viewDetails} <ExternalLink size={10} />
          </span>
        </div>
      </div>
    </motion.div>
  );
}

