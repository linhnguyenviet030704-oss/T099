// Trang Liên hệ & FAQ - NextJob AI
// Hỗ trợ form gửi yêu cầu, thông tin kênh liên lạc trực tiếp và danh sách câu hỏi thường gặp

import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Mail,
  LifeBuoy,
  Handshake,
  MapPin,
  Clock,
  ShieldCheck,
  Eye,
  UserCheck,
  ChevronDown,
  CheckCircle2,
  ArrowRight,
  Send,
  Building2,
  User,
  MessageCircle,
  Share2,
} from "lucide-react";
import { useLang } from "../context/LangContext";
import { useToast } from "../context/ToastContext";
import AnimatedPage, { fadeUp, staggerContainer } from "../components/AnimatedPage";

export default function ContactPage() {
  const { t, lang } = useLang();
  const { success } = useToast();

  // Trạng thái form liên hệ
  const [formData, setFormData] = useState({
    name: "",
    channel: "email" as "email" | "zalo" | "facebook",
    contactValue: "",
    company: "",
    role: "",
    need: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Trạng thái mở/đóng FAQ
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex((prev) => (prev === index ? null : index));
  };

  // Xử lý gửi biểu mẫu liên hệ
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Mô phỏng gửi dữ liệu
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
      success(t.contactSuccessTitle || (lang === "en" ? "Request sent successfully!" : "Yêu cầu đã được gửi thành công!"));
    }, 600);
  };

  // Đặt lại biểu mẫu để gửi yêu cầu mới
  const handleResetForm = () => {
    setFormData({
      name: "",
      channel: "email",
      contactValue: "",
      company: "",
      role: "",
      need: "",
      message: "",
    });
    setIsSubmitted(false);
  };

  // Danh sách các kênh liên hệ
  const contactChannels = [
    {
      title: t.contactSales,
      email: t.contactSalesEmail,
      icon: Mail,
      iconColor: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200/60 dark:border-indigo-800/40",
      description: lang === "en" ? "Product demos, enterprise pricing & customized pilots" : "Demo giải pháp, bảng giá doanh nghiệp & thử nghiệm thí điểm",
    },
    {
      title: t.contactSupport,
      email: t.contactSupportEmail,
      icon: LifeBuoy,
      iconColor: "text-sky-600 bg-sky-50 dark:bg-sky-950/40 border-sky-200/60 dark:border-sky-800/40",
      description: lang === "en" ? "Technical support, account management & bug reports" : "Hỗ trợ kỹ thuật, tài khoản & giải đáp quy trình",
    },
    {
      title: t.contactPartnership,
      email: t.contactPartnershipEmail,
      icon: Handshake,
      iconColor: "text-purple-600 bg-purple-50 dark:bg-purple-950/40 border-purple-200/60 dark:border-purple-800/40",
      description: lang === "en" ? "ATS integrations, campus recruiting & university alliances" : "Tích hợp ATS, hợp tác tuyển dụng trường học & đối tác công nghệ",
    },
  ];

  // Danh sách thẻ giá trị cốt lõi / Trust points
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

  // Danh sách các câu hỏi thường gặp FAQ
  const faqItems = [
    { q: t.faqQ1, a: t.faqA1 },
    { q: t.faqQ2, a: t.faqA2 },
    { q: t.faqQ3, a: t.faqA3 },
    { q: t.faqQ4, a: t.faqA4 },
    { q: t.faqQ5, a: t.faqA5 },
  ];

  return (
    <AnimatedPage>
      <div className="min-h-screen bg-slate-50/60 dark:bg-slate-900 pb-16 transition-colors">
        {/* Header / Hero Section - Compact */}
        <section className="relative overflow-hidden pt-8 pb-10 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[320px] bg-gradient-to-b from-indigo-100/50 via-purple-50/30 to-transparent dark:from-indigo-900/15 dark:via-purple-900/10 dark:to-transparent rounded-full blur-3xl" />
          </div>

          <div className="max-w-6xl mx-auto px-4 sm:px-6 relative">
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="max-w-3xl">
              <motion.div variants={fadeUp} className="mb-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                  <Sparkles size={13} className="text-indigo-500 animate-pulse" />
                  {t.contactBadge}
                </span>
              </motion.div>

              <motion.h1 variants={fadeUp} className="font-display text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-3 tracking-tight">
                {t.contactHeroTitle}
              </motion.h1>

              <motion.p variants={fadeUp} className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                {t.contactHeroDesc}
              </motion.p>
            </motion.div>
          </div>
        </section>

        {/* Section Contact Grid - 2 Columns Compact */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Cột trái: Kênh liên lạc & Thẻ tin cậy (5 cột) */}
            <div className="lg:col-span-5 space-y-4">
              {/* Danh sách kênh liên lạc trực tiếp */}
              <div className="bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-sm">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-400 mb-3.5">
                  {lang === "en" ? "Direct Channels" : "Kênh liên lạc trực tiếp"}
                </h2>

                <div className="space-y-3">
                  {contactChannels.map((c) => (
                    <a
                      key={c.email}
                      href={`mailto:${c.email}`}
                      className="group flex items-start gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all"
                    >
                      <div className={`p-2 rounded-lg border ${c.iconColor} shrink-0 mt-0.5 group-hover:scale-105 transition-transform`}>
                        <c.icon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-800 dark:text-white leading-snug">
                          {c.title}
                        </p>
                        <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 truncate">
                          {c.email}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                          {c.description}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>

                {/* Thông tin văn phòng & thời gian phản hồi */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 space-y-2 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex items-start gap-2">
                    <MapPin size={14} className="text-slate-400 shrink-0 mt-0.5" />
                    <span>{t.contactAddress}</span>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
                    <Clock size={14} className="shrink-0" />
                    <span>{t.contactResponseTime}</span>
                  </div>
                </div>
              </div>

              {/* 3 Thẻ tin cậy (Trust Cards) */}
              <div className="space-y-2.5">
                {trustCards.map((card) => (
                  <div
                    key={card.title}
                    className="flex items-start gap-3 p-3.5 bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-xl shadow-xs"
                  >
                    <div className={`p-2 rounded-lg ${card.color} shrink-0 mt-0.5`}>
                      <card.icon size={15} />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                        {card.title}
                      </h3>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                        {card.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cột phải: Form liên hệ (7 cột) */}
            <div className="lg:col-span-7">
              <div className="bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-5 sm:p-6 shadow-sm">
                <div className="mb-4">
                  <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                    {t.contactFormTitle}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {t.contactFormDesc}
                  </p>
                </div>

                <AnimatePresence mode="wait">
                  {isSubmitted ? (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      className="text-center py-8 px-4"
                    >
                      <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3 border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 size={26} />
                      </div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1.5">
                        {t.contactSuccessTitle}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto mb-5 leading-relaxed">
                        {t.contactSuccessDesc}
                      </p>
                      <button
                        type="button"
                        onClick={handleResetForm}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 rounded-xl transition-colors cursor-pointer"
                      >
                        {t.contactSendAnother}
                      </button>
                    </motion.div>
                  ) : (
                    <motion.form
                      key="form"
                      onSubmit={handleSubmit}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-3.5"
                    >
                      {/* Họ và tên */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          {t.contactName} <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            required
                            autoComplete="name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder={t.contactNamePlaceholder}
                            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:bg-white dark:focus:bg-slate-900 transition-all outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                          />
                          <User size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                        </div>
                      </div>

                      {/* Kênh nhận phản hồi & Input liên hệ */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {t.contactChannelLabel || "Kênh nhận phản hồi"} <span className="text-rose-500">*</span>
                        </label>
                        
                        {/* Selector Tabs: Email / Zalo / Facebook */}
                        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-900/70 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, channel: "email" })}
                            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              formData.channel === "email"
                                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                            }`}
                          >
                            <Mail size={13} />
                            <span>Email</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, channel: "zalo" })}
                            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              formData.channel === "zalo"
                                ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                            }`}
                          >
                            <MessageCircle size={13} />
                            <span>Zalo</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, channel: "facebook" })}
                            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              formData.channel === "facebook"
                                ? "bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-xs"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                            }`}
                          >
                            <Share2 size={13} />
                            <span>Facebook</span>
                          </button>
                        </div>

                        {/* Input động tương ứng với Channel đã chọn */}
                        <div className="relative pt-1">
                          {formData.channel === "email" ? (
                            <>
                              <input
                                type="email"
                                required
                                autoComplete="email"
                                value={formData.contactValue}
                                onChange={(e) => setFormData({ ...formData, contactValue: e.target.value })}
                                placeholder={t.contactEmailPlaceholder}
                                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:bg-white dark:focus:bg-slate-900 transition-all outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                              />
                              <Mail size={14} className="absolute left-3 top-3.5 text-slate-400 pointer-events-none" />
                            </>
                          ) : formData.channel === "zalo" ? (
                            <>
                              <input
                                type="tel"
                                required
                                value={formData.contactValue}
                                onChange={(e) => setFormData({ ...formData, contactValue: e.target.value })}
                                placeholder={t.contactZaloPlaceholder || "Nhập số điện thoại Zalo (ví dụ: 0912 345 678)..."}
                                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:bg-white dark:focus:bg-slate-900 transition-all outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              />
                              <MessageCircle size={14} className="absolute left-3 top-3.5 text-blue-500 pointer-events-none" />
                            </>
                          ) : (
                            <>
                              <input
                                type="text"
                                required
                                value={formData.contactValue}
                                onChange={(e) => setFormData({ ...formData, contactValue: e.target.value })}
                                placeholder={t.contactFbPlaceholder || "Nhập link Facebook hoặc username (ví dụ: fb.com/username)..."}
                                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:bg-white dark:focus:bg-slate-900 transition-all outline-hidden focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                              />
                              <Share2 size={14} className="absolute left-3 top-3.5 text-sky-500 pointer-events-none" />
                            </>
                          )}
                        </div>
                      </div>

                      {/* Công ty / Tổ chức */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          {t.contactCompany}
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            autoComplete="organization"
                            value={formData.company}
                            onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                            placeholder={t.contactCompanyPlaceholder}
                            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:bg-white dark:focus:bg-slate-900 transition-all outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                          />
                          <Building2 size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                        </div>
                      </div>

                      {/* Hàng đôi: Vai trò + Nhu cầu chính */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            {t.contactRole}
                          </label>
                          <select
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 transition-all outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="">{t.contactRoleSelect}</option>
                            <option value="founder">{t.contactRoleFounder}</option>
                            <option value="hr-lead">{t.contactRoleHrLead}</option>
                            <option value="talent-acquisition">{t.contactRoleTa}</option>
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
                            value={formData.need}
                            onChange={(e) => setFormData({ ...formData, need: e.target.value })}
                            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 transition-all outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="">{t.contactNeedSelect}</option>
                            <option value="interview-copilot">{t.contactNeedInterview}</option>
                            <option value="cv-assessment">{t.contactNeedAssessment}</option>
                            <option value="evidence-scoring">{t.contactNeedEvidence}</option>
                            <option value="team-rollout">{t.contactNeedRollout}</option>
                            <option value="other">{t.contactNeedOther}</option>
                          </select>
                        </div>
                      </div>

                      {/* Textarea Nội dung */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          {t.contactMessage}
                        </label>
                        <div className="relative">
                          <textarea
                            rows={3}
                            value={formData.message}
                            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                            placeholder={t.contactMessagePlaceholder}
                            className="w-full p-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:bg-white dark:focus:bg-slate-900 transition-all outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none leading-relaxed"
                          />
                        </div>
                      </div>

                      {/* Nút gửi & Footnote */}
                      <div className="pt-1 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white text-xs font-semibold rounded-xl shadow-sm shadow-indigo-500/20 disabled:opacity-50 transition-all cursor-pointer"
                        >
                          {isSubmitting ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              <span>{t.contactSubmitting}</span>
                            </>
                          ) : (
                            <>
                              <Send size={13} />
                              <span>{t.contactSubmit}</span>
                            </>
                          )}
                        </button>

                        <p className="text-[11px] text-slate-400 text-center sm:text-right">
                          {t.contactFootnote}
                        </p>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </section>

        {/* Section FAQ - Interactive Accordion Compact */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12">
          <div className="bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-5 sm:p-7 shadow-sm">
            <div className="max-w-2xl mb-6">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 mb-2">
                <Sparkles size={11} className="text-indigo-500" />
                {t.faqBadge}
              </span>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                {t.faqTitle}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                {t.faqDesc}
              </p>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {faqItems.map((item, idx) => {
                const isOpen = openFaqIndex === idx;
                return (
                  <div key={idx} className="py-3">
                    <button
                      type="button"
                      onClick={() => toggleFaq(idx)}
                      className="w-full flex items-center justify-between gap-3 text-left py-1 group cursor-pointer focus:outline-hidden"
                      aria-expanded={isOpen}
                    >
                      <span className={`text-xs sm:text-sm font-semibold transition-colors ${isOpen ? "text-indigo-600 dark:text-indigo-400" : "text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400"}`}>
                        {item.q}
                      </span>
                      <ChevronDown
                        size={16}
                        className={`text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180 text-indigo-600 dark:text-indigo-400" : ""}`}
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <p className="pt-2 text-xs sm:text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
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
        </section>

        {/* Mini CTA Section ở cuối trang */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10">
          <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 rounded-2xl p-6 sm:p-8 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md">
            <div>
              <h3 className="font-display text-lg sm:text-xl font-bold">
                {lang === "en" ? "Ready to modernize your recruitment process?" : "Sẵn sàng nâng tầm quy trình tuyển dụng của bạn?"}
              </h3>
              <p className="text-xs sm:text-sm text-indigo-100 mt-1 max-w-xl">
                {lang === "en"
                  ? "Explore how AI Copilot can save your team 8x screening time with transparent evidence."
                  : "Khám phá cách AI Copilot giúp đội ngũ tiết kiệm 8x thời gian sàng lọc với chứng cứ minh bạch."}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link
                to="/jobs"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white text-indigo-700 hover:bg-indigo-50 text-xs font-bold rounded-xl transition-colors shadow-xs"
              >
                <span>{lang === "en" ? "Explore Jobs" : "Khám phá việc làm"}</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AnimatedPage>
  );
}
