import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Building2,
  Video,
  CheckCircle2,
  AlertCircle,
  FileText,
  Plus,
  Trash2,
  Send,
  ExternalLink,
  DollarSign,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useCurrentProfile } from "../profile/ProfileProvider";
import { useLang } from "../context/LangContext";
import { useToast } from "../context/ToastContext";
import { supabase, handleSupabaseError } from "../lib/supabase";
import { getResumeSignedUrl } from "../lib/storage";
import { getEnumLabels, formatDate } from "../lib/format";
import { APP_STATUS_COLORS, salaryRange } from "../lib/ui";
import {
  getInterviewInvitation,
  candidateRespondInterview,
  recruiterConfirmReschedule,
  type InterviewInvitation,
} from "../lib/api-applications";
import type { Application, ApplicationStage, Profile } from "../types";
import AnimatedPage from "../components/AnimatedPage";
import Button from "../components/ui/Button";
import InterviewTimeSlotPicker, {
  InterviewTimeSlot,
  validateTimeSlots,
  toSlotApiString,
  formatSlotDisplay,
} from "../components/interview/InterviewTimeSlotPicker";

/**
 * Trang Chi tiết Đơn ứng tuyển & Chọn lịch hẹn phỏng vấn.
 * Hỗ trợ các trường hợp:
 * 1. Xem toàn bộ thông tin đơn ứng tuyển, CV, thư giới thiệu và timeline.
 * 2. Ứng viên: Chọn 1 mốc thời gian phỏng vấn phù hợp + popup cam kết "Tôi đồng ý và chắc chắn đúng hẹn".
 * 3. Ứng viên: Chọn "Không có lịch nào phù hợp" và đề xuất mốc thời gian mới cho nhà tuyển dụng.
 * 4. Nhà tuyển dụng: Xem chi tiết đơn, trạng thái phỏng vấn và chốt lịch khi ứng viên yêu cầu đổi lịch.
 */
