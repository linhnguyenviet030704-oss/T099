/** API helpers cho reputation endpoints. */

import { apiJson } from './api';

export interface ReputationScores {
  recruiter_reputation_score: number;
  candidate_reputation_score: number;
}

export interface ReputationEvent {
  id: string;
  role: 'recruiter' | 'candidate';
  points_delta: number;
  reason: string;
  application_id: string | null;
  job_post_id: string | null;
  interview_invitation_id: string | null;
  created_at: string;
}

export interface ReputationHistoryResponse {
  items: ReputationEvent[];
  total: number;
}

/** Lấy điểm uy tín hiện tại của người dùng. */
export async function getMyReputation(token: string): Promise<ReputationScores> {
  return apiJson<ReputationScores>('/reputation/me', token);
}

/** Lấy lịch sử thay đổi điểm uy tín (audit log). */
export async function getMyReputationHistory(
  token: string,
  role?: 'recruiter' | 'candidate',
  limit = 50,
  offset = 0,
): Promise<ReputationHistoryResponse> {
  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (role) {
    query.set('role', role);
  }
  return apiJson<ReputationHistoryResponse>(`/reputation/me/history?${query.toString()}`, token);
}
