const nullableNumber = (value) =>
  value === null || value === undefined || value === "" ? null : Number(value);

const dateOnly = (value) => {
  if (!value) return null;
  const text = String(value);
  const isoDate = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDate) return isoDate[1];
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const sortedPackageTypes = (value) =>
  Array.isArray(value) ? [...value].map(String).sort() : [];

const normalizedTimeSlots = (slots, isProgressive, capacity) =>
  (slots || [])
    .map((slot) => ({
      day: slot.day,
      start_time: String(slot.start_time ?? slot.timeslot?.[0] ?? "").slice(
        0,
        5,
      ),
      end_time: String(slot.end_time ?? slot.timeslot?.[1] ?? "").slice(0, 5),
      slots: Number(isProgressive ? capacity : slot.slots),
    }))
    .sort((a, b) =>
      `${a.day}-${a.start_time}-${a.end_time}`.localeCompare(
        `${b.day}-${b.start_time}-${b.end_time}`,
      ),
    );

const hasStructuralScheduleChange = (existing, submitted, existingSlots) => {
  const existingStructure = {
    package_types: sortedPackageTypes(existing.package_types),
    is_progressive: Boolean(existing.is_progressive),
    capacity: nullableNumber(existing.capacity),
    frequency: existing.frequency,
    full_term_start_date: dateOnly(existing.full_term_start_date),
    full_term_class_count: nullableNumber(existing.full_term_class_count),
    short_term_class_count: nullableNumber(existing.short_term_class_count),
    time_slots: normalizedTimeSlots(
      existingSlots,
      existing.is_progressive,
      existing.capacity,
    ),
  };
  const submittedStructure = {
    package_types: sortedPackageTypes(submitted.package_types),
    is_progressive: Boolean(submitted.is_progressive),
    capacity: submitted.is_progressive
      ? nullableNumber(submitted.capacity)
      : null,
    frequency: submitted.frequency,
    full_term_start_date: dateOnly(submitted.full_term_start_date),
    full_term_class_count: nullableNumber(submitted.full_term_class_count),
    short_term_class_count: nullableNumber(submitted.short_term_class_count),
    time_slots: normalizedTimeSlots(
      submitted.time_slots,
      submitted.is_progressive,
      submitted.capacity,
    ),
  };

  return JSON.stringify(existingStructure) !== JSON.stringify(submittedStructure);
};

module.exports = { dateOnly, hasStructuralScheduleChange };
