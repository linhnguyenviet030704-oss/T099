import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, MapPin, DollarSign, Calendar, Globe, Link2,
  Bookmark, BookmarkCheck, Send, CheckCircle2, AlertTriangle, ChevronRight, ExternalLink,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { JOB_TYPE_LABELS, formatSalary, formatDate, isExpired, APP_STATUS_LABELS, APP_STATUS_COLORS } from "../data/mockData";
import Badge from "../components/Badge";
import AnimatedPage from "../components/AnimatedPage";
import JobCard from "../components/JobCard";

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser, jobs, companies, applications, cvFiles, savedJobs, toggleSaveJob, applyToJob } = useApp();

  const job = jobs.find((j) => j.id === id);
  const company = job ? companies.find((c) => c.id === job.companyId) : null;

  const [selectedCv, setSelectedCv] = useState(cvFiles.find((c) => c.isDefault)?.id || "");
  const [coverLetter, setCoverLetter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!job || !company) {
    return (
      <AnimatedPage className="min-h-screen flex flex-col items-center justify-center gap-4 text-slate-600 dark:text-slate-400">
        <div className="text-5xl">😕</div>
        <h2 className="font-display text-xl font-bold text-slate-800 dark:text-white">Không tìm thấy tin tuyển dụng</h2>
        <button onClick={() => navigate("/jobs")} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
          Quay lại danh sách
        </button>
      </AnimatedPage>
    );
  }

  const expired = isExpired(job.deadline);
  const isSaved = savedJobs.has(job.id);
  const userCVs = currentUser ? cvFiles.filter((c) => c.userId === currentUser.id) : [];
  const existingApp = currentUser ? applications.find((a) => a.jobId === job.id && a.candidateId === currentUser.id) : null;

  const similarJobs = jobs.filter((j) => j.id !== job.id && j.companyId === job.companyId && j.status === "active").slice(0, 3);

  const handleApply = async () => {
    if (!selectedCv) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 800));
    applyToJob(job.id, selectedCv, coverLetter);
    setSubmitting(false);
    setSubmitted(true);
  };

  const renderApplyColumn = () => {
    // Case 1: not logged in
    if (!currentUser) {
      return (
        <div className="p-6 text-center">
          <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">Đăng nhập để ứng tuyển vị trí này</p>
          <div className="flex flex-col gap-2">
            <Link to="/login" className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm text-center transition-colors">Đăng nhập</Link>
            <Link to="/register" className="w-full py-2.5 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-xl text-sm text-center hover:border-indigo-300 transition-colors">Đăng ký</Link>
          </div>
        </div>
      );
    }

    // Case 2: already applied
    if (existingApp) {
      const appStatus = existingApp.status;
      return (
        <div className="p-6">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={18} className="text-emerald-500" />
            <span className="font-semibold text-slate-800 dark:text-white text-sm">Đã nộp đơn</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Ngày nộp: {formatDate(existingApp.submittedAt)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">CV: {cvFiles.find((c) => c.id === existingApp.cvId)?.name || "N/A"}</p>
          <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium mb-4 ${APP_STATUS_COLORS[appStatus]}`}>
            {APP_STATUS_LABELS[appStatus]}
          </span>
          <Link to="/applications" className="block w-full py-2.5 text-center border border-indigo-200 text-indigo-600 font-medium rounded-xl text-sm hover:bg-indigo-50 transition-colors">
            Đến Đơn của tôi
          </Link>
        </div>
      );
    }

    // Case 3: no CV
    if (userCVs.length === 0) {
      return (
        <div className="p-6 text-center">
          <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">Bạn chưa có CV. Tải CV lên để ứng tuyển.</p>
          <Link to="/cv-vault" className="block w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm text-center transition-colors">
            Đến Tủ hồ sơ/CV
          </Link>
        </div>
      );
    }

    // Case 4: expired
    if (expired) {
      return (
        <div className="p-6 text-center">
          <Badge variant="danger" size="md" className="mb-3">Hết hạn nộp đơn</Badge>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Tin tuyển dụng này đã hết hạn.</p>
        </div>
      );
    }

    // Case 5: success
    if (submitted) {
      return (
        <div className="p-6 text-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300 }}>
            <CheckCircle2 size={40} className="text-emerald-500 mx-auto mb-3" />
          </motion.div>
          <p className="font-semibold text-slate-800 dark:text-white mb-1">Nộp đơn thành công!</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Nhà tuyển dụng sẽ liên hệ bạn sớm.</p>
          <Link to="/applications" className="block text-sm text-indigo-600 hover:underline">Xem đơn của tôi</Link>
        </div>
      );
    }

    // Default: can apply
    return (
      <div className="p-6 space-y-4">
        <h3 className="font-semibold text-slate-800 dark:text-white">Ứng tuyển ngay</h3>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Chọn CV</label>
          <select
            value={selectedCv}
            onChange={(e) => setSelectedCv(e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {userCVs.map((cv) => (
              <option key={cv.id} value={cv.id}>{cv.name}{cv.isDefault ? " (mặc định)" : ""}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Thư giới thiệu <span className="text-slate-400 font-normal">(tùy chọn)</span>
          </label>
          <textarea
            value={coverLetter}
            onChange={(e) => setCoverLetter(e.target.value)}
            maxLength={5000}
            rows={5}
            placeholder="Giới thiệu bản thân và lý do bạn phù hợp với vị trí này..."
            className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <p className="text-xs text-slate-400 mt-1 text-right">{coverLetter.length}/5000</p>
        </div>
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleApply}
          disabled={!selectedCv || submitting}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
        >
          {submitting ? (
            <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Đang nộp...</>
          ) : (<><Send size={15} />Nộp đơn</>)}
        </motion.button>
      </div>
    );
  };

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link to="/jobs" className="hover:text-indigo-600 flex items-center gap-1 transition-colors">
            <ArrowLeft size={14} /> Việc làm
          </Link>
          <ChevronRight size={14} />
          <span className="text-slate-700 dark:text-slate-300 truncate">{job.title}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Job header */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-7 border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-700 overflow-hidden flex-shrink-0">
                  {company.logo ? (
                    <img src={company.logo} alt={company.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-indigo-600">{company.name[0]}</div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white leading-tight">{job.title}</h1>
                      <p className="text-slate-600 dark:text-slate-400 mt-1">{company.name}</p>
                    </div>
                    <button
                      onClick={() => currentUser ? toggleSaveJob(job.id) : navigate("/login")}
                      className={`p-2.5 rounded-xl border transition-all flex-shrink-0 ${isSaved ? "bg-indigo-50 border-indigo-200 text-indigo-600" : "border-slate-200 dark:border-slate-600 text-slate-400 hover:border-indigo-300 hover:text-indigo-600"}`}
                    >
                      {isSaved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3">
                    <Badge variant="primary">{JOB_TYPE_LABELS[job.type]}</Badge>
                    {expired ? <Badge variant="danger">Hết hạn</Badge> : <Badge variant="success">Đang tuyển</Badge>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign size={16} className="text-emerald-500" />
                  <div><p className="text-xs text-slate-500">Mức lương</p><p className="font-medium text-slate-800 dark:text-white">{formatSalary(job)}</p></div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin size={16} className="text-blue-500" />
                  <div><p className="text-xs text-slate-500">Địa điểm</p><p className="font-medium text-slate-800 dark:text-white">{job.location}</p></div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar size={16} className="text-orange-500" />
                  <div><p className="text-xs text-slate-500">Hạn nộp</p><p className="font-medium text-slate-800 dark:text-white">{formatDate(job.deadline)}</p></div>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-7 border border-slate-200 dark:border-slate-700 shadow-sm">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white mb-4">Mô tả công việc</h2>
              <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed prose-content whitespace-pre-line">{job.description}</div>
            </div>

            {job.requirements && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-7 border border-slate-200 dark:border-slate-700 shadow-sm">
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white mb-4">Yêu cầu</h2>
                <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed prose-content whitespace-pre-line">{job.requirements}</div>
              </div>
            )}

            {job.benefits && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-7 border border-slate-200 dark:border-slate-700 shadow-sm">
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white mb-4">Phúc lợi</h2>
                <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed prose-content whitespace-pre-line">{job.benefits}</div>
              </div>
            )}

            {/* Company info */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-7 border border-slate-200 dark:border-slate-700 shadow-sm">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white mb-4">Về {company.name}</h2>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-4">{company.description}</p>
              <div className="flex flex-wrap gap-3">
                {company.website && <a href={company.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-indigo-600 hover:underline"><Globe size={13} /> Website</a>}
                {company.facebook && <a href={company.facebook} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline">Facebook</a>}
                {company.linkedin && <a href={company.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-sky-600 hover:underline"><Link2 size={13} /> LinkedIn</a>}
                {company.twitter && <a href={company.twitter} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-slate-600 hover:underline">Twitter / X</a>}
              </div>
            </div>

            {/* Similar jobs */}
            {similarJobs.length > 0 && (
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white mb-4">Việc tương tự</h2>
                <div className="space-y-4">
                  {similarJobs.map((j) => <JobCard key={j.id} job={j} company={companies.find((c) => c.id === j.companyId)!} compact />)}
                </div>
              </div>
            )}
          </div>

          {/* Apply column */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                {renderApplyColumn()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AnimatedPage>
  );
}
