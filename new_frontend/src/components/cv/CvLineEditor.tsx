import React from 'react';
import { X } from 'lucide-react';
import { CvLine } from '../../lib/cv';
import { LINE_TYPE_OPTIONS } from '../../lib/profileLines';

interface CvLineEditorProps {
  line: CvLine;
  onChange: (patch: Partial<CvLine>) => void;
  onClose: () => void;
}

export const CvLineEditor: React.FC<CvLineEditorProps> = ({
  line,
  onChange,
  onClose,
}) => {
  return (
    <div className="bg-slate-950 border border-emerald-500/30 rounded-2xl p-4 space-y-4 animate-slide-up">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
          Chỉnh sửa dòng {line.sourceId === null ? '(dòng mới)' : ''}
        </h4>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-slate-500 hover:text-slate-300 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Phân loại
          </label>
          <select
            value={line.name}
            onChange={(e) =>
              onChange({ name: e.target.value as CvLine['name'] })
            }
            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
            {LINE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Nội dung
          </label>
          <textarea
            rows={5}
            value={line.value}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder="Ví dụ: Tốt nghiệp đại học quốc gia HCM"
            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"
          />
        </div>
      </div>
    </div>
  );
};

export default CvLineEditor;
