// utils/timeHelpers.js or wherever you keep utilities

/**
 * Applies a start and end time (in HH:mm format) to a given Dayjs date.
 * @param {dayjs.Dayjs} baseDate - A Dayjs object representing the base date.
 * @param {string} startStr - Start time in "HH:mm" format.
 * @param {string} endStr - End time in "HH:mm" format.
 * @returns {{ start: dayjs.Dayjs, end: dayjs.Dayjs }} - Start and end times applied to baseDate.
 */
export function applyTimeToDate(baseDate, startStr, endStr) {
  const [startHour, startMinute] = startStr.split(":").map(Number);
  const [endHour, endMinute] = endStr.split(":").map(Number);

  const start = baseDate.set("hour", startHour).set("minute", startMinute);
  const end = baseDate.set("hour", endHour).set("minute", endMinute);

  return { start, end };
}
