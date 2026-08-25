import React from 'react';
import { X } from 'lucide-react';
import { CvLine } from '../../lib/cv';
import { getLineTypeOptions } from '../../lib/profileLines';

interface CvLineEditorProps {
  line: CvLine;
  onChange: (patch: Partial<CvLine>) => void;
  onClose: () => void;
  lang?: 'vi' | 'en';
}

export const CvLineEditor: React.FC<CvLineEditorProps> = ({
  line,
  onChange,
  onClose,
  lang = 'vi',
}) => {
  const options = getLineTypeOptions(lang);
  const isEn = lang === 'en';

  return (
    <div className="bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-4 space-y-4 animate-slide-up shadow-sm">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
          {isEn ? 'Edit entry' : 'Chỉnh sửa dòng'}{' '}
          {line.sourceId === null ? (isEn ? '(new)' : '(dòng mới)') : ''}
        </h4>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            {isEn ? 'Category' : 'Phân loại'}
          </label>
          <select
            value={line.name}
            onChange={(e) =>
              onChange({ name: e.target.value as CvLine['name'] })
            }
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none"
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>


        <div className="space-y-1.5">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Nội dung
          </label>
          <textarea
            rows={5}
            value={line.value}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder="Ví dụ: Tốt nghiệp đại học quốc gia HCM"
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none resize-none"
          />
        </div>
      </div>
    </div>
  );
};

export default CvLineEditor;
