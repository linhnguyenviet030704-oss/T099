import React from "react";
import { Plus, Trash2, Clock, AlertCircle } from "lucide-react";
import { useLang } from "../../context/LangContext";

export interface InterviewTimeSlot {
  start_time: string; // ISO datetime-local format: "YYYY-MM-DDTHH:mm"
  end_time: string;   // ISO datetime-local format: "YYYY-MM-DDTHH:mm"
}

/**
 * Chuyển đổi chuỗi slot (dạng ISO, dạng "start/end", hoặc object) sang InterviewTimeSlot chuẩn
 */
export function parseTimeSlot(slot: InterviewTimeSlot | string): InterviewTimeSlot {
  if (typeof slot === "object" && slot !== null) {
    return {
      start_time: slot.start_time || "",
      end_time: slot.end_time || "",
    };
  }

  if (typeof slot === "string") {
    if (slot.includes("/")) {
      const [start, end] = slot.split("/");
      return { start_time: start.slice(0, 16), end_time: end.slice(0, 16) };
    }
    if (slot.includes(" - ")) {
      const [start, end] = slot.split(" - ");
      return { start_time: start.slice(0, 16), end_time: end.slice(0, 16) };
    }
    // Chỉ có 1 mốc, tạo mặc định 1 tiếng sau
    const startDate = new Date(slot);
    if (!isNaN(startDate.getTime())) {
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      return {
        start_time: slot.slice(0, 16),
        end_time: endDate.toISOString().slice(0, 16),
      };
    }
    return { start_time: slot, end_time: "" };
  }

  return { start_time: "", end_time: "" };
}

/**
 * Chuyển đổi slot sang chuỗi format API "start/end"
 */
export function toSlotApiString(slot: InterviewTimeSlot | string): string {
  const parsed = parseTimeSlot(slot);
  if (!parsed.start_time) return "";
  if (!parsed.end_time) return parsed.start_time;
  return `${parsed.start_time}/${parsed.end_time}`;
}

/**
 * Format hiển thị khoảng thời gian phỏng vấn thân thiện
 * Ví dụ: "09:00 - 10:00 · Thứ Ba, 01/09/2026"
 */
