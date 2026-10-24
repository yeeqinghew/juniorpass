import dayjs from "./dayjs";
import type { ConfigType } from "dayjs";

// Class schedules are Singapore wall-clock values. PostgreSQL can serialize
// those timestamp-without-time-zone fields with a trailing `Z`, so do not let
// the browser apply a second timezone conversion when rendering a class.
export const parseClassScheduleTime = (value: ConfigType) => {
  if (dayjs.isDayjs(value)) return value;

  const match = String(value || "").match(
    /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}(?::\d{2})?)/,
  );

  return match ? dayjs(`${match[1]}T${match[2]}`) : dayjs(value);
};

export const formatClassScheduleTime = (value: ConfigType): string =>
  parseClassScheduleTime(value).format("HH:mm");

export const formatClassScheduleTime12Hour = (value: ConfigType): string =>
  parseClassScheduleTime(value).format("h:mm a");
