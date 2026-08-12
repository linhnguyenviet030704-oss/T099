import React from 'react';
import { X } from 'lucide-react';
import { CvLine } from '../../lib/cv';
import { LINE_TYPE_OPTIONS } from '../../lib/profileLines';

interface CvLineEditorProps {
  line: CvLine;
  onChange: (patch: Partial<CvLine>) => void;
  onClose: () => void;
}

/**
 * Inline editor for the currently-selected CV line. Edits are kept in builder
 * state only; persistence to the source profile lines happens at export time
 * via the write-back prompts.
 */
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Phân loại
          </label>
          <select
            value={line.line_type}
            onChange={(e) =>
              onChange({ line_type: e.target.value as CvLine['line_type'] })
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
            Tiêu đề chính
          </label>
          <input
            type="text"
            value={line.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Đơn vị / Tổ chức
          </label>
          <input
            type="text"
            value={line.organization}
            onChange={(e) => onChange({ organization: e.target.value })}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Bắt đầu
            </label>
            <input
              type="date"
              value={line.start_date}
              onChange={(e) => onChange({ start_date: e.target.value })}
              className="w-full px-2 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Kết thúc
            </label>
            <input
              type="date"
              value={line.end_date}
              onChange={(e) => onChange({ end_date: e.target.value })}
              className="w-full px-2 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Mô tả chi tiết
          </label>
          <textarea
            rows={4}
            value={line.description}
            onChange={(e) => onChange({ description: e.target.value })}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"
          />
        </div>
      </div>
    </div>
  );
};

export default CvLineEditor;
