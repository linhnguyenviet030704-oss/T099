import { UserProfileLine } from '../types';
import { supabase } from './supabase';

export type LineType = UserProfileLine['name'];

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
  key: string;
  name: LineType;
  value: string;
  display_order: number;
}

export const createEmptyDraft = (order = 0): LineDraft => ({
  key: crypto.randomUUID(),
  name: 'summary',
  value: '',
  display_order: order,
});

export const validateDraft = (draft: LineDraft): string | null => {
  if (!draft.value.trim()) {
    return 'Nội dung không thể bỏ trống.';
  }
  return null;
};

export const draftToPayload = (draft: LineDraft, userId: string) => ({
  user_id: userId,
  name: draft.name,
  value: draft.value.trim(),
  display_order: Number(draft.display_order) || 0,
});

export async function batchInsertLines(
  drafts: LineDraft[],
  userId: string,
): Promise<UserProfileLine[]> {
  if (!supabase) throw new Error('Supabase client chưa được cấu hình.');
  const payloads = drafts.map((d) => draftToPayload(d, userId));
  const { data, error } = await supabase
    .from('profile_lines')
    .insert(payloads)
    .select('*');
  if (error) throw error;
  return (data || []) as UserProfileLine[];
}

export async function batchUpdateLines(
  lines: Pick<UserProfileLine, 'id' | 'name' | 'value' | 'display_order'>[],
  userId: string,
): Promise<void> {
  if (!supabase) throw new Error('Supabase client chưa được cấu hình.');
  const results = await Promise.all(
    lines.map((l) =>
      supabase!
        .from('profile_lines')
        .update({
          name: l.name,
          value: l.value.trim(),
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

export async function batchDeleteLines(
  ids: string[],
  userId: string,
): Promise<void> {
  if (!supabase) throw new Error('Supabase client chưa được cấu hình.');
  const { error } = await supabase
    .from('profile_lines')
    .delete()
    .in('id', ids)
    .eq('user_id', userId);
  if (error) throw error;
}

export const lineContentDiffers = (
  a: Partial<UserProfileLine> & { name?: string; value?: string },
  b: Partial<UserProfileLine> & { name?: string; value?: string },
): boolean => {
  const norm = (v: string | null | undefined) => (v ?? '').trim();
  return a.name !== b.name || norm(a.value) !== norm(b.value);
};
