import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  Plus,
  FileDown,
  X,
  CheckSquare,
  Square,
  Layers,
  ChevronDown,
} from 'lucide-react';
import { UserProfileLine, Profile } from '../../types';
import {
  CvHeader,
  CvLine,
  createBlankCvLine,
  profileLineToCvLine,
} from '../../lib/cv';
import { LINE_TYPE_OPTIONS, lineContentDiffers } from '../../lib/profileLines';
import { SortableCvLine } from './SortableCvLine';
import { CvPreview } from './CvPreview';
import { CvLineEditor } from './CvLineEditor';
import { CvExportModal, ExportOptions } from './CvExportModal';
import { SplitPane } from '../SplitPane';
import { CV_TEMPLATES, CvTemplateId } from '../../lib/cvTemplates';

const lineTypeLabel = (value: string): string =>
  LINE_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;

export interface CvBuilderHandle {
  buildLines: CvLine[];
}

interface CvBuilderProps {
  profile: Profile;
  email: string;
  sourceLines: UserProfileLine[];
  onClose: () => void;
  /** Performs export: receives the document node, header, lines and options. */
  onExport: (params: {
    docNode: HTMLElement;
    header: CvHeader;
    lines: CvLine[];
    options: ExportOptions;
    templateId: CvTemplateId;
  }) => Promise<void>;
}

/**
 * The full CV builder surface. Left column = source line pool (click to add to
 * CV). Right column = editable, drag-sortable preview. Handles select/deselect,
 * remove-from-CV, inline edit, add-new, and triggers the export modal.
 */
