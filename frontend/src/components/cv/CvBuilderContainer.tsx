import React, { useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { Profile, UserProfileLine } from '../../types';
import { CvBuilder } from './CvBuilder';
import { exportCv } from '../../lib/cvExport';
import { INDEX_FAIL_COPY, ingestResume } from '../../lib/ingest';
import { getResumeSignedUrl } from '../../lib/storage';
import { useAuth } from '../../auth/AuthProvider';
import { useLang } from '../../context/LangContext';

import { CvLine, CvHeader } from '../../lib/cv';

interface CvBuilderContainerProps {
  profile: Profile;
  email: string;
  sourceLines: UserProfileLine[];
  initialLines?: CvLine[];
  initialTitle?: string;
  initialHeader?: Partial<CvHeader>;
  onClose: () => void;
  /** Called after a CV is successfully created (e.g. to refresh resume list). */
  onCreated?: () => void;
}

/**
 * Wraps CvBuilder with the export pipeline and a success state. Reused by both
 * /profile and /profile/resumes.
 */
export const CvBuilderContainer: React.FC<CvBuilderContainerProps> = ({
  profile,
  email,
  sourceLines,
  initialLines,
  initialTitle,
  initialHeader,
  onClose,
  onCreated,
}) => {
  const { session } = useAuth();
  const { lang } = useLang();
  const [successPath, setSuccessPath] = useState<string | null>(null);
  const [indexWarning, setIndexWarning] = useState(false);

  const sourceById = useMemo(() => {
    const m: Record<string, UserProfileLine> = {};
    sourceLines.forEach((l) => (m[l.id] = l));
    return m;
  }, [sourceLines]);

  const handleView = async () => {
    if (!successPath) return;
    try {
      const url = await getResumeSignedUrl(successPath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      alert(`${lang === "en" ? "Cannot open CV:" : "Không thể mở CV:"} ${err.message}`);
    }
  };

  if (successPath) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 rounded-3xl p-8 text-center space-y-4 animate-fade-in shadow-sm">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            {lang === "en" ? "CV has been created and saved to your CV Vault!" : "CV đã được tạo và lưu vào tủ hồ sơ!"}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {lang === "en"
              ? "Your CV has been saved as a PDF in your private vault and is ready for applications."
              : "CV của bạn đã được lưu dưới dạng PDF trong kho lưu trữ riêng tư và sẵn sàng để nộp đơn."}
          </p>
          {indexWarning && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">{INDEX_FAIL_COPY}</p>
          )}
        </div>
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleView}
            className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {lang === "en" ? "View Created CV" : "Xem CV vừa tạo"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-md shadow-emerald-200 dark:shadow-emerald-900/30 transition-colors"
          >
            {lang === "en" ? "Done" : "Hoàn tất"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-4 sm:px-6 lg:px-10">
      <CvBuilder
        profile={profile}
        email={email}
        sourceLines={sourceLines}
        initialLines={initialLines}
        initialTitle={initialTitle}
        initialHeader={initialHeader}
        onClose={onClose}
        onExport={async ({ docNode, header, lines, options, templateId, lang, customTitles }) => {
          const result = await exportCv({
            userId: profile.id,
            docNode,
            header,
            lines,
            options,
            sourceById,
            templateId,
            lang,
            customTitles,
          });

          try {
            if (session?.access_token) {
              await ingestResume(result.resumeId, session.access_token);
            } else {
              setIndexWarning(true);
            }
          } catch {
            setIndexWarning(true);
          }
          setSuccessPath(result.storagePath);
          onCreated?.();
        }}
      />
    </div>
  );
};

export default CvBuilderContainer;
