import React from 'react';
import { Indent, Outdent, List, ListTree, CornerDownRight } from 'lucide-react';
import { applyIndentChange, applyBulletLevel } from '../lib/entryFormat';

interface EntryIndentToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (val: string) => void;
  lang?: 'vi' | 'en';
}

export const EntryIndentToolbar: React.FC<EntryIndentToolbarProps> = ({
  textareaRef,
  value,
  onChange,
  lang = 'vi',
}) => {
  const isEn = lang === 'en';

  return (
    <div className="flex items-center gap-1.5 flex-wrap py-1.5 px-2 bg-slate-100 dark:bg-slate-700/60 rounded-xl border border-slate-200 dark:border-slate-600 mb-1.5 text-xs">
      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mr-1 hidden sm:inline">
        {isEn ? 'Format:' : 'Định dạng:'}
      </span>

      <button
        type="button"
        onClick={() => applyIndentChange(textareaRef.current, -1, value, onChange)}
        className="px-2 py-1 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-200 flex items-center gap-1 text-[11px] font-medium transition cursor-pointer shadow-xs"
        title={isEn ? 'Outdent (Shift+Tab)' : 'Giảm thụt lề (Shift+Tab)'}
      >
        <Outdent size={13} className="text-slate-500 dark:text-slate-400" />
        <span>{isEn ? 'Outdent' : 'Giảm lề'}</span>
      </button>

      <button
        type="button"
        onClick={() => applyIndentChange(textareaRef.current, 1, value, onChange)}
        className="px-2 py-1 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-200 flex items-center gap-1 text-[11px] font-medium transition cursor-pointer shadow-xs"
        title={isEn ? 'Indent (Tab)' : 'Thụt lề (Tab)'}
      >
        <Indent size={13} className="text-slate-500 dark:text-slate-400" />
        <span>{isEn ? 'Indent' : 'Thụt lề'}</span>
      </button>

      <div className="h-4 w-px bg-slate-200 dark:bg-slate-600 mx-0.5" />

      <button
        type="button"
        onClick={() => applyBulletLevel(textareaRef.current, 1, value, onChange)}
        className="px-2 py-1 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-200 flex items-center gap-1 text-[11px] font-medium transition cursor-pointer shadow-xs"
        title={isEn ? 'Level 1 bullet (- item)' : 'Bullet Cấp 1 (- nội dung)'}
      >
        <List size={13} className="text-indigo-500" />
        <span>• {isEn ? 'Level 1' : 'Cấp 1'}</span>
      </button>

      <button
        type="button"
        onClick={() => applyBulletLevel(textareaRef.current, 2, value, onChange)}
        className="px-2 py-1 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-200 flex items-center gap-1 text-[11px] font-medium transition cursor-pointer shadow-xs"
        title={isEn ? 'Level 2 double indent (  - item)' : 'Bullet Cấp 2 / Thụt đôi (  - nội dung)'}
      >
        <CornerDownRight size={13} className="text-indigo-500" />
        <span>◦ {isEn ? 'Double (L2)' : 'Cấp 2 (Double)'}</span>
      </button>

      <button
        type="button"
        onClick={() => applyBulletLevel(textareaRef.current, 3, value, onChange)}
        className="px-2 py-1 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-200 flex items-center gap-1 text-[11px] font-medium transition cursor-pointer shadow-xs"
        title={isEn ? 'Level 3 triple indent (    - item)' : 'Bullet Cấp 3 / Thụt ba (    - nội dung)'}
      >
        <ListTree size={13} className="text-indigo-500" />
        <span>▪ {isEn ? 'Triple (L3)' : 'Cấp 3 (Triple)'}</span>
      </button>

      <div className="ml-auto hidden md:flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-400">
        <span className="bg-slate-200 dark:bg-slate-600 px-1.5 py-0.5 rounded font-mono">Tab</span>
        <span>/</span>
        <span className="bg-slate-200 dark:bg-slate-600 px-1.5 py-0.5 rounded font-mono">Shift+Tab</span>
      </div>
    </div>
  );
};

export default EntryIndentToolbar;
