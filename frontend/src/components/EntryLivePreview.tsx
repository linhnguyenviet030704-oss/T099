import React from 'react';
import { Eye } from 'lucide-react';
import { FormattedEntry } from './FormattedEntry';

interface EntryLivePreviewProps {
  value: string;
  lang?: 'vi' | 'en';
}

export const EntryLivePreview: React.FC<EntryLivePreviewProps> = ({
  value,
  lang = 'vi',
}) => {
  const isEn = lang === 'en';

  if (!value || !value.trim()) {
    return null;
  }

  return (
    <div className="mt-2 p-3 bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl">
      <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
        <Eye size={13} />
        <span>{isEn ? 'Live Hierarchy Preview' : 'Xem trước hiển thị phân cấp'}</span>
      </div>
      <div className="bg-white dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200/80 dark:border-slate-700/80">
        <FormattedEntry
          value={value}
          className="text-slate-800 dark:text-slate-100"
          accentColor="#4f46e5"
        />
      </div>
    </div>
  );
};

export default EntryLivePreview;
