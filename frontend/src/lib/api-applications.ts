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

export interface ApplicationUpdateStatusRequest {
  new_status: string;
  note?: string;
  send_email?: boolean;
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
