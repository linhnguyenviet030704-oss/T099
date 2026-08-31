/** API helpers cho application (job_submits) management endpoints. */

import { apiJson } from './api';

export interface ApplicationDetail {
  id: string;
  job_post_id: string;
  applicant_user_id: string;
  resume_id: string;
  current_status: string;
  cover_letter: string | null;
  applied_at: string;
  reviewed_at: string | null;
  response_deadline_at: string | null;
  applicant_name: string | null;
  applicant_email: string | null;
  job_title: string | null;
  company_name: string | null;
}

export interface InterviewScheduleInput {
  proposed_time_slots: string[];
  location?: string | null;
  meeting_link?: string | null;
  note?: string | null;
}

export interface InterviewInvitation {
  id: string;
  application_id: string;
  scheduled_at: string | null;
  proposed_time_slots: string[];
  candidate_proposed_slots: string[];
  candidate_response_note: string | null;
  location: string | null;
  meeting_link: string | null;
  note: string | null;
  status: 'pending' | 'confirmed' | 'declined' | 'reschedule_requested' | 'no_show' | 'cancelled' | 'completed';
  responded_at: string | null;
  created_at: string | null;
}

export interface CandidateInterviewResponseRequest {
  action: 'confirm' | 'reschedule';
  selected_slot?: string | null;
  proposed_time_slots?: string[];
  note?: string | null;
}

export interface RecruiterConfirmRescheduleRequest {
  selected_slot: string;
  meeting_link?: string | null;
  location?: string | null;
  note?: string | null;
}

export interface ApplicationUpdateStatusRequest {
  new_status: string;
  note?: string;
  send_email?: boolean;
  interview_schedule?: InterviewScheduleInput | null;
}

export interface ApplicationUpdateStatusResponse {
  application: ApplicationDetail;
  new_stage: {
    stage: string;
    note: string | null;
    is_system_generated: boolean;
    created_at: string;
    changed_by_user_id: string | null;
  };
  email_enqueued: boolean;
  interview_invitation?: InterviewInvitation | null;
}

/** Lấy chi tiết một application. */
export async function getApplication(
  token: string,
  applicationId: string,
): Promise<ApplicationDetail> {
  return apiJson<ApplicationDetail>(
    `/applications/${applicationId}`,
    token,
  );
}

/** Update trạng thái application (chỉ recruiter). */
export async function updateApplicationStatus(
  token: string,
  applicationId: string,
  body: ApplicationUpdateStatusRequest,
): Promise<ApplicationUpdateStatusResponse> {
  return apiJson<ApplicationUpdateStatusResponse>(
    `/applications/${applicationId}/status`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
}

/** Lấy thông tin lời mời phỏng vấn của một application. */
export async function getInterviewInvitation(
  token: string,
  applicationId: string,
): Promise<InterviewInvitation | null> {
  return apiJson<InterviewInvitation | null>(
    `/applications/${applicationId}/interview-invitation`,
    token,
  );
}

/** Ứng viên phản hồi lời mời phỏng vấn (xác nhận hoặc đề xuất mốc mới). */
export async function candidateRespondInterview(
  token: string,
  applicationId: string,
  body: CandidateInterviewResponseRequest,
): Promise<InterviewInvitation> {
  return apiJson<InterviewInvitation>(
    `/applications/${applicationId}/interview-invitation/respond`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

/** Nhà tuyển dụng xác nhận mốc thời gian đề xuất của ứng viên. */
export async function recruiterConfirmReschedule(
  token: string,
  applicationId: string,
  body: RecruiterConfirmRescheduleRequest,
): Promise<InterviewInvitation> {
  return apiJson<InterviewInvitation>(
    `/applications/${applicationId}/interview-invitation/reschedule-confirm`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

