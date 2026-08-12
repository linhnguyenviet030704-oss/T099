import { UserProfileLine } from '../types';
import { supabase } from './supabase';

export type LineType = UserProfileLine['line_type'];

export const LINE_TYPE_OPTIONS: { value: LineType; label: string }[] = [
  { value: 'summary', label: 'Giới thiệu bản thân' },
  { value: 'experience', label: 'Kinh nghiệm làm việc' },
  { value: 'education', label: 'Học vấn' },
  { value: 'skill', label: 'Kỹ năng' },
  { value: 'project', label: 'Dự án' },
  { value: 'certification', label: 'Chứng chỉ' },
  { value: 'language', label: 'Ngoại ngữ' },
  { value: 'link', label: 'Liên kết' },
  { value: 'other', label: 'Thông tin bổ sung' },
];

/** A blank draft used by the batch add form. */
export interface LineDraft {
  key: string; // local-only React key
  line_type: LineType;
  title: string;
  organization: string;
  description: string;
  start_date: string;
  end_date: string;
  display_order: number;
}

export const createEmptyDraft = (order = 0): LineDraft => ({
  key: crypto.randomUUID(),
  line_type: 'summary',
  title: '',
  organization: '',
  description: '',
  start_date: '',
  end_date: '',
  display_order: order,
});

/** Validate a single draft. Returns an error string or null. */
export const validateDraft = (draft: LineDraft): string | null => {
  if (!draft.title.trim()) {
    return 'Tiêu đề chính không thể bỏ trống.';
  }
  if (
    draft.start_date &&
    draft.end_date &&
    new Date(draft.end_date) < new Date(draft.start_date)
  ) {
    return 'Thời gian kết thúc không thể trước ngày bắt đầu.';
  }
  return null;
};

/** Convert a draft to the DB insert payload. */
export const draftToPayload = (draft: LineDraft, userId: string) => ({
  user_id: userId,
  line_type: draft.line_type,
  title: draft.title.trim(),
  organization: draft.organization.trim() || null,
  description: draft.description.trim() || null,
  start_date: draft.start_date || null,
  end_date: draft.end_date || null,
  display_order: Number(draft.display_order) || 0,
});

/**
 * Batch insert multiple profile lines in a single request.
 * Returns the inserted rows.
 */
export async function batchInsertLines(
  drafts: LineDraft[],
  userId: string,
): Promise<UserProfileLine[]> {
  if (!supabase) throw new Error('Supabase client chưa được cấu hình.');
  const payloads = drafts.map((d) => draftToPayload(d, userId));
  const { data, error } = await supabase
    .from('user_profile_lines')
    .insert(payloads)
    .select('*');
  if (error) throw error;
  return (data || []) as UserProfileLine[];
}

/**
 * Batch update multiple existing profile lines.
 * Supabase has no native bulk-update, so we run updates in parallel.
 */
export async function batchUpdateLines(
  lines: Pick<
    UserProfileLine,
    | 'id'
    | 'line_type'
    | 'title'
    | 'organization'
    | 'description'
    | 'start_date'
    | 'end_date'
    | 'display_order'
  >[],
  userId: string,
): Promise<void> {
  if (!supabase) throw new Error('Supabase client chưa được cấu hình.');
  const results = await Promise.all(
    lines.map((l) =>
      supabase!
        .from('user_profile_lines')
        .update({
          line_type: l.line_type,
          title: l.title.trim(),
          organization: l.organization?.trim() || null,
          description: l.description?.trim() || null,
          start_date: l.start_date || null,
          end_date: l.end_date || null,
          display_order: Number(l.display_order) || 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', l.id)
        .eq('user_id', userId),
    ),
  );
  const firstError = results.find((r) => r.error);
  if (firstError?.error) throw firstError.error;
}

/** Batch delete multiple profile lines by id. */
export async function batchDeleteLines(
  ids: string[],
  userId: string,
): Promise<void> {
  if (!supabase) throw new Error('Supabase client chưa được cấu hình.');
  const { error } = await supabase
    .from('user_profile_lines')
    .delete()
    .in('id', ids)
    .eq('user_id', userId);
  if (error) throw error;
}

/**
 * Returns true if a CV-edited line differs from its source profile line.
 * Compares only the user-facing content fields.
 */
export const lineContentDiffers = (
  a: Partial<UserProfileLine>,
  b: Partial<UserProfileLine>,
): boolean => {
  const norm = (v: string | null | undefined) => (v ?? '').trim();
  return (
    a.line_type !== b.line_type ||
    norm(a.title) !== norm(b.title) ||
    norm(a.organization) !== norm(b.organization) ||
    norm(a.description) !== norm(b.description) ||
    norm(a.start_date) !== norm(b.start_date) ||
    norm(a.end_date) !== norm(b.end_date)
  );
};
