import React, { useState } from 'react';
import { Plus, Trash2, Save, AlertCircle, X, Copy } from 'lucide-react';
import {
  LineDraft,
  LINE_TYPE_OPTIONS,
  createEmptyDraft,
  validateDraft,
} from '../lib/profileLines';

interface BatchLineFormProps {
  onSubmit: (drafts: LineDraft[]) => Promise<void>;
  onCancel: () => void;
  /** starting display order for the first row */
  startOrder?: number;
}

/**
 * Form that lets the user add an arbitrary number of profile lines at once.
 * Each row is an independent draft; "Thêm dòng" appends another. On submit all
 * valid rows are inserted in a single batch.
 */
export const BatchLineForm: React.FC<BatchLineFormProps> = ({
  onSubmit,
  onCancel,
  startOrder = 0,
}) => {
  const [drafts, setDrafts] = useState<LineDraft[]>([
    createEmptyDraft(startOrder),
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const updateDraft = (key: string, patch: Partial<LineDraft>) => {
    setDrafts((prev) =>
      prev.map((d) => (d.key === key ? { ...d, ...patch } : d)),
    );
  };

  const addRow = () => {
    setDrafts((prev) => [
      ...prev,
      createEmptyDraft(startOrder + prev.length),
    ]);
  };

  const duplicateRow = (key: string) => {
    setDrafts((prev) => {
      const idx = prev.findIndex((d) => d.key === key);
      if (idx === -1) return prev;
      const copy = { ...prev[idx], key: crypto.randomUUID() };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  const removeRow = (key: string) => {
    setDrafts((prev) =>
      prev.length === 1 ? prev : prev.filter((d) => d.key !== key),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);

    const nextErrors: Record<string, string> = {};
    drafts.forEach((d) => {
      const err = validateDraft(d);
      if (err) nextErrors[d.key] = err;
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setGlobalError('Một số dòng chưa hợp lệ. Vui lòng kiểm tra lại.');
      return;
    }

    try {
      setSubmitting(true);
      await onSubmit(drafts);
    } catch (err: any) {
      setGlobalError(err?.message || 'Không thể lưu các dòng hồ sơ.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-5 animate-slide-up">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest">
          Thêm nhiều dòng hồ sơ ({drafts.length})
        </h4>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 text-slate-500 hover:text-slate-300 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {globalError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400 flex items-start gap-1.5">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>{globalError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {drafts.map((draft, index) => (
          <div
            key={draft.key}
            className="border border-slate-850 rounded-2xl p-4 bg-slate-900/40 space-y-4 relative"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-widest">
                Dòng #{index + 1}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => duplicateRow(draft.key)}
                  title="Nhân bản dòng"
                  className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded-lg cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeRow(draft.key)}
                  disabled={drafts.length === 1}
                  title="Xóa dòng khỏi danh sách"
                  className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-red-400 rounded-lg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {errors[draft.key] && (
              <p className="text-[10px] text-red-400 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors[draft.key]}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Phân loại <span className="text-emerald-500">*</span>
                </label>
                <select
                  value={draft.name}
                  onChange={(e) =>
                    updateDraft(draft.key, {
                      name: e.target.value as LineDraft['name'],
                    })
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
                  Thứ tự hiển thị
                </label>
                <input
                  type="number"
                  value={draft.display_order}
                  onChange={(e) =>
                    updateDraft(draft.key, {
                      display_order: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Nội dung <span className="text-emerald-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={draft.value}
                  onChange={(e) =>
                    updateDraft(draft.key, { value: e.target.value })
                  }
                  placeholder="Ví dụ: Tốt nghiệp đại học quốc gia HCM"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"
                />
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addRow}
          className="w-full border-2 border-dashed border-slate-800 hover:border-emerald-500/40 text-slate-400 hover:text-emerald-400 rounded-2xl py-3 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Thêm một dòng nữa
        </button>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 rounded-xl text-xs font-semibold cursor-pointer"
          >
            Hủy bỏ
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            {submitting
              ? 'Đang lưu...'
              : `Lưu ${drafts.length} dòng cùng lúc`}
          </button>
        </div>
      </form>
    </div>
  );
};

export default BatchLineForm;
