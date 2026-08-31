import { test } from 'node:test';
import assert from 'node:assert/strict';

// Helper phân loại mức độ uy tín
export function getReputationTier(score: number): 'high' | 'medium' | 'low' {
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

// Helper kiểm tra đường dẫn an toàn (chống Open Redirect / XSS trong notifications)
export function isSafeRelativeUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith('/') && !url.startsWith('//') && !url.includes('\\');
}

// Helper kiểm tra chuyển đổi trạng thái hợp lệ
export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['screening', 'interview', 'rejected', 'withdrawn'],
  screening: ['interview', 'rejected', 'withdrawn'],
  interview: ['offer', 'rejected', 'withdrawn'],
  offer: ['accepted', 'rejected', 'withdrawn'],
  accepted: [],
  rejected: [],
  withdrawn: [],
};

export function canTransitionStatus(oldStatus: string, newStatus: string): boolean {
  if (oldStatus === newStatus) return true;
  const allowed = VALID_STATUS_TRANSITIONS[oldStatus] || [];
  return allowed.includes(newStatus);
}

test('phân loại mức điểm uy tín chính xác', () => {
  assert.equal(getReputationTier(100), 'high');
  assert.equal(getReputationTier(80), 'high');
  assert.equal(getReputationTier(79), 'medium');
  assert.equal(getReputationTier(50), 'medium');
  assert.equal(getReputationTier(49), 'low');
  assert.equal(getReputationTier(0), 'low');
});

test('kiểm tra link_url tương đối an toàn', () => {
  assert.equal(isSafeRelativeUrl('/applications/123'), true);
  assert.equal(isSafeRelativeUrl('/recruiter/job/456'), true);
  assert.equal(isSafeRelativeUrl('https://evil.com'), false);
  assert.equal(isSafeRelativeUrl('//evil.com'), false);
  assert.equal(isSafeRelativeUrl('javascript:alert(1)'), false);
  assert.equal(isSafeRelativeUrl(null), false);
  assert.equal(isSafeRelativeUrl(undefined), false);
});

test('kiểm tra tính hợp lệ của status transition trên frontend', () => {
  assert.equal(canTransitionStatus('pending', 'interview'), true);
  assert.equal(canTransitionStatus('pending', 'screening'), true);
  assert.equal(canTransitionStatus('screening', 'interview'), true);
  assert.equal(canTransitionStatus('interview', 'offer'), true);
  assert.equal(canTransitionStatus('offer', 'accepted'), true);

  // Không cho phép nhảy cóc
  assert.equal(canTransitionStatus('pending', 'offer'), false);
  assert.equal(canTransitionStatus('pending', 'accepted'), false);
  assert.equal(canTransitionStatus('screening', 'accepted'), false);

  // Không cho phép chuyển từ terminal status
  assert.equal(canTransitionStatus('accepted', 'rejected'), false);
  assert.equal(canTransitionStatus('rejected', 'interview'), false);
  assert.equal(canTransitionStatus('withdrawn', 'pending'), false);
});