export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useCurrentProfile();
  const { lang, t } = useLang();
  const { success, error: toastError } = useToast();

  const isRecruiter = profile?.role === "recruiter" || profile?.role === "admin";

  const [application, setApplication] = useState<Application | null>(null);
  const [applicantProfile, setApplicantProfile] = useState<Profile | null>(null);
  const [stages, setStages] = useState<ApplicationStage[]>([]);
  const [invitation, setInvitation] = useState<InterviewInvitation | null>(null);
  const [loading, setLoading] = useState(true);

  // State chọn mốc thời gian của Nhà tuyển dụng
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmittingConfirm, setIsSubmittingConfirm] = useState(false);

  // State đề xuất mốc thời gian mới (dùng InterviewTimeSlot)
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [customSlots, setCustomSlots] = useState<InterviewTimeSlot[]>([]);
  const [rescheduleNote, setRescheduleNote] = useState("");
  const [isSubmittingReschedule, setIsSubmittingReschedule] = useState(false);

  const enumLabels = getEnumLabels(lang);

  // Lấy dữ liệu đơn ứng tuyển và lịch phỏng vấn
  const loadData = useCallback(async () => {
    if (!id || !user || !supabase) return;
    try {
      setLoading(true);

      // 1. Tải thông tin đơn ứng tuyển
      const { data: appData, error: appErr } = await supabase
        .from("job_submits")
        .select("*, job_posts(*, companies(*))")
        .eq("id", id)
        .maybeSingle();

      if (appErr) throw appErr;
      if (!appData) {
        toastError(lang === "en" ? "Application not found" : "Không tìm thấy đơn ứng tuyển");
        navigate(isRecruiter ? "/dashboard" : "/applications");
        return;
      }

      const formattedApp: Application = {
        ...appData,
        job_post: { ...appData.job_posts, company: appData.job_posts?.companies },
      };
      setApplication(formattedApp);

      // Tải thông tin profile ứng viên nếu là recruiter xem
      if (appData.applicant_user_id) {
        const { data: profData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", appData.applicant_user_id)
          .maybeSingle();
        if (profData) setApplicantProfile(profData as Profile);
      }

      // 2. Tải lịch sử các giai đoạn
      const { data: stagesData } = await supabase
        .from("application_stages")
        .select("*")
        .eq("application_id", id)
        .order("created_at", { ascending: false });

      setStages((stagesData as ApplicationStage[]) || []);

      // 3. Tải thông tin lời mời phỏng vấn
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token) {
        try {
          const inv = await getInterviewInvitation(token, id);
          setInvitation(inv);
          if (inv && inv.proposed_time_slots && inv.proposed_time_slots.length > 0) {
            setSelectedSlot(inv.proposed_time_slots[0]);
          }
        } catch {
          // Bỏ qua lỗi nếu chưa có interview invitation
        }
      }
    } catch (err: unknown) {
      toastError(lang === "en" ? "Failed to load application" : "Không tải được thông tin đơn", handleSupabaseError(err));
    } finally {
      setLoading(false);
    }
  }, [id, user, isRecruiter, navigate, toastError, lang]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Xử lý khi nhà tuyển dụng chốt mốc thời gian do ứng viên đề xuất
  const handleRecruiterConfirmSlot = async (slot: string) => {
    if (!id) return;
    const { data: sessionData } = await supabase!.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return;
    try {
      const updated = await recruiterConfirmReschedule(token, id, {
        selected_slot: slot,
      });
      setInvitation(updated);
      success(lang === "en" ? "Interview confirmed!" : "Đã chốt lịch phỏng vấn theo khoảng thời gian của ứng viên!");
      await loadData();
    } catch (err: unknown) {
      toastError(lang === "en" ? "Failed to confirm" : "Chốt lịch thất bại", handleSupabaseError(err));
    }
  };

  // Xử lý khi ứng viên bấm Xác nhận lịch hẹn (Kịch bản 1)
  const handleConfirmSlot = async () => {
    if (!id || !selectedSlot) {
      toastError(lang === "en" ? "Please select a time slot" : "Vui lòng chọn một khoảng thời gian");
      return;
    }
    const { data: sessionData } = await supabase!.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return;

    setIsSubmittingConfirm(true);
    try {
      const updated = await candidateRespondInterview(token, id, {
        action: "confirm",
        selected_slot: selectedSlot,
      });
      setInvitation(updated);
      setShowConfirmModal(false);
      success(t.interviewConfirmedSuccess || "Đã xác nhận lịch phỏng vấn thành công!");
      await loadData();
    } catch (err: unknown) {
      toastError(lang === "en" ? "Failed to confirm interview" : "Xác nhận lịch phỏng vấn thất bại", handleSupabaseError(err));
    } finally {
      setIsSubmittingConfirm(false);
    }
  };

  // Mở form đề xuất lịch mới
  const handleOpenReschedule = () => {
    if (customSlots.length === 0) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      const tomorrowEnd = new Date(tomorrow.getTime() + 60 * 60 * 1000);
      setCustomSlots([
        {
          start_time: tomorrow.toISOString().slice(0, 16),
          end_time: tomorrowEnd.toISOString().slice(0, 16),
        },
      ]);
    }
    setIsRescheduling(true);
  };

  // Xử lý gửi đề xuất lịch mới (Kịch bản 2)
  const handleSendRescheduleProposal = async () => {
    const valResult = validateTimeSlots(customSlots, lang);
    if (!valResult.isValid) {
      toastError(valResult.error || (lang === "en" ? "Please verify proposed slots" : "Vui lòng kiểm tra lại các khoảng thời gian đề xuất"));
      return;
    }

    const { data: sessionData } = await supabase!.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return;

    setIsSubmittingReschedule(true);
    try {
      const apiSlots = customSlots.map(toSlotApiString);
      const updated = await candidateRespondInterview(token, id!, {
        action: "reschedule",
        proposed_time_slots: apiSlots,
        note: rescheduleNote.trim() || undefined,
      });
      setInvitation(updated);
      setIsRescheduling(false);
      success(t.rescheduleSentSuccess || "Đã gửi đề xuất lịch mới đến nhà tuyển dụng!");
      await loadData();
    } catch (err: unknown) {
      toastError(
        lang === "en" ? "Failed to submit proposal" : "Gửi đề xuất lịch thất bại",
        handleSupabaseError(err)
      );
    } finally {
      setIsSubmittingReschedule(false);
    }
  };


  // Định dạng ngày giờ hiển thị thân thiện (hỗ trợ cả dạng slot range lẫn ISO timestamp đơn lẻ)
  const formatSlotDateTime = (isoString: string) => {
    return formatSlotDisplay(isoString, lang);
  };

  if (loading) {
    return (
      <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900 py-10 px-4">
        <div className="max-w-4xl mx-auto text-center py-20">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{lang === "en" ? "Loading application details..." : "Đang tải chi tiết đơn ứng tuyển..."}</p>
        </div>
      </AnimatedPage>
    );
  }

  if (!application) return null;

  const job = application.job_post;
  const isInterviewStage = application.current_status === "interview";
  const hasInvitation = Boolean(invitation);
  const isConfirmed = invitation?.status === "confirmed";
  const isRescheduleRequested = invitation?.status === "reschedule_requested";

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6">
        {/* Nút quay lại */}
        <button
          onClick={() => navigate(isRecruiter ? "/dashboard" : "/applications")}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          <ArrowLeft size={16} />
          {isRecruiter ? (lang === "en" ? "Back to Dashboard" : "Quay lại Bàn tuyển dụng") : (t.backToApplications || "Quay lại danh sách đơn")}
        </button>

        {/* Thẻ Tiêu đề & Tổng quan việc làm */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {job?.title || "Vị trí tuyển dụng"}
                </h1>
                <Link
                  to={`/jobs/${job?.id}`}
                  target="_blank"
                  className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 p-1"
                  title={lang === "en" ? "Open job post" : "Xem bài đăng tuyển dụng"}
                >
                  <ExternalLink size={16} />
                </Link>
              </div>

              {/* Hiển thị thông tin Ứng viên cho Nhà tuyển dụng */}
              {isRecruiter && applicantProfile && (
                <div className="mt-2 text-xs text-indigo-700 dark:text-indigo-300 font-medium">
                  <span>{lang === "en" ? "Applicant:" : "Ứng viên:"} <strong>{applicantProfile.full_name || "Ứng viên"}</strong></span>
                  {applicantProfile.email && <span className="text-slate-500 dark:text-slate-400"> ({applicantProfile.email})</span>}
                </div>
              )}

              <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300 mt-2 flex-wrap">
                <span className="flex items-center gap-1 font-medium">
                  <Building2 size={15} className="text-slate-400" />
                  {job?.company?.name || "Doanh nghiệp"}
                </span>
                {job?.location && (
                  <span className="flex items-center gap-1">
                    <MapPin size={15} className="text-slate-400" />
                    {job.location}
                  </span>
                )}
                {job && (
                  <span className="flex items-center gap-1">
                    <DollarSign size={15} className="text-emerald-500" />
                    {salaryRange(job, lang)}
                  </span>
                )}
              </div>
            </div>


            <div className="flex items-center gap-2">
              <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${APP_STATUS_COLORS[application.current_status]}`}>
                {enumLabels.application_status[application.current_status]}
              </span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between flex-wrap gap-2">
            <span>{t.appliedAt(formatDate(application.applied_at, true, lang))}</span>
            {application.resume_storage_path_snapshot && (
              <button
                onClick={() => void getResumeSignedUrl(application.resume_storage_path_snapshot!).then((url) => window.open(url, "_blank"))}
                className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline inline-flex items-center gap-1"
              >
                <FileText size={13} />
                {t.openCV || "Mở xem CV đã nộp ↗"}
              </button>
            )}
          </div>
        </div>

        {/* Khối HẸN PHỎNG VẤN (Interview Scheduling Module) */}
        {isInterviewStage && (
          <div className="bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/70 dark:from-slate-800 dark:via-slate-800 dark:to-indigo-950/30 rounded-2xl border-2 border-indigo-200 dark:border-indigo-800/80 p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                  <Calendar size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    {t.interviewScheduleTitle || "Lịch hẹn phỏng vấn"}
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {t.interviewScheduleDesc || "Nhà tuyển dụng đã gửi lời mời phỏng vấn cho vị trí này."}
                  </p>
                </div>
              </div>

              {isConfirmed && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold rounded-full">
                  <CheckCircle2 size={13} />
                  {t.interviewStatusConfirmed || "Đã xác nhận lịch"}
                </span>
              )}

              {isRescheduleRequested && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-semibold rounded-full">
                  <Clock size={13} />
                  {t.interviewStatusReschedule || "Đã gửi đề xuất lịch mới"}
                </span>
              )}
            </div>

            {/* Thông tin phòng họp online / Địa điểm & Ghi chú của nhà tuyển dụng */}
            {(invitation?.meeting_link || invitation?.location || invitation?.note) && (
              <div className="bg-white/80 dark:bg-slate-700/50 rounded-xl p-4 border border-indigo-100 dark:border-slate-600 mb-5 space-y-2 text-xs">
                {invitation.meeting_link && (
                  <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-medium">
                    <Video size={15} />
                    <span>{t.meetingLink || "Link họp online:"}</span>
                    <a
                      href={invitation.meeting_link.startsWith("http") ? invitation.meeting_link : `https://${invitation.meeting_link}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-bold hover:text-indigo-900 dark:hover:text-indigo-100 truncate"
                    >
                      {invitation.meeting_link}
                    </a>
                  </div>
                )}

                {invitation.location && (
                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                    <MapPin size={15} className="text-slate-400" />
                    <span className="font-medium">{t.meetingLocation || "Địa điểm:"}</span>
                    <span>{invitation.location}</span>
                  </div>
                )}

                {invitation.note && (
                  <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300 pt-1">
                    <AlertCircle size={15} className="text-amber-500 mt-0.5 shrink-0" />
                    <span><strong>{t.recruiterNote || "Ghi chú:"}</strong> {invitation.note}</span>
                  </div>
                )}
              </div>
            )}

            {/* TRƯỜNG HỢP 1: ĐÃ XÁC NHẬN LỊCH (Confirmed) */}
            {isConfirmed && invitation?.scheduled_at && (
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-xl p-5 text-center">
                <CheckCircle2 size={36} className="text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
                <h3 className="text-base font-bold text-emerald-900 dark:text-emerald-200">
                  {lang === "en" ? "Your interview is scheduled!" : "Lịch phỏng vấn đã được chốt thành công!"}
                </h3>
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mt-1">
                  📅 {formatSlotDisplay(invitation.scheduled_at, lang)}
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-2">
                  {lang === "en"
                    ? "Please be ready 5 minutes before the meeting. Good luck!"
                    : "Vui lòng chuẩn bị và tham gia trước 5 phút. Chúc bạn có buổi phỏng vấn thuận lợi!"}
                </p>
                {invitation.meeting_link && (
                  <div className="mt-4">
                    <a
                      href={invitation.meeting_link.startsWith("http") ? invitation.meeting_link : `https://${invitation.meeting_link}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow transition-colors"
                    >
                      <Video size={14} />
                      {lang === "en" ? "Join Meeting Room" : "Tham gia phòng họp online"}
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* TRƯỜNG HỢP 2: ĐÃ ĐỀ XUẤT ĐỔI LỊCH (Reschedule Requested) */}
            {isRescheduleRequested && (
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl p-5">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-sm mb-2">
                  <Clock size={18} />
                  <span>{isRecruiter ? (lang === "en" ? "Candidate requested reschedule" : "Ứng viên đề xuất đổi lịch phỏng vấn") : (lang === "en" ? "Reschedule request pending" : "Đã gửi đề xuất khoảng thời gian mới")}</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">
                  {isRecruiter
                    ? (lang === "en"
                      ? "The candidate is unavailable for the proposed slots and has proposed new times below."
                      : "Ứng viên không thể tham gia các mốc đã đề xuất và gửi lại các khoảng thời gian bên dưới.")
                    : (lang === "en"
                      ? "You have submitted alternate time slots. The recruiter will review and confirm a suitable time."
                      : "Bạn đã gửi các khoảng thời gian mong muốn. Nhà tuyển dụng sẽ xem xét và phản hồi sớm nhất.")}
                </p>
                {invitation?.candidate_proposed_slots && invitation.candidate_proposed_slots.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {isRecruiter ? "Khoảng thời gian ứng viên đề xuất (bấm để chốt lịch):" : (t.candidateProposedSlotsLabel || "Khoảng thời gian bạn đã đề xuất:")}
                    </p>
                    {isRecruiter ? (
                      <div className="flex flex-wrap gap-2">
                        {invitation.candidate_proposed_slots.map((s, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => void handleRecruiterConfirmSlot(s)}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-sm inline-flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <CheckCircle2 size={13} /> Chốt lịch: {formatSlotDisplay(s, lang)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <ul className="list-disc list-inside text-xs text-slate-600 dark:text-slate-300 space-y-1">
                        {invitation.candidate_proposed_slots.map((s, idx) => (
                          <li key={idx}>{formatSlotDisplay(s, lang)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {invitation?.candidate_response_note && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 italic">
                    Ghi chú của ứng viên: "{invitation.candidate_response_note}"
                  </p>
                )}
              </div>
            )}

            {/* TRƯỜNG HỢP 3: CHỜ ỨNG VIÊN CHỌN LỊCH (Pending) */}
            {!isConfirmed && !isRescheduleRequested && hasInvitation && (
              <div className="space-y-5">
                {isRecruiter ? (
                  <div className="bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 rounded-xl p-4">
                    <h3 className="text-xs font-bold text-indigo-900 dark:text-indigo-200 uppercase tracking-wider mb-2">
                      Các khoảng thời gian đã gửi cho ứng viên (Đang chờ ứng viên lựa chọn):
                    </h3>
                    <ul className="list-disc list-inside text-xs text-slate-700 dark:text-slate-300 space-y-1">
                      {invitation?.proposed_time_slots?.map((slot, idx) => (
                        <li key={idx}>{formatSlotDisplay(slot, lang)}</li>
                      ))}
                    </ul>
                  </div>
                ) : !isRescheduling ? (
                  <>
                    <div>
                      <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-2.5">
                        {t.proposedSlots || "Các khoảng thời gian do Nhà tuyển dụng đề xuất:"}
                      </h3>

                      {invitation?.proposed_time_slots && invitation.proposed_time_slots.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {invitation.proposed_time_slots.map((slot) => {
                            const isSelected = selectedSlot === slot;
                            return (
                              <button
                                key={slot}
                                type="button"
                                onClick={() => setSelectedSlot(slot)}
                                className={`p-3.5 rounded-xl border text-left flex items-start justify-between gap-2 transition-all cursor-pointer ${
                                  isSelected
                                    ? "bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-300 dark:ring-indigo-800"
                                    : "bg-white dark:bg-slate-700/80 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 hover:border-indigo-400"
                                }`}
                              >
                                <div>
                                  <div className="flex items-center gap-1.5 font-semibold text-xs">
                                    <Clock size={13} className={isSelected ? "text-indigo-200" : "text-slate-400"} />
                                    <span>{formatSlotDisplay(slot, lang)}</span>
                                  </div>
                                </div>
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                                  isSelected ? "border-white bg-white" : "border-slate-300 dark:border-slate-500"
                                }`}>
                                  {isSelected && <div className="w-2 h-2 rounded-full bg-indigo-600" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                          Chưa có khoảng thời gian cụ thể. Vui lòng liên hệ nhà tuyển dụng.
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleOpenReschedule}
                        className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 underline transition-colors cursor-pointer"
                      >
                        {t.noSlotSuitable || "Không có lịch nào phù hợp"}
                      </button>

                      <Button
                        size="sm"
                        disabled={!selectedSlot}
                        onClick={() => setShowConfirmModal(true)}
                        leftIcon={<CheckCircle2 size={15} />}
                      >
                        {t.confirmScheduleBtn || "Xác nhận lịch hẹn"}
                      </Button>
                    </div>
                  </>
                ) : (
                  /* Form đề xuất mốc thời gian mới dùng chung component InterviewTimeSlotPicker */
                  <div className="bg-white dark:bg-slate-700/60 rounded-xl p-5 border border-slate-200 dark:border-slate-600 space-y-4">
                    <InterviewTimeSlotPicker
                      slots={customSlots}
                      onChange={setCustomSlots}
                      label={t.proposeAlternateTime || "Đề xuất các khoảng thời gian của bạn:"}
                      description={t.proposeAlternateDesc || "Chọn khoảng thời gian (Từ - Đến). Các khoảng thời gian khác nhau cần cách nhau ít nhất 4h và không trùng lặp."}
                    />

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t.candidateNote || "Ghi chú / Lý do (tùy chọn):"}
                      </label>
                      <textarea
                        rows={2}
                        value={rescheduleNote}
                        onChange={(e) => setRescheduleNote(e.target.value)}
                        placeholder="Ví dụ: Em bận lịch vào các khoảng thời gian trên, mong công ty hỗ trợ chuyển sang..."
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-xs text-slate-900 dark:text-white resize-none"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setIsRescheduling(false)}
                      >
                        {t.cancel || "Quay lại"}
                      </Button>
                      <Button
                        size="xs"
                        onClick={() => void handleSendRescheduleProposal()}
                        isLoading={isSubmittingReschedule}
                        leftIcon={<Send size={13} />}
                      >
                        {t.sendProposalBtn || "Gửi đề xuất lịch mới"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {/* Khối Thư giới thiệu (Cover Letter) nếu có */}
        {application.cover_letter && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
              <FileText size={16} className="text-indigo-600" />
              {t.submittedCoverLetter || "Thư giới thiệu của bạn"}
            </h3>
            <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed bg-slate-50 dark:bg-slate-700/40 p-4 rounded-xl">
              {application.cover_letter}
            </p>
          </div>
        )}

        {/* Lịch sử tiến trình (Application Timeline) */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-1.5">
            <Sparkles size={16} className="text-purple-600" />
            {t.applicationTimeline || "Tiến trình xét duyệt hồ sơ"}
          </h3>

          {stages.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">{lang === "en" ? "No timeline updates yet." : "Chưa có cập nhật tiến trình."}</p>
          ) : (
            <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-700">
              {stages.map((stg) => (
                <div key={stg.id} className="relative">
                  <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-indigo-600 ring-4 ring-white dark:ring-slate-800" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white">
                        {enumLabels.application_status[stg.stage] || stg.stage}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {formatDate(stg.created_at, true, lang)}
                      </span>
                    </div>
                    {stg.note && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                        {stg.note}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* POPUP MODAL XÁC NHẬN THAM GIA PHỎNG VẤN */}
      <AnimatePresence>
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-xs"
              onClick={() => !isSubmittingConfirm && setShowConfirmModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-700 z-10"
            >
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-4">
                <Calendar size={24} />
              </div>

              <h3 className="text-lg font-bold text-center text-slate-900 dark:text-white mb-2">
                {t.interviewConfirmedPopupTitle || (lang === "en" ? "Confirm Interview Attendance" : "Xác nhận tham gia phỏng vấn")}
              </h3>

              <div className="bg-indigo-50/70 dark:bg-indigo-950/40 p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/50 mb-5 text-center">
                <p className="text-xs text-slate-600 dark:text-slate-400">{lang === "en" ? "Selected interview slot:" : "Mốc thời gian bạn đã chọn:"}</p>
                <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300 mt-0.5">
                  {formatSlotDateTime(selectedSlot)}
                </p>
              </div>

              {/* Thông điệp cam kết theo yêu cầu nghiệp vụ */}
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-3.5 mb-5 flex items-start gap-2.5">
                <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-relaxed">
                  "{t.interviewCommitmentText || "Tôi đồng ý và chắc chắn đúng hẹn"}"
                </p>
              </div>

              <div className="flex gap-3 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isSubmittingConfirm}
                  onClick={() => setShowConfirmModal(false)}
                >
                  {t.cancel || "Hủy"}
                </Button>
                <Button
                  size="sm"
                  isLoading={isSubmittingConfirm}
                  onClick={() => void handleConfirmSlot()}
                  leftIcon={<CheckCircle2 size={15} />}
                >
                  {t.confirm || "Đồng ý xác nhận"}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AnimatedPage>
  );
}