export const CvBuilder: React.FC<CvBuilderProps> = ({
  profile,
  email,
  sourceLines,
  onClose,
  onExport,
}) => {
  const [header, setHeader] = useState<CvHeader>({
    full_name: profile.full_name || '',
    email: email || profile.email || '',
    phone: profile.phone || '',
    avatar_url: profile.avatar_url || '',
  });

  const [cvLines, setCvLines] = useState<CvLine[]>(() =>
    sourceLines.map(profileLineToCvLine),
  );
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [templateId, setTemplateId] = useState<CvTemplateId>('modern');
  const [templatesOpen, setTemplatesOpen] = useState(true);

  const docRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Source lines not yet present in the CV (by sourceId) can be re-added.
  const usedSourceIds = useMemo(
    () => new Set(cvLines.map((l) => l.sourceId).filter(Boolean) as string[]),
    [cvLines],
  );
  const availableSource = useMemo(
    () => sourceLines.filter((l) => !usedSourceIds.has(l.id)),
    [sourceLines, usedSourceIds],
  );

  const sourceById = useMemo(() => {
    const m: Record<string, UserProfileLine> = {};
    sourceLines.forEach((l) => (m[l.id] = l));
    return m;
  }, [sourceLines]);

  const editedCount = useMemo(
    () =>
      cvLines.filter(
        (l) => l.sourceId && sourceById[l.sourceId] && lineContentDiffers(l, {
          name: sourceById[l.sourceId].name,
          value: sourceById[l.sourceId].value,
        }),
      ).length,
    [cvLines, sourceById],
  );
  const newCount = useMemo(
    () => cvLines.filter((l) => l.sourceId === null).length,
    [cvLines],
  );
  const selectedCount = useMemo(
    () => cvLines.filter((l) => l.selected).length,
    [cvLines],
  );

  const activeLine = cvLines.find((l) => l.key === activeKey) || null;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setCvLines((prev) => {
      const oldIndex = prev.findIndex((l) => l.key === active.id);
      const newIndex = prev.findIndex((l) => l.key === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const toggleSelect = (key: string) =>
    setCvLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, selected: !l.selected } : l)),
    );

  const removeFromCv = (key: string) => {
    setCvLines((prev) => prev.filter((l) => l.key !== key));
    if (activeKey === key) setActiveKey(null);
  };

  const updateActiveLine = (patch: Partial<CvLine>) => {
    if (!activeKey) return;
    setCvLines((prev) =>
      prev.map((l) => (l.key === activeKey ? { ...l, ...patch } : l)),
    );
  };

  const addSourceLine = (line: UserProfileLine) => {
    setCvLines((prev) => [...prev, profileLineToCvLine(line)]);
  };

  const addAllSource = () => {
    setCvLines((prev) => [
      ...prev,
      ...availableSource.map(profileLineToCvLine),
    ]);
  };

  const addBlankLine = () => {
    const blank = createBlankCvLine();
    setCvLines((prev) => [...prev, blank]);
    setActiveKey(blank.key);
  };

  const setAllSelected = (selected: boolean) =>
    setCvLines((prev) => prev.map((l) => ({ ...l, selected })));

  const handleExportConfirm = async (options: ExportOptions) => {
    if (!docRef.current) throw new Error('Không tìm thấy bản xem trước CV.');
    await onExport({
      docNode: docRef.current,
      header,
      lines: cvLines,
      options,
      templateId,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Builder toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Trình tạo CV</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {selectedCount} dòng hiển thị • {newCount} dòng mới • {editedCount} dòng đã sửa
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Thoát chế độ tạo CV
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.02 }}
            onClick={() => setShowExport(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-md shadow-emerald-200 dark:shadow-emerald-900/30"
          >
            <FileDown className="h-4 w-4" />
            Xuất CV
          </motion.button>
        </div>
      </div>

      {/* Template picker */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
        <button
          type="button"
          onClick={() => setTemplatesOpen((v) => !v)}
          className="w-full flex items-center justify-between cursor-pointer group"
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200">
            Chọn mẫu CV ({CV_TEMPLATES.length})
          </p>
          <span className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
            {templatesOpen ? 'Thu gọn' : 'Mở rộng'}
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${
                templatesOpen ? 'rotate-180' : ''
              }`}
            />
          </span>
        </button>

        {templatesOpen ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-56 overflow-y-auto pr-1 mt-3">
            {CV_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => setTemplateId(tpl.id)}
                className={`text-left rounded-xl border p-3 transition cursor-pointer ${
                  templateId === tpl.id
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-200 dark:ring-indigo-800'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="inline-block w-3 h-3 rounded-full shrink-0"
                    style={{ background: tpl.accent }}
                  />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{tpl.name}</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">{tpl.description}</p>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Mẫu đang chọn:{' '}
            <span className="font-bold text-indigo-600 dark:text-indigo-400">
              {CV_TEMPLATES.find((t) => t.id === templateId)?.name}
            </span>
          </p>
        )}
      </div>

      <SplitPane
        initialLeftPct={42}
        minPct={26}
        maxPct={68}
        left={
          /* FRAME 1: all editing controls */
          <div className="space-y-4 pr-1">
            {/* Source pool */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Kho dòng hồ sơ
              </h4>
              {availableSource.length > 0 && (
                <button
                  type="button"
                  onClick={addAllSource}
                  className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer"
                >
                  + Thêm tất cả
                </button>
              )}
            </div>

            {availableSource.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                Tất cả dòng hồ sơ đã có trong CV. Bạn vẫn có thể tạo dòng mới.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {availableSource.map((line) => (
                  <button
                    key={line.id}
                    type="button"
                    onClick={() => addSourceLine(line)}
                    className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 p-3 transition cursor-pointer group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                        {lineTypeLabel(line.name)}
                      </span>
                      <Plus className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                    </div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-1 line-clamp-2 whitespace-pre-line">
                      {line.value}
                    </p>
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={addBlankLine}
              className="w-full border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-500 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Tạo dòng mới trong CV
            </button>
          </div>

          {/* Inline editor for the active line */}
          {activeLine && (
            <CvLineEditor
              line={activeLine}
              onChange={updateActiveLine}
              onClose={() => setActiveKey(null)}
            />
          )}

          {/* Header editor */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Họ và tên
              </label>
              <input
                type="text"
                value={header.full_name}
                onChange={(e) =>
                  setHeader((h) => ({ ...h, full_name: e.target.value }))
                }
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Email
              </label>
              <input
                type="email"
                value={header.email}
                onChange={(e) =>
                  setHeader((h) => ({ ...h, email: e.target.value }))
                }
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Số điện thoại
              </label>
              <input
                type="text"
                value={header.phone}
                onChange={(e) =>
                  setHeader((h) => ({ ...h, phone: e.target.value }))
                }
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none"
              />
            </div>
          </div>

          {/* Sortable line list controls */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Sắp xếp & chọn dòng ({cvLines.length})
              </h4>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAllSelected(true)}
                  className="text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 cursor-pointer"
                >
                  <CheckSquare className="h-3 w-3" /> Chọn tất cả
                </button>
                <button
                  type="button"
                  onClick={() => setAllSelected(false)}
                  className="text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 cursor-pointer"
                >
                  <Square className="h-3 w-3" /> Bỏ chọn
                </button>
              </div>
            </div>

            {cvLines.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                Chưa có dòng nào. Thêm từ kho ở trên hoặc tạo dòng mới.
              </p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={cvLines.map((l) => l.key)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {cvLines.map((line) => (
                      <SortableCvLine
                        key={line.key}
                        line={line}
                        isActive={line.key === activeKey}
                        onToggleSelect={toggleSelect}
                        onRemove={removeFromCv}
                        onSelect={setActiveKey}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
          </div>
        }
        right={
          /* FRAME 2: live preview only (also the WYSIWYG export target) */
          <div className="pl-1">
            <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sticky top-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Bản xem trước CV
                </p>
              </div>
              <CvPreview
                ref={docRef}
                header={header}
                lines={cvLines}
                templateId={templateId}
              />
            </div>
          </div>
        }
      />

      {showExport && (
        <CvExportModal
          editedCount={editedCount}
          newCount={newCount}
          selectedCount={selectedCount}
          onConfirm={async (opts) => {
            await handleExportConfirm(opts);
            setShowExport(false);
          }}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
};

export default CvBuilder;
