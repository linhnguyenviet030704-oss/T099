/** API helpers cho reputation endpoints (có fallback Supabase trực tiếp). */

import { apiJson } from './api';
import { supabase } from './supabase';

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
  try {
    return await apiJson<ReputationScores>('/reputation/me', token);
  } catch (err) {
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('recruiter_reputation_score, candidate_reputation_score')
          .eq('id', user.id)
          .maybeSingle();

        if (!error && data) {
          return {
            recruiter_reputation_score: data.recruiter_reputation_score ?? 100,
            candidate_reputation_score: data.candidate_reputation_score ?? 100,
          };
        }
      }
    }
    throw err;
  }
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
  try {
    return await apiJson<ReputationHistoryResponse>(`/reputation/me/history?${query.toString()}`, token);
  } catch (err) {
    if (supabase) {
      let q = supabase
        .from('reputation_events')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (role) {
        q = q.eq('role', role);
      }

      const { data, error, count } = await q;
      if (!error && data) {
        return {
          items: data as ReputationEvent[],
          total: count ?? data.length,
        };
      }
    }
    throw err;
  }
}

