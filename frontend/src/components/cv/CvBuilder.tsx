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
  Upload,
  Globe,
  Sliders,
  RotateCcw,
} from 'lucide-react';
import { UserProfileLine, Profile } from '../../types';
import {
  CvHeader,
  CvLine,
  createBlankCvLine,
  profileLineToCvLine,
} from '../../lib/cv';
import {
  LineType,
  lineContentDiffers,
  getLineTypeLabel,
} from '../../lib/profileLines';
import { SortableCvLine } from './SortableCvLine';
import { CvPreview } from './CvPreview';
import { CvLineEditor } from './CvLineEditor';
import { CvExportModal, ExportOptions } from './CvExportModal';
import { SplitPane } from '../SplitPane';
import {
  CV_TEMPLATES,
  CvTemplateId,
  SECTION_ORDER,
  SECTION_LABELS_VI,
  SECTION_LABELS_EN,
} from '../../lib/cvTemplates';
import { supabase } from '../../lib/supabase';
import { buildResumeStoragePath } from '../../lib/storage';
import { ingestResume } from '../../lib/ingest';
import { useLang } from '../../context/LangContext';

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
    lang: 'vi' | 'en';
    customTitles?: Partial<Record<LineType, string>>;
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
  const { lang: appLang, t } = useLang();
  const [cvLang, setCvLang] = useState<'vi' | 'en'>(appLang || 'vi');
  const [customTitles, setCustomTitles] = useState<Partial<Record<LineType, string>>>({});
  const [showTitleCustomizer, setShowTitleCustomizer] = useState(false);

  const [header, setHeader] = useState<CvHeader>({
    full_name: profile.full_name || '',
    email: email || profile.email || '',
    phone: profile.phone || '',
    avatar_url: profile.avatar_url || '',
  });

  const [cvLines, setCvLines] = useState<CvLine[]>(() => {
    const mapped = sourceLines.map(profileLineToCvLine);
    return [...mapped].sort((a, b) => {
      const orderA = SECTION_ORDER.indexOf(a.name);
      const orderB = SECTION_ORDER.indexOf(b.name);
      const idxA = orderA === -1 ? 999 : orderA;
      const idxB = orderB === -1 ? 999 : orderB;
      return idxA - idxB;
    });
  });
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

  const [uploadingIngest, setUploadingIngest] = useState(false);

  const addBlankLine = () => {
    // Anti-spam safeguard: Don't create another empty line if one already exists
    const hasEmpty = cvLines.some((l) => !l.value.trim());
    if (hasEmpty) return;
    const blank = createBlankCvLine();
    setCvLines((prev) => [...prev, blank]);
    setActiveKey(blank.key);
  };

  const setAllSelected = (selected: boolean) =>
    setCvLines((prev) => prev.map((l) => ({ ...l, selected })));

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !supabase) return;
    const MAX_SIZE_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      alert(`Dung lượng file (${(file.size / 1024 / 1024).toFixed(1)}MB) vượt quá giới hạn tối đa 10MB.`);
      return;
    }
    setUploadingIngest(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Chưa đăng nhập");
      const resumeId = crypto.randomUUID();
      const storagePath = buildResumeStoragePath(user.id, resumeId, file.name);
      const { error: uploadErr } = await supabase.storage.from("resumes").upload(storagePath, file, { upsert: false });
      if (uploadErr) throw uploadErr;
      await supabase.from("resumes").insert({
        id: resumeId, user_id: user.id, bucket_id: "resumes", storage_path: storagePath,
        original_filename: file.name, title: file.name.replace(/\.[^.]+$/, ""), mime_type: file.type,
        size_bytes: file.size, is_default: false,
      });
      const session = (await supabase.auth.getSession()).data.session;
      if (session?.access_token) {
        try { await ingestResume(resumeId, session.access_token); } catch {}
      }
      const { data } = await supabase.from("profile_lines").select("*").eq("user_id", user.id).order("display_order");
      if (data && data.length > 0) {
        const fresh = data as UserProfileLine[];
        setCvLines(fresh.map(profileLineToCvLine));
      }
    } catch (err: any) {
      alert(`Không thể bóc tách CV: ${err?.message || "Lỗi không xác định"}`);
    } finally {
      setUploadingIngest(false);
      e.target.value = "";
    }
  };

  const handleExportConfirm = async (options: ExportOptions) => {
    if (!docRef.current) throw new Error(cvLang === 'en' ? 'CV preview not found.' : 'Không tìm thấy bản xem trước CV.');
    // Filter out empty lines to prevent empty payload spam
    const validLines = cvLines.filter((l) => l.value.trim() !== '');
    if (validLines.length === 0) {
      throw new Error(
        cvLang === 'en'
          ? 'CV has no valid content lines to export.'
          : 'CV chưa có dòng nội dung hợp lệ nào để xuất.',
      );
    }
    await onExport({
      docNode: docRef.current,
      header,
      lines: validLines,
      options,
      templateId,
      lang: cvLang,
      customTitles,
    });
  };

  const isEn = cvLang === 'en';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Builder toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t.cvBuilderTitle}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t.linesSummary(selectedCount, newCount, editedCount)}
            </p>
          </div>
        </div>

        {/* Action Controls & Language Selector */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-between sm:justify-end">
          {/* Section Language Switcher Pill */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700/60 p-1 rounded-xl border border-slate-200 dark:border-slate-600">
            <Globe className="h-3.5 w-3.5 text-slate-400 dark:text-slate-400 ml-1" />
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1 hidden sm:inline">
              {t.cvSectionLanguage}:
            </span>
            <button
              type="button"
              onClick={() => setCvLang('vi')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                cvLang === 'vi'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-indigo-600'
              }`}
              title="Tiêu đề hồ sơ hiển thị Tiếng Việt"
            >
              🇻🇳 Tiếng Việt
            </button>
            <button
              type="button"
              onClick={() => setCvLang('en')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                cvLang === 'en'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-indigo-600'
              }`}
              title="Change CV section titles to English"
            >
              🇬🇧 English
            </button>
          </div>

          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowTitleCustomizer((v) => !v)}
            className={`px-3 py-2 border rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
              showTitleCustomizer
                ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400'
                : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border-transparent text-slate-600 dark:text-slate-300'
            }`}
            title={t.customSectionTitles}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t.customSectionTitles}</span>
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            {t.exitBtn}
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.02 }}
            onClick={() => setShowExport(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-md shadow-emerald-200 dark:shadow-emerald-900/30"
          >
            <FileDown className="h-4 w-4" />
            {t.exportCV}
          </motion.button>
        </div>
      </div>

      {/* Optional Title Customizer Panel */}
      {showTitleCustomizer && (
        <div className="bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800/60 rounded-2xl p-4 sm:p-5 space-y-4 animate-slide-up shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5" />
                {t.customSectionTitles} ({isEn ? 'English' : 'Tiếng Việt'})
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t.sectionTitlesHint}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCustomTitles({})}
              className="text-xs text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              {t.resetTitles}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {SECTION_ORDER.map((type) => {
              const defaultLabel = isEn ? SECTION_LABELS_EN[type] : SECTION_LABELS_VI[type];
              const value = customTitles[type] ?? '';
              return (
                <div key={type} className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
                    {getLineTypeLabel(type, cvLang)}
                  </label>
                  <input
                    type="text"
                    value={value}
                    placeholder={defaultLabel}
                    onChange={(e) =>
                      setCustomTitles((prev) => ({
                        ...prev,
                        [type]: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Template picker */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
        <button
          type="button"
          onClick={() => setTemplatesOpen((v) => !v)}
          className="w-full flex items-center justify-between cursor-pointer group"
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200">
            {t.selectTemplate} ({CV_TEMPLATES.length})
          </p>
          <span className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
            {templatesOpen ? t.collapse : t.expand}
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${
                templatesOpen ? 'rotate-180' : ''
              }`}
            />
          </span>
        </button>

        {templatesOpen ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-56 overflow-y-auto pr-1 mt-3">
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
            {t.selectedTemplateText}{' '}
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
          <div className="space-y-4 pr-0 lg:pr-1">
            {/* Source pool */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  {t.masterPool}
                </h4>
                {availableSource.length > 0 && (
                  <button
                    type="button"
                    onClick={addAllSource}
                    className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer"
                  >
                    {t.addAllSource}
                  </button>
                )}
              </div>

              {availableSource.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                  {t.allSourceAdded}
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
                          {getLineTypeLabel(line.name, cvLang)}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={addBlankLine}
                  className="border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-500 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  {t.createNewLine}
                </button>
                <label className="border-2 border-dashed border-indigo-300 dark:border-indigo-700 hover:border-indigo-400 dark:hover:border-indigo-500 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer bg-indigo-50/50 dark:bg-indigo-900/10">
                  <Upload className="h-4 w-4" />
                  {uploadingIngest ? t.uploadingIngestText : t.uploadIngest}
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    disabled={uploadingIngest}
                    className="hidden"
                    onChange={(e) => void handleFileUpload(e)}
                  />
                </label>
              </div>
            </div>

            {/* Inline editor for the active line */}
            {activeLine && (
              <CvLineEditor
                line={activeLine}
                onChange={updateActiveLine}
                onClose={() => setActiveKey(null)}
                lang={cvLang}
              />
            )}

            {/* Header editor */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  {t.nameLabel}
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
                  {t.emailLabel}
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
                  {t.phoneLabel}
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
                  {t.sortAndSelect} ({cvLines.length})
                </h4>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAllSelected(true)}
                    className="text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 cursor-pointer"
                  >
                    <CheckSquare className="h-3 w-3" /> {t.selectAll}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllSelected(false)}
                    className="text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 cursor-pointer"
                  >
                    <Square className="h-3 w-3" /> {t.deselectAll}
                  </button>
                </div>
              </div>

              {cvLines.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                  {t.noSelectedLines}
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
                          lang={cvLang}
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
          <div className="pl-0 lg:pl-1 w-full overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-2 sm:p-4 lg:sticky lg:top-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  {t.cvPreviewTitle} ({isEn ? 'English' : 'Tiếng Việt'})
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    {cvLang === 'en' ? '🇬🇧 English titles' : '🇻🇳 Tiêu đề tiếng Việt'}
                  </span>
                </div>
              </div>
              <CvPreview
                ref={docRef}
                header={header}
                lines={cvLines}
                templateId={templateId}
                lang={cvLang}
                customTitles={customTitles}
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
          lang={cvLang}
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

