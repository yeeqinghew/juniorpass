import { useState, useMemo } from "react";
import {
  Calendar,
  Modal,
  Button,
  Tag,
  Space,
  Typography,
  List,
  Empty,
  Card,
  Tooltip,
  message,
} from "antd";
import {
  CalendarOutlined,
  ClockCircleOutlined,
  MailOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import "./CalendarView.css";

dayjs.extend(isBetween);

const { Text, Title } = Typography;

const CalendarView = ({ bookings = [], occurrences = [], onAddToEmail }) => {
  const [selectedDate, setSelectedDate] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Use occurrences if available, otherwise fall back to bookings
  const displayData = occurrences.length > 0 ? occurrences : bookings;

  const bookingsByDate = useMemo(() => {
    const grouped = {};
    displayData.forEach((item) => {
      // Use scheduled_date for occurrences, start_date for bookings
      const dateField = item.scheduled_date || item.start_date;
      const date = dayjs(dateField).format("YYYY-MM-DD");
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(item);
    });
    return grouped;
  }, [displayData]);

  const getListData = (value) => {
    const dateStr = value.format("YYYY-MM-DD");
    return bookingsByDate[dateStr] || [];
  };

  const cellRender = (current, info) => {
    // Only render for date cells, not month/year cells
    if (info.type !== "date") {
      return info.originNode;
    }

    const listData = getListData(current);
    if (listData.length === 0) return null;

    return (
      <div className="calendar-events">
        {listData.slice(0, 2).map((booking) => (
          <div key={booking.booking_id} className="calendar-event-item">
            <Tag
              color={
                new Date(booking.start_date) < new Date() ? "default" : "green"
              }
              className="calendar-event-tag"
            >
              {booking.listing_title?.substring(0, 15)}
              {booking.listing_title?.length > 15 ? "..." : ""}
            </Tag>
          </div>
        ))}
        {listData.length > 2 && (
          <div className="calendar-more-events">
            +{listData.length - 2} more
          </div>
        )}
      </div>
    );
  };

  const handleDateSelect = (date) => {
    // Check if the selected date has any bookings
    const dateStr = date.format("YYYY-MM-DD");
    const bookingsForDate = bookingsByDate[dateStr] || [];

    // Only open modal if there are bookings for this date
    if (bookingsForDate.length > 0) {
      setSelectedDate(date);
      setIsModalOpen(true);
    }
  };

  const selectedDateBookings = useMemo(() => {
    if (!selectedDate) return [];
    const dateStr = selectedDate.format("YYYY-MM-DD");
    return (bookingsByDate[dateStr] || []).sort(
      (a, b) => new Date(a.start_date) - new Date(b.start_date),
    );
  }, [selectedDate, bookingsByDate]);

  const handleAddToEmail = (item) => {
    // Handle both occurrences and bookings
    const startDate = item.scheduled_date || item.start_date;
    const endDate = item.scheduled_end_date || item.end_date;

    const eventData = {
      title: item.listing_title,
      start: new Date(startDate),
      end: new Date(endDate),
      description: `Class: ${item.listing_title}\nPartner: ${item.partner_name || "N/A"}\nChild: ${item.child_name || "N/A"}${item.occurrence_number ? `\nClass ${item.occurrence_number} of ${item.classes_total}` : ""}`,
      location: item.outlet_address || "TBD",
    };

    // Generate iCal format
    const icalContent = generateICalContent(eventData);

    // Download ICS file
    const element = document.createElement("a");
    element.setAttribute(
      "href",
      `data:text/calendar;charset=utf-8,${encodeURIComponent(icalContent)}`,
    );
    element.setAttribute(
      "download",
      `${item.listing_title.replace(/\s+/g, "_")}.ics`,
    );
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);

    if (onAddToEmail) {
      onAddToEmail(booking);
    }

    message.success(
      "Calendar event downloaded! You can import it to your email calendar.",
    );
  };

  const generateICalContent = (event) => {
    const formatDate = (date) => {
      return dayjs(date).format("YYYYMMDDTHHmmss");
    };

    return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//JuniorPass//EN
CALSCALE:GREGORIAN
BEGIN:VEVENT
DTSTART:${formatDate(event.start)}
DTEND:${formatDate(event.end)}
DTSTAMP:${formatDate(new Date())}
UID:${event.title}-${formatDate(event.start)}@juniorpass.com
CREATED:${formatDate(new Date())}
DESCRIPTION:${event.description}
LOCATION:${event.location}
SUMMARY:${event.title}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;
  };

  const formatTime = (dateTimeString) => {
    return dayjs(dateTimeString).format("HH:mm");
  };

  return (
    <div className="calendar-view-container">
      <Card className="calendar-card" bordered={false}>
        <Calendar
          mode="month"
          fullscreen={false}
          cellRender={cellRender}
          onSelect={handleDateSelect}
          className="custom-calendar"
        />
      </Card>

      <Modal
        title={
          selectedDate && (
            <Space>
              <CalendarOutlined />
              <span>
                Classes on {selectedDate.format("dddd, MMMM D, YYYY")}
              </span>
            </Space>
          )
        }
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={600}
        className="calendar-modal"
      >
        {selectedDateBookings.length === 0 ? (
          <Empty
            description="No classes scheduled for this date"
            style={{ marginTop: 48, marginBottom: 48 }}
          />
        ) : (
          <List
            dataSource={selectedDateBookings}
            renderItem={(item) => {
              const startDate = item.scheduled_date || item.start_date;
              const endDate = item.scheduled_end_date || item.end_date;
              const isPast = new Date(startDate) < new Date();
              return (
                <List.Item
                  key={item.occurrence_id || item.booking_id}
                  actions={
                    !isPast
                      ? [
                          <Tooltip title="Add to email calendar">
                            <Button
                              type="primary"
                              ghost
                              icon={<MailOutlined />}
                              size="small"
                              onClick={() => handleAddToEmail(item)}
                            >
                              Add to Calendar
                            </Button>
                          </Tooltip>,
                        ]
                      : []
                  }
                  className={isPast ? "booking-item-past" : ""}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        <Text strong>{item.listing_title}</Text>
                        <Tag color={isPast ? "default" : "green"}>
                          {isPast ? "Completed" : "Upcoming"}
                        </Tag>
                        {item.occurrence_number && (
                          <Tag color="blue">
                            Class {item.occurrence_number}/{item.classes_total}
                          </Tag>
                        )}
                        {item.status && item.status !== "scheduled" && (
                          <Tag
                            color={
                              item.status === "cancelled" ? "red" : "orange"
                            }
                          >
                            {item.status}
                          </Tag>
                        )}
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size={4}>
                        <Space size="small">
                          <ClockCircleOutlined />
                          <Text type="secondary">
                            {formatTime(startDate)} - {formatTime(endDate)}
                          </Text>
                        </Space>
                        <Text type="secondary" className="booking-child">
                          Child: {item.child_name || "N/A"}
                        </Text>
                        <Text type="secondary" className="booking-partner">
                          Partner: {item.partner_name || "N/A"}
                        </Text>
                      </Space>
                    }
                  />
                </List.Item>
              );
            }}
          />
        )}
      </Modal>
    </div>
  );
};

export default CalendarView;
