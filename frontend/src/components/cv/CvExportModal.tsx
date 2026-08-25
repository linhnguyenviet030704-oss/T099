import React, { useMemo, useState } from 'react';
import { X, FileImage, FileType, Save, AlertCircle, Loader2 } from 'lucide-react';
import { CvPdfMode } from '../../lib/cv';

export interface ExportOptions {
  mode: CvPdfMode;
  title: string;
  saveEditedToSource: boolean;
  addNewToSource: boolean;
  fitToSinglePage?: boolean;
}

interface CvExportModalProps {
  /** lines that were edited vs their source (count > 0 enables that prompt) */
  editedCount: number;
  /** new lines created in the builder (count > 0 enables that prompt) */
  newCount: number;
  selectedCount: number;
  initialTitle?: string;
  onConfirm: (opts: ExportOptions) => Promise<void>;
  onClose: () => void;
  lang?: 'vi' | 'en';
}

/**
 * Final step modal: pick PDF rendering mode, name the CV, and decide whether
 * to write edited/new lines back to the master profile lines.
 */
export const CvExportModal: React.FC<CvExportModalProps> = ({
  editedCount,
  newCount,
  selectedCount,
  initialTitle = '',
  onConfirm,
  onClose,
  lang = 'vi',
}) => {
  const isEn = lang === 'en';
  const [mode, setMode] = useState<CvPdfMode>('wysiwyg');
  const [title, setTitle] = useState(initialTitle);
  const [fitToSinglePage, setFitToSinglePage] = useState(false);
  const [saveEditedToSource, setSaveEditedToSource] = useState(true);
  const [addNewToSource, setAddNewToSource] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultTitle = useMemo(
    () => initialTitle.trim() || (isEn ? `CV - ${new Date().toLocaleDateString('en-US')}` : `CV - ${new Date().toLocaleDateString('vi-VN')}`),
    [initialTitle, isEn],
  );

  const handleConfirm = async () => {
    setError(null);
    if (selectedCount === 0) {
      setError(
        isEn
          ? 'No entries selected to display in CV.'
          : 'CV chưa có dòng nào được chọn để hiển thị.',
      );
      return;
    }
    try {
      setBusy(true);
      await onConfirm({
        mode,
        title: title.trim() || defaultTitle,
        saveEditedToSource,
        addNewToSource,
        fitToSinglePage,
      });
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Failed to create CV.' : 'Không thể tạo CV.'));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl sm:rounded-3xl p-4 sm:p-6 w-full max-w-lg shadow-2xl space-y-4 sm:space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {isEn ? 'Export CV Document' : 'Xuất CV thành tài liệu'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-1 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl text-sm">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {/* PDF mode */}
        <div className="space-y-2">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            {isEn ? 'PDF Rendering Mode' : 'Chế độ tạo PDF'}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMode('wysiwyg')}
              className={`text-left rounded-2xl border p-3 transition cursor-pointer ${
                mode === 'wysiwyg'
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-200 dark:ring-indigo-800'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <FileImage className="h-5 w-5 text-indigo-600 dark:text-indigo-400 mb-1.5" />
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                {isEn ? 'Pixel-perfect WYSIWYG' : 'Bản dựng hình ảnh'}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                {isEn
                  ? 'Matches the live preview 100%. Supports all fonts & styling.'
                  : 'Khớp 100% bản xem trước. Tiếng Việt chuẩn. File nặng hơn.'}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setMode('text')}
              className={`text-left rounded-2xl border p-3 transition cursor-pointer ${
                mode === 'text'
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-200 dark:ring-indigo-800'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <FileType className="h-5 w-5 text-indigo-600 dark:text-indigo-400 mb-1.5" />
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                {isEn ? 'Sharp Vector Text' : 'Bản chữ sắc nét'}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                {isEn
                  ? 'Selectable & searchable vector text. Lightweight file size.'
                  : 'Chữ vector chọn/tìm được. File nhẹ. Dùng font Unicode.'}
              </p>
            </button>
          </div>
        </div>

        {/* CV title */}
        <div className="space-y-1.5">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            {isEn ? 'CV Document Title (saved to CV Vault)' : 'Tên hồ sơ CV (lưu vào tủ hồ sơ)'}
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={defaultTitle}
            className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none"
          />
        </div>

        {/* Fit to single page option */}
        <div className="p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-2xl">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={fitToSinglePage}
              onChange={(e) => setFitToSinglePage(e.target.checked)}
              className="mt-1 accent-indigo-600 h-4 w-4 rounded"
            />
            <div>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {isEn ? 'Auto-fit neatly to 1 page (A4)' : 'Tự động co giãn vừa trọn 1 trang A4'}
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                {isEn
                  ? 'Optimizes dimensions so the entire CV fits onto a single page without breaking or spilling.'
                  : 'Tự động căn chỉnh kích thước để toàn bộ CV nằm vừa trong 1 trang duy nhất, không bị tràn viền hoặc ngắt sang trang 2.'}
              </p>
            </div>
          </label>
        </div>

        {/* Write-back prompts */}
        {(editedCount > 0 || newCount > 0) && (
          <div className="space-y-2 border-t border-slate-200 dark:border-slate-700 pt-4">
            {editedCount > 0 && (
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveEditedToSource}
                  onChange={(e) => setSaveEditedToSource(e.target.checked)}
                  className="mt-0.5 accent-indigo-600"
                />
                <span className="text-sm text-slate-600 dark:text-slate-300 leading-snug">
                  {isEn ? (
                    <>
                      Save changes from <strong className="text-indigo-600 dark:text-indigo-400">{editedCount}</strong> edited
                      entries back to master profile.
                    </>
                  ) : (
                    <>
                      Lưu thay đổi của <strong className="text-indigo-600 dark:text-indigo-400">{editedCount}</strong> dòng
                      đã sửa vào hồ sơ gốc (thông tin mặc định).
                    </>
                  )}
                </span>
              </label>
            )}
            {newCount > 0 && (
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addNewToSource}
                  onChange={(e) => setAddNewToSource(e.target.checked)}
                  className="mt-0.5 accent-indigo-600"
                />
                <span className="text-sm text-slate-600 dark:text-slate-300 leading-snug">
                  {isEn ? (
                    <>
                      Add <strong className="text-indigo-600 dark:text-indigo-400">{newCount}</strong> newly created entries
                      to master profile.
                    </>
                  ) : (
                    <>
                      Thêm <strong className="text-indigo-600 dark:text-indigo-400">{newCount}</strong> dòng mới tạo trong
                      CV vào hồ sơ gốc (thông tin mặc định).
                    </>
                  )}
                </span>
              </label>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            {isEn ? 'Cancel' : 'Hủy bỏ'}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-200 dark:shadow-emerald-900/30 disabled:shadow-none"
          >
            {busy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {isEn ? 'Generating CV...' : 'Đang tạo CV...'}
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                {isEn ? 'Create & Save CV' : 'Tạo & lưu CV'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CvExportModal;

