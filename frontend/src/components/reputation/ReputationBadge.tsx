import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react';

interface Props {
  /** Điểm uy tín (0-100) */
  score: number;
  /** Vai trò đánh giá uy tín */
  role?: 'recruiter' | 'candidate';
  /** Trạng thái đang tải dữ liệu */
  loading?: boolean;
  /** Cho phép hiện tooltip chi tiết */
  showTooltip?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/** ReputationBadge - Hiển thị điểm uy tín của Nhà tuyển dụng hoặc Ứng viên.
 *
 * Màu sắc:
 * - >= 80: Xanh lá (Uy tín cao)
 * - 50 - 79: Vàng cam (Uy tín trung bình)
 * - < 50: Đỏ (Uy tín thấp / Có vi phạm)
 */
export function ReputationBadge({
  score,
  role = 'recruiter',
  loading = false,
  showTooltip = true,
  size = 'md',
  className = '',
}: Props) {
  if (loading) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 animate-pulse bg-slate-100 dark:bg-slate-800 rounded-full ${
          size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
        } ${className}`}
      >
        <div className="w-3.5 h-3.5 rounded-full bg-slate-300 dark:bg-slate-600" />
        <div className="w-8 h-3 rounded bg-slate-300 dark:bg-slate-600" />
      </div>
    );
  }

  // Phân loại mức điểm
  const isHigh = score >= 80;
  const isMedium = score >= 50 && score < 80;
  const isLow = score < 50;

  const colorClasses = isHigh
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
    : isMedium
      ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
      : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800';

  const Icon = isHigh ? ShieldCheck : isLow ? ShieldAlert : Shield;

  const roleText = role === 'recruiter' ? 'Nhà tuyển dụng' : 'Ứng viên';
  const labelText = isHigh
    ? 'Uy tín cao'
    : isMedium
      ? 'Uy tín trung bình'
      : 'Cần chú ý uy tín';

  const tooltipContent = `Điểm uy tín ${roleText}: ${score}/100 (${labelText}). ${
    role === 'recruiter'
      ? 'Điểm bị trừ nếu không phản hồi CV đúng hạn.'
      : 'Điểm bị trừ nếu vắng mặt hoặc rút hẹn phỏng vấn đột ngột.'
  }`;

  return (
    <div
      className={`inline-flex items-center gap-1.5 border font-medium rounded-full transition-colors ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
      } ${colorClasses} ${className}`}
      title={showTooltip ? tooltipContent : undefined}
      aria-label={`Điểm uy tín: ${score}/100`}
    >
      <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      <span className="font-semibold">{score}</span>
      <span className="text-[11px] opacity-80 hidden sm:inline">{labelText}</span>
    </div>
  );
}
