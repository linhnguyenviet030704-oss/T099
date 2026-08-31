export type ParsedSseEvent = {
  event: string;
  data: unknown;
};

/**
 * Phân tích phần data của SSE. Chỉ lỗi JSON bị bỏ qua; lỗi nghiệp vụ từ
 * callback phải được truyền ngược lên caller để UI không hiểu nhầm là thành công.
 */
export function dispatchSseJson(
  eventName: string,
  rawData: string,
  onEvent: (event: ParsedSseEvent) => void,
): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawData);
  } catch {
    return false;
  }

  onEvent({ event: eventName, data: parsed });
  return true;
}
