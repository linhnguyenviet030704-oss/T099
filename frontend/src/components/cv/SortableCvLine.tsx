import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Eye, EyeOff } from 'lucide-react';
import { CvLine } from '../../lib/cv';
import { LINE_TYPE_OPTIONS } from '../../lib/profileLines';

const lineTypeLabel = (value: string): string =>
  LINE_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;

interface SortableCvLineProps {
  line: CvLine;
  isActive: boolean;
  onToggleSelect: (key: string) => void;
  onRemove: (key: string) => void;
  onSelect: (key: string) => void;
}

/**
 * One draggable row inside the CV preview column. Shows selection toggle,
 * drag handle, remove-from-CV button, and a compact summary. Clicking it opens
 * the inline editor in the parent.
 */
export const SortableCvLine: React.FC<SortableCvLineProps> = ({
  line,
  isActive,
  onToggleSelect,
  onRemove,
  onSelect,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: line.key });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(line.key)}
      className={`group flex items-start gap-2 rounded-xl border p-3 bg-white dark:bg-slate-800 cursor-pointer transition ${
        isActive
          ? 'border-emerald-400 dark:border-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-900/40'
          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
      } ${line.selected ? '' : 'opacity-50'}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="mt-0.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 cursor-grab active:cursor-grabbing touch-none"
        title="Kéo để sắp xếp"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex-1 min-w-0">
        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800 mb-1">
          {lineTypeLabel(line.name)}
        </span>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 line-clamp-3 whitespace-pre-line">
          {line.value || '(Chưa có nội dung)'}
        </p>
        {line.sourceId === null && (
          <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 px-1.5 py-0.5 rounded">
            Dòng mới
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(line.key);
          }}
          title={line.selected ? 'Bỏ khỏi CV' : 'Đưa vào CV'}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer"
        >
          {line.selected ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(line.key);
          }}
          title="Xóa khỏi CV (không xóa hồ sơ gốc)"
          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

export default SortableCvLine;
