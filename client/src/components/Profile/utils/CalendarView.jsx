import { useEffect, useMemo, useState } from "react";
import { Button, Calendar, Card, Empty, Modal, Tag, Typography, message } from "antd";
import {
  CalendarOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  LeftOutlined,
  RightOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import dayjs from "../../../utils/dayjs";
import boy from "../../../images/profile/boys/boy0.png";
import girl from "../../../images/profile/girls/girl0.png";
import "./CalendarView.css";

const { Text, Title } = Typography;

const asLocalTime = (value) => {
  if (dayjs.isDayjs(value)) return value;
  return dayjs(value);
};

const ChildIcon = ({ item, compact = false }) => {
  const isMale = item.child_gender === "M";
  const isFemale = item.child_gender === "F";
  const label = item.child_name || (isMale ? "Boy" : isFemale ? "Girl" : "Child");
  return (
    <span
      className={`jp-child-icon ${isMale ? "is-boy" : isFemale ? "is-girl" : "is-neutral"} ${compact ? "is-compact" : ""}`}
      title={`${label}: ${item.listing_title || "Class"}`}
      aria-label={`${label} has a class`}
    >
      {isMale ? "♂" : isFemale ? "♀" : "•"}
    </span>
  );
};

const ChildAvatar = ({ item, compact = false }) => {
  const label = item.child_name || "Child";
  const image = item.child_gender === "M" ? boy : girl;
  return (
    <img
      className={`jp-child-avatar ${compact ? "is-compact" : ""}`}
      src={image}
      alt={label}
      title={`${label}: ${item.listing_title || "Class"}`}
    />
  );
};

const getStart = (item) =>
  item.rescheduled_to || item.scheduled_date || item.start_date;

const getEnd = (item) => {
  const originalStart = item.scheduled_date || item.start_date;
  const originalEnd = item.scheduled_end_date || item.end_date;

  if (!item.rescheduled_to || !originalStart || !originalEnd) return originalEnd;

  const duration = asLocalTime(originalEnd).diff(
    asLocalTime(originalStart),
    "minute",
  );
  return asLocalTime(item.rescheduled_to).add(duration, "minute");
};

const getStatus = (item) => {
  if (item.status === "cancelled") return "cancelled";
  if (item.rescheduled_to || item.status === "rescheduled") return "rescheduled";
  if (asLocalTime(getEnd(item) || getStart(item)).isBefore(dayjs())) return "past";
  return "upcoming";
};

const CalendarView = ({ bookings = [], occurrences = [], onAddToEmail }) => {
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [calendarValue, setCalendarValue] = useState(dayjs());
  const [nextClassIndex, setNextClassIndex] = useState(0);
  const [isMobileAgendaOpen, setIsMobileAgendaOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 1024);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1024px)");
    const updateLayout = (event) => {
      setIsMobile(event.matches);
      if (!event.matches) setIsMobileAgendaOpen(false);
    };

    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener("change", updateLayout);
    return () => mediaQuery.removeEventListener("change", updateLayout);
  }, []);

  const displayData = occurrences.length > 0 ? occurrences : bookings;

  const eventsByDate = useMemo(() => {
    const grouped = {};

    displayData.forEach((item) => {
      const start = getStart(item);
      if (!start || !asLocalTime(start).isValid()) return;

      const key = asLocalTime(start).format("YYYY-MM-DD");
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });

    Object.values(grouped).forEach((events) =>
      events.sort(
        (a, b) =>
          asLocalTime(getStart(a)).valueOf() -
          asLocalTime(getStart(b)).valueOf(),
      ),
    );

    return grouped;
  }, [displayData]);

  const selectedEvents = useMemo(
    () => eventsByDate[selectedDate.format("YYYY-MM-DD")] || [],
    [eventsByDate, selectedDate],
  );

  const upcomingEvents = useMemo(
    () =>
      displayData
        .filter(
          (item) =>
            getStatus(item) !== "cancelled" &&
            asLocalTime(getEnd(item) || getStart(item)).isAfter(dayjs()),
        )
        .sort(
          (a, b) =>
            asLocalTime(getStart(a)).valueOf() -
            asLocalTime(getStart(b)).valueOf(),
        ),
    [displayData],
  );

  const selectToday = () => {
    const today = dayjs();
    setSelectedDate(today);
    setCalendarValue(today);
  };

  const selectNextClass = () => {
    if (!upcomingEvents.length) return;

    const eventIndex = nextClassIndex % upcomingEvents.length;
    const date = asLocalTime(getStart(upcomingEvents[eventIndex]));
    setSelectedDate(date);
    setCalendarValue(date);
    setNextClassIndex((eventIndex + 1) % upcomingEvents.length);
  };

  const weekDays = useMemo(() => {
    const daysSinceMonday = (selectedDate.day() + 6) % 7;
    const weekStart = selectedDate.subtract(daysSinceMonday, "day");
    return Array.from({ length: 7 }, (_, index) => weekStart.add(index, "day"));
  }, [selectedDate]);

  const changeWeek = (amount) => {
    const nextDate = selectedDate.add(amount, "week");
    setSelectedDate(nextDate);
    setCalendarValue(nextDate);
  };

  const cellRender = (current, info) => {
    if (info.type !== "date") return info.originNode;

    const events = eventsByDate[current.format("YYYY-MM-DD")] || [];
    if (!events.length) return null;

    return (
      <div className="jp-calendar-children">
        {events.slice(0, 4).map((item) => {
          const status = getStatus(item);
          return (
            <span
              key={item.occurrence_id || item.booking_id}
              className={`jp-calendar-child is-${status}`}
            >
              <ChildAvatar item={item} />
            </span>
          );
        })}
        {events.length > 4 && (
          <span className="jp-calendar-more">+{events.length - 4}</span>
        )}
      </div>
    );
  };

  const addToCalendar = (item) => {
    const start = asLocalTime(getStart(item));
    const end = asLocalTime(getEnd(item));
    const escapeICal = (value = "") =>
      String(value)
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
    const formatDate = (date) => date.format("YYYYMMDDTHHmmss");
    const title = item.listing_title || "JuniorPass class";
    const description = `Class: ${title}\nPartner: ${item.partner_name || "N/A"}\nChild: ${item.child_name || "N/A"}`;
    const content = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//JuniorPass//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `DTSTART:${formatDate(start)}`,
      `DTEND:${formatDate(end)}`,
      `DTSTAMP:${formatDate(dayjs())}`,
      `UID:${item.occurrence_id || item.booking_id}@juniorpass.com`,
      `DESCRIPTION:${escapeICal(description)}`,
      `LOCATION:${escapeICal(item.outlet_address || "TBD")}`,
      `SUMMARY:${escapeICal(title)}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/[^a-z0-9]+/gi, "_")}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    onAddToEmail?.(item);
    message.success("Calendar event downloaded");
  };

  return (
    <div className={`jp-calendar-layout ${isMobile ? "is-mobile" : "is-desktop"}`}>
      {isMobile && (
      <Card className="jp-mobile-week-card" bordered={false}>
        <div className="jp-mobile-week-header">
          <Button
            type="text"
            icon={<LeftOutlined />}
            aria-label="Previous week"
            onClick={() => changeWeek(-1)}
          />
          <div>
            <Text strong>{selectedDate.format("MMMM YYYY")}</Text>
            <button type="button" onClick={selectToday}>Go to today</button>
          </div>
          <Button
            type="text"
            icon={<RightOutlined />}
            aria-label="Next week"
            onClick={() => changeWeek(1)}
          />
        </div>

        <div className="jp-mobile-week-strip">
          {weekDays.map((date) => {
            const events = eventsByDate[date.format("YYYY-MM-DD")] || [];
            const active = date.isSame(selectedDate, "day");
            const today = date.isSame(dayjs(), "day");
            return (
              <button
                type="button"
                key={date.format("YYYY-MM-DD")}
                className={`${active ? "is-active" : ""} ${today ? "is-today" : ""}`}
                onClick={() => {
                  setSelectedDate(date);
                  setCalendarValue(date);
                  if (events.length) setIsMobileAgendaOpen(true);
                }}
                aria-label={date.format("dddd, D MMMM")}
              >
                <span className="jp-mobile-weekday">
                  {date.format("dd").slice(0, 1)}
                </span>
                <strong>{date.format("D")}</strong>
                <span className="jp-mobile-child-icons">
                  {events.slice(0, 2).map((event) => (
                    <ChildAvatar
                      key={event.occurrence_id || event.booking_id}
                      item={event}
                      compact
                    />
                  ))}
                  {events.length > 2 && <small>+{events.length - 2}</small>}
                </span>
              </button>
            );
          })}
        </div>

        {upcomingEvents.length > 0 && (
          <Button block onClick={selectNextClass} className="jp-mobile-next-class">
            Jump to next class <RightOutlined />
          </Button>
        )}
      </Card>
      )}

      {!isMobile && (
      <Card className="jp-calendar-card" bordered={false}>
        <div className="jp-calendar-intro">
          <div>
            <Title level={4}>Class calendar</Title>
            <Text type="secondary">Select a date to see its full schedule.</Text>
          </div>
          <div className="jp-calendar-actions">
            <Button onClick={selectToday}>Today</Button>
            <Button
              type="primary"
              disabled={!upcomingEvents.length}
              onClick={selectNextClass}
            >
              Next class <RightOutlined />
            </Button>
          </div>
        </div>

        <div className="jp-calendar-legend" aria-label="Calendar status legend">
          <span><i className="is-upcoming" /> Upcoming</span>
          <span><i className="is-rescheduled" /> Rescheduled</span>
          <span><i className="is-cancelled" /> Cancelled</span>
        </div>

        <Calendar
          value={calendarValue}
          fullscreen
          cellRender={cellRender}
          onSelect={(date, info) => {
            setCalendarValue(date);
            if (!info || info.source === "date") setSelectedDate(date);
          }}
          onPanelChange={(date) => setCalendarValue(date)}
          className="jp-calendar"
        />
      </Card>
      )}

      {!isMobile && (
      <Card className="jp-agenda-card" bordered={false}>
        <div className="jp-agenda-header">
          <div>
            <Text type="secondary">Selected day</Text>
            <Title level={4}>{selectedDate.format("dddd, D MMMM")}</Title>
          </div>
          <Tag>{selectedEvents.length} {selectedEvents.length === 1 ? "class" : "classes"}</Tag>
        </div>

        {!selectedEvents.length ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No classes scheduled for this day"
          />
        ) : (
          <div className="jp-agenda-list">
            {selectedEvents.map((item) => {
              const start = getStart(item);
              const end = getEnd(item);
              const status = getStatus(item);
              return (
                <article
                  key={item.occurrence_id || item.booking_id}
                  className={`jp-agenda-item is-${status}`}
                >
                  <div className="jp-agenda-time">
                    <strong>{asLocalTime(start).format("HH:mm")}</strong>
                    <span>{asLocalTime(end).format("HH:mm")}</span>
                  </div>
                  <div className="jp-agenda-details">
                    <div className="jp-agenda-title-row">
                      <Text strong>{item.listing_title}</Text>
                      {status === "cancelled" && <Tag color="red">Cancelled</Tag>}
                      {status === "rescheduled" && <Tag color="orange">Rescheduled</Tag>}
                      {item.occurrence_number && (
                        <Tag>Class {item.occurrence_number}/{item.classes_total}</Tag>
                      )}
                    </div>
                    <Text type="secondary"><TeamOutlined /> {item.child_name || "Child"}</Text>
                    <Text type="secondary"><ClockCircleOutlined /> {item.partner_name || "Partner unavailable"}</Text>
                    {item.outlet_address && (
                      <Text type="secondary"><EnvironmentOutlined /> {item.outlet_address}</Text>
                    )}
                  </div>
                  {status !== "past" && status !== "cancelled" && (
                    <Button
                      icon={<CalendarOutlined />}
                      onClick={() => addToCalendar(item)}
                    >
                      Add
                    </Button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </Card>
      )}

      {isMobile && (
      <Modal
        open={isMobileAgendaOpen}
        onCancel={() => setIsMobileAgendaOpen(false)}
        footer={null}
        title={selectedDate.format("dddd, D MMMM")}
        className="jp-mobile-agenda-modal"
      >
        <div className="jp-mobile-dialog-summary">
          <Tag>
            {selectedEvents.length} {selectedEvents.length === 1 ? "class" : "classes"}
          </Tag>
        </div>
        <div className="jp-agenda-list">
          {selectedEvents.map((item) => {
            const start = getStart(item);
            const end = getEnd(item);
            const status = getStatus(item);
            return (
              <article
                key={item.occurrence_id || item.booking_id}
                className={`jp-agenda-item is-${status}`}
              >
                <div className="jp-agenda-time">
                  <strong>{asLocalTime(start).format("HH:mm")}</strong>
                  <span>{asLocalTime(end).format("HH:mm")}</span>
                </div>
                <div className="jp-agenda-details">
                  <div className="jp-mobile-child-heading">
                    <ChildAvatar item={item} />
                    <div>
                      <Text strong>{item.listing_title}</Text>
                      <Text type="secondary">{item.child_name || "Child"}</Text>
                    </div>
                  </div>
                  <div className="jp-agenda-title-row">
                    {status === "cancelled" && <Tag color="red">Cancelled</Tag>}
                    {status === "rescheduled" && <Tag color="orange">Rescheduled</Tag>}
                    {item.occurrence_number && (
                      <Tag>Class {item.occurrence_number}/{item.classes_total}</Tag>
                    )}
                  </div>
                  <Text type="secondary">
                    <ClockCircleOutlined /> {item.partner_name || "Partner unavailable"}
                  </Text>
                  {item.outlet_address && (
                    <Text type="secondary">
                      <EnvironmentOutlined /> {item.outlet_address}
                    </Text>
                  )}
                </div>
                {status !== "past" && status !== "cancelled" && (
                  <Button
                    type="primary"
                    icon={<CalendarOutlined />}
                    onClick={() => addToCalendar(item)}
                  >
                    Add to calendar
                  </Button>
                )}
              </article>
            );
          })}
        </div>
      </Modal>
      )}
    </div>
  );
};

export default CalendarView;