export function formatSlotDisplay(slot: InterviewTimeSlot | string, lang: string = "vi"): string {
  const parsed = parseTimeSlot(slot);
  if (!parsed.start_time) return typeof slot === "string" ? slot : "";

  try {
    const startDate = new Date(parsed.start_time);
    if (isNaN(startDate.getTime())) return typeof slot === "string" ? slot : "";

    const dateFormatted = startDate.toLocaleDateString(lang === "en" ? "en-US" : "vi-VN", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    const startTimeFormatted = startDate.toLocaleTimeString(lang === "en" ? "en-US" : "vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    if (parsed.end_time) {
      const endDate = new Date(parsed.end_time);
      if (!isNaN(endDate.getTime())) {
        const endTimeFormatted = endDate.toLocaleTimeString(lang === "en" ? "en-US" : "vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        return `${startTimeFormatted} - ${endTimeFormatted} · ${dateFormatted}`;
      }
    }

    return `${startTimeFormatted} · ${dateFormatted}`;
  } catch {
    return typeof slot === "string" ? slot : "";
  }
}

/**
 * Validate các khoảng thời gian phỏng vấn:
 * 1. start_time và end_time hợp lệ (end > start, tối thiểu 15 phút).
 * 2. Không trùng lặp (non-overlapping).
 * 3. Cách nhau ít nhất 4 giờ (4 hours gap).
 */
export function validateTimeSlots(
  slots: InterviewTimeSlot[],
  lang: string = "vi"
): { isValid: boolean; error: string | null; slotErrors: Record<number, string> } {
  const slotErrors: Record<number, string> = {};

  if (!slots || slots.length === 0) {
    return {
      isValid: false,
      error: lang === "en" ? "Please provide at least one time slot" : "Vui lòng nhập ít nhất một khoảng thời gian đề xuất",
      slotErrors: {},
    };
  }

  // 1. Kiểm tra từng slot riêng lẻ
  const parsedList: { index: number; start: number; end: number }[] = [];

  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s.start_time || !s.end_time) {
      slotErrors[i] = lang === "en" ? "Please fill both start and end time" : "Vui lòng chọn đầy đủ thời gian bắt đầu và kết thúc";
      continue;
    }

    const startMs = new Date(s.start_time).getTime();
    const endMs = new Date(s.end_time).getTime();

    if (isNaN(startMs) || isNaN(endMs)) {
      slotErrors[i] = lang === "en" ? "Invalid date format" : "Định dạng thời gian không hợp lệ";
      continue;
    }

    if (endMs <= startMs) {
      slotErrors[i] = lang === "en" ? "End time must be after start time" : "Thời gian kết thúc phải sau thời gian bắt đầu";
      continue;
    }

    const durationMinutes = (endMs - startMs) / (60 * 1000);
    if (durationMinutes < 15) {
      slotErrors[i] = lang === "en" ? "Slot duration must be at least 15 minutes" : "Khoảng thời gian phỏng vấn tối thiểu là 15 phút";
      continue;
    }

    parsedList.push({ index: i, start: startMs, end: endMs });
  }

  if (Object.keys(slotErrors).length > 0) {
    return {
      isValid: false,
      error: Object.values(slotErrors)[0],
      slotErrors,
    };
  }

  // 2. Sắp xếp theo start time để kiểm tra overlap và khoảng cách 4h
  parsedList.sort((a, b) => a.start - b.start);

  const MIN_GAP_MS = 4 * 60 * 60 * 1000; // 4 giờ

  for (let i = 0; i < parsedList.length - 1; i++) {
    const curr = parsedList[i];
    const next = parsedList[i + 1];

    // Kiểm tra trùng lặp (Overlap)
    if (next.start < curr.end) {
      const err = lang === "en"
        ? "Time slots must not overlap"
        : "Các khoảng thời gian không được trùng lặp nhau để tránh spam";
      slotErrors[next.index] = err;
      slotErrors[curr.index] = err;
      return { isValid: false, error: err, slotErrors };
    }

    // Kiểm tra khoảng cách tối thiểu 4h
    const gapMs = next.start - curr.end;
    if (gapMs < MIN_GAP_MS) {
      const gapHours = (gapMs / (60 * 60 * 1000)).toFixed(1);
      const err = lang === "en"
        ? `Slots must be at least 4 hours apart (current gap: ${gapHours}h)`
        : `Các khoảng thời gian cần cách nhau ít nhất 4 giờ (hiện cách ${gapHours}h)`;
      slotErrors[next.index] = err;
      return { isValid: false, error: err, slotErrors };
    }
  }

  return { isValid: true, error: null, slotErrors: {} };
}

interface InterviewTimeSlotPickerProps {
  slots: InterviewTimeSlot[];
  onChange: (slots: InterviewTimeSlot[]) => void;
  minSlots?: number;
  maxSlots?: number;
  label?: string;
  description?: string;
  disabled?: boolean;
}

/**
 * Component Form dùng chung cho cả Nhà tuyển dụng và Ứng viên để chọn các khoảng thời gian phỏng vấn
 */
