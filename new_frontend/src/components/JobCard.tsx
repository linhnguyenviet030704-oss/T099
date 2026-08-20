import { motion } from "framer-motion";
import { MapPin, DollarSign, Calendar, Bookmark, BookmarkCheck, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import type { JobPost } from "../types";
import { ENUM_LABELS, formatDate } from "../lib/format";
import { EMPLOYMENT_BADGE, isDeadlinePassed, salaryRange } from "../lib/ui";
import Badge from "./Badge";

interface Props {
  job: JobPost;
  compact?: boolean;
  saved?: boolean;
  onToggleSave?: (jobId: string) => void;
}

export default function JobCard({ job, compact = false, saved = false, onToggleSave }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const company = job.company;
  const expired = isDeadlinePassed(job.deadline_at);

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      navigate("/login");
      return;
    }
    onToggleSave?.(job.id);
  };

  return (
    <motion.div
      whileHover={{ y: -3, boxShadow: "0 12px 32px rgba(99,102,241,0.12)" }}
      transition={{ duration: 0.2 }}
      className="group bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 cursor-pointer relative overflow-hidden"
      onClick={() => navigate(`/jobs/${job.id}`)}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/0 to-purple-50/0 group-hover:from-indigo-50/60 group-hover:to-purple-50/30 dark:group-hover:from-indigo-950/20 dark:group-hover:to-purple-950/10 transition-all duration-300 pointer-events-none" />

      <div className="relative">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-700 overflow-hidden flex-shrink-0">
              {company?.logo_storage_path ? (
                <img src={company.logo_storage_path} alt={company.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-lg font-bold text-indigo-600">
                  {(company?.name || "?")[0]}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{company?.name || "Công ty"}</p>
              <h3 className="font-semibold text-slate-900 dark:text-white leading-tight line-clamp-2 group-hover:text-indigo-600 transition-colors">
                {job.title}
              </h3>
            </div>
          </div>
          {onToggleSave && (
            <button
              onClick={handleSave}
              className={`p-2 rounded-xl transition-all flex-shrink-0 ${
                saved
                  ? "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30"
                  : "text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
              }`}
            >
              {saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <Badge variant={EMPLOYMENT_BADGE[job.employment_type] || "muted"}>
            {ENUM_LABELS.employment_type[job.employment_type] || job.employment_type}
          </Badge>
          {expired ? <Badge variant="danger">Hết hạn</Badge> : <Badge variant="success">Đang tuyển</Badge>}
        </div>

        <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <MapPin size={12} className="text-slate-400 flex-shrink-0" />
            <span className="truncate">{job.location || "Toàn quốc"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <DollarSign size={12} className="text-emerald-500 flex-shrink-0" />
            <span className="font-medium text-emerald-700 dark:text-emerald-400">{salaryRange(job)}</span>
          </div>
          {!compact && (
            <div className="flex items-center gap-1.5">
              <Calendar size={12} className="text-slate-400 flex-shrink-0" />
              <span>Hạn nộp: {formatDate(job.deadline_at)}</span>
            </div>
          )}
        </div>

        {!compact && (
          <p className="mt-3 text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
            {job.description}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-slate-400">Đăng ngày {formatDate(job.published_at || job.created_at)}</span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 group-hover:gap-2 transition-all">
            Xem chi tiết <ExternalLink size={11} />
          </span>
        </div>
      </div>
    </motion.div>
  );
}
