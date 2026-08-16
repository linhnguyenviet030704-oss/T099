import React, { useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { Profile, UserProfileLine } from '../../types';
import { CvBuilder } from './CvBuilder';
import { exportCv } from '../../lib/cvExport';
import { getResumeSignedUrl } from '../../lib/storage';

interface CvBuilderContainerProps {
  profile: Profile;
  email: string;
  sourceLines: UserProfileLine[];
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
  onClose,
  onCreated,
}) => {
  const [successPath, setSuccessPath] = useState<string | null>(null);

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
      alert(`Không thể mở CV: ${err.message}`);
    }
  };

  if (successPath) {
    return (
      <div className="bg-slate-900 border border-emerald-500/30 rounded-3xl p-8 text-center space-y-4 animate-fade-in">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-400">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-100">CV đã được tạo và lưu vào tủ hồ sơ!</h3>
          <p className="text-xs text-slate-400 mt-1">
            CV của bạn đã được lưu dưới dạng PDF trong kho lưu trữ riêng tư và sẵn sàng để nộp đơn.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleView}
            className="px-4 py-2 bg-slate-950 hover:bg-slate-800 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Xem CV vừa tạo
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs cursor-pointer"
          >
            Hoàn tất
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
        onClose={onClose}
        onExport={async ({ docNode, header, lines, options, templateId }) => {
          const result = await exportCv({
            userId: profile.id,
            docNode,
            header,
            lines,
            options,
            sourceById,
            templateId,
          });
          setSuccessPath(result.storagePath);
          onCreated?.();
        }}
      />
    </div>
  );
};

export default CvBuilderContainer;
