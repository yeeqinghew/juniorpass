const getScheduleCapacity = ({ is_progressive, capacity, slots }) =>
  Number(is_progressive ? capacity : slots);

const getBookedCapacityQuery = ({
  isProgressive,
  scheduleGroupId,
  scheduleId,
  startDate,
}) =>
  isProgressive
    ? {
        text: `SELECT COUNT(*)::integer AS count
               FROM bookings
               WHERE schedule_group_id = $1
                 AND status = 'confirmed'`,
        values: [scheduleGroupId],
      }
    : {
        text: `SELECT COUNT(*)::integer AS count
               FROM bookings
               WHERE schedule_id = $1
                 AND DATE(start_date) = DATE($2::timestamp)
                 AND status = 'confirmed'`,
        values: [scheduleId, startDate],
      };

module.exports = { getBookedCapacityQuery, getScheduleCapacity };