export const InterviewTimeSlotPicker: React.FC<InterviewTimeSlotPickerProps> = ({
  slots,
  onChange,
  minSlots = 1,
  maxSlots = 5,
  label,
  description,
  disabled = false,
}) => {
  const { lang } = useLang();

  // Thêm slot mới (tự động gợi ý 4h sau slot cuối cùng)
  const handleAddSlot = () => {
    if (slots.length >= maxSlots) return;

    let defaultStart = "";
    let defaultEnd = "";

    if (slots.length > 0) {
      const lastSlot = slots[slots.length - 1];
      if (lastSlot.end_time) {
        const lastEnd = new Date(lastSlot.end_time);
        if (!isNaN(lastEnd.getTime())) {
          // Cách 4 tiếng sau slot trước đó
          const nextStart = new Date(lastEnd.getTime() + 4 * 60 * 60 * 1000);
          const nextEnd = new Date(nextStart.getTime() + 60 * 60 * 1000);
          defaultStart = nextStart.toISOString().slice(0, 16);
          defaultEnd = nextEnd.toISOString().slice(0, 16);
        }
      }
    } else {
      // Mặc định ngày mai lúc 9h sáng
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      const tomorrowEnd = new Date(tomorrow.getTime() + 60 * 60 * 1000);
      defaultStart = tomorrow.toISOString().slice(0, 16);
      defaultEnd = tomorrowEnd.toISOString().slice(0, 16);
    }

    onChange([...slots, { start_time: defaultStart, end_time: defaultEnd }]);
  };

  // Xóa slot
  const handleRemoveSlot = (index: number) => {
    if (slots.length <= minSlots) return;
    onChange(slots.filter((_, i) => i !== index));
  };

  // Cập nhật giá trị
  const handleSlotChange = (index: number, field: "start_time" | "end_time", value: string) => {
    const updated = [...slots];
    const current = { ...updated[index], [field]: value };

    // Tự động set end_time = start_time + 1h nếu end_time chưa có hoặc nhỏ hơn start_time
    if (field === "start_time" && value) {
      const startDt = new Date(value);
      if (!isNaN(startDt.getTime())) {
        const endDt = new Date(current.end_time);
        if (!current.end_time || isNaN(endDt.getTime()) || endDt <= startDt) {
          const autoEnd = new Date(startDt.getTime() + 60 * 60 * 1000);
          current.end_time = autoEnd.toISOString().slice(0, 16);
        }
      }
    }

    updated[index] = current;
    onChange(updated);
  };

  const validation = validateTimeSlots(slots, lang);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
            {label || (lang === "en" ? "Proposed Interview Time Slots (Range):" : "Các khoảng thời gian phỏng vấn đề xuất:")}
          </label>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {description || (lang === "en"
              ? "Each time slot must be at least 15 minutes. Different slots must be at least 4 hours apart."
              : "Chọn khoảng thời gian (Từ - Đến). Các khoảng thời gian khác nhau cần cách nhau ít nhất 4h và không trùng lặp.")}
          </p>
        </div>
        {slots.length < maxSlots && (
          <button
            type="button"
            onClick={handleAddSlot}
            disabled={disabled}
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Plus size={14} />
            {lang === "en" ? "Add Range" : "Thêm khoảng giờ"}
          </button>
        )}
      </div>

      <div className="space-y-2.5">
        {slots.map((slot, index) => {
          const hasError = Boolean(validation.slotErrors[index]);
          const errorMsg = validation.slotErrors[index];

          return (
            <div
              key={index}
              className={`p-3 rounded-xl border transition-all ${
                hasError
                  ? "bg-rose-50/70 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800"
                  : "bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1">
                  <Clock size={12} className="text-indigo-500" />
                  {lang === "en" ? `Slot ${index + 1}:` : `Khoảng thời gian ${index + 1}:`}
                </span>
                {slots.length > minSlots && (
                  <button
                    type="button"
                    onClick={() => handleRemoveSlot(index)}
                    disabled={disabled}
                    className="text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 p-1 rounded transition-colors cursor-pointer"
                    title={lang === "en" ? "Delete slot" : "Xóa mốc này"}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                    {lang === "en" ? "From (Start):" : "Từ (Bắt đầu):"}
                  </span>
                  <input
                    type="datetime-local"
                    value={slot.start_time}
                    onChange={(e) => handleSlotChange(index, "start_time", e.target.value)}
                    disabled={disabled}
                    className={`w-full px-2.5 py-1.5 bg-white dark:bg-slate-700 border rounded-lg text-xs text-slate-900 dark:text-white transition-colors ${
                      hasError
                        ? "border-rose-400 focus:ring-rose-400"
                        : "border-slate-200 dark:border-slate-600 focus:ring-indigo-500"
                    }`}
                  />
                </div>

                <div>
                  <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                    {lang === "en" ? "To (End):" : "Đến (Kết thúc):"}
                  </span>
                  <input
                    type="datetime-local"
                    value={slot.end_time}
                    onChange={(e) => handleSlotChange(index, "end_time", e.target.value)}
                    disabled={disabled}
                    className={`w-full px-2.5 py-1.5 bg-white dark:bg-slate-700 border rounded-lg text-xs text-slate-900 dark:text-white transition-colors ${
                      hasError
                        ? "border-rose-400 focus:ring-rose-400"
                        : "border-slate-200 dark:border-slate-600 focus:ring-indigo-500"
                    }`}
                  />
                </div>
              </div>

              {hasError && (
                <div className="flex items-center gap-1.5 text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-1.5">
                  <AlertCircle size={12} className="shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {slots.length === 0 && (
        <button
          type="button"
          onClick={handleAddSlot}
          disabled={disabled}
          className="w-full py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-indigo-400 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <Plus size={14} />
          {lang === "en" ? "Add Time Slot Range" : "Thêm khoảng thời gian phỏng vấn"}
        </button>
      )}
    </div>
  );
};

export default InterviewTimeSlotPicker;
