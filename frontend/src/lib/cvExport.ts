import { supabase } from './supabase';
import { CvHeader, CvLine } from './cv';
import { ExportOptions } from '../components/cv/CvExportModal';
import { generateWysiwygPdf, generateTextPdf } from './cvPdf';
import { buildResumeStoragePath } from './storage';
import { batchInsertLines, batchUpdateLines, LineDraft } from './profileLines';
import { UserProfileLine } from '../types';
import { CvTemplateId, CV_TEMPLATES } from './cvTemplates';

export interface CvExportParams {
  userId: string;
  docNode: HTMLElement;
  header: CvHeader;
  lines: CvLine[];
  options: ExportOptions;
  sourceById: Record<string, UserProfileLine>;
  templateId: CvTemplateId;
}

export interface CvExportResult {
  resumeId: string;
  storagePath: string;
}

/**
 * Full CV export pipeline:
 *  1. Optionally write edited lines back to user_profile_lines (batch).
 *  2. Optionally insert new lines into user_profile_lines (batch).
 *  3. Generate the PDF (wysiwyg or text).
 *  4. Upload to the private `resumes` bucket.
 *  5. Insert resume metadata row (rollback storage on failure).
 */
export async function exportCv(params: CvExportParams): Promise<CvExportResult> {
  if (!supabase) throw new Error('Supabase client chưa được cấu hình.');
  const { userId, docNode, header, lines, options, sourceById, templateId } = params;

  // --- 1 & 2: write-back to source profile lines ---
  if (options.saveEditedToSource) {
    const edited = lines
      .filter((l) => l.sourceId && sourceById[l.sourceId])
      .map((l) => ({
        id: l.sourceId as string,
        line_type: l.line_type,
        title: l.title,
        organization: l.organization,
        description: l.description,
        start_date: l.start_date,
        end_date: l.end_date,
        display_order: sourceById[l.sourceId as string].display_order ?? 0,
      }));
    if (edited.length > 0) {
      await batchUpdateLines(edited, userId);
    }
  }

  if (options.addNewToSource) {
    const newDrafts: LineDraft[] = lines
      .filter((l) => l.sourceId === null)
      .map((l, idx) => ({
        key: l.key,
        line_type: l.line_type,
        title: l.title,
        organization: l.organization,
        description: l.description,
        start_date: l.start_date,
        end_date: l.end_date,
        display_order: idx,
      }));
    if (newDrafts.length > 0) {
      await batchInsertLines(newDrafts, userId);
    }
  }

  // --- 3: generate PDF ---
  const accent =
    CV_TEMPLATES.find((t) => t.id === templateId)?.accent || '#10b981';
  const blob =
    options.mode === 'wysiwyg'
      ? await generateWysiwygPdf(docNode)
      : await generateTextPdf(header, lines, accent);

  // --- 4: upload to storage ---
  const resumeId = crypto.randomUUID();
  const safeTitle = options.title.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'cv';
  const fileName = `${safeTitle}.pdf`;
  const storagePath = buildResumeStoragePath(userId, resumeId, fileName);
  const file = new File([blob], fileName, { type: 'application/pdf' });

  const { error: uploadErr } = await supabase.storage
    .from('resumes')
    .upload(storagePath, file, { upsert: false, contentType: 'application/pdf' });
  if (uploadErr) {
    throw new Error(`[Lỗi Storage]: ${uploadErr.message}`);
  }

  // --- 5: insert resume metadata (rollback storage if it fails) ---
  // Determine whether this is the user's first active resume to set default.
  const { count } = await supabase
    .from('resumes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null);

  const { error: dbErr } = await supabase.from('resumes').insert({
    id: resumeId,
    user_id: userId,
    bucket_id: 'resumes',
    storage_path: storagePath,
    original_filename: fileName,
    title: options.title,
    mime_type: 'application/pdf',
    size_bytes: file.size,
    is_default: (count ?? 0) === 0,
  });

  if (dbErr) {
    await supabase.storage.from('resumes').remove([storagePath]);
    throw dbErr;
  }

  return { resumeId, storagePath };
}
