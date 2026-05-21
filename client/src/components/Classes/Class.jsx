import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Avatar,
  Button,
  Card,
  Carousel,
  DatePicker,
  Space,
  Tag,
  Typography,
  Image,
  Alert,
  Affix,
  Row,
  Col,
  Divider,
  List,
} from "antd";
import {
  LeftOutlined,
  RightOutlined,
  MailOutlined,
  ShopOutlined,
  PhoneOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import { useUserContext } from "../UserContext";
import getBaseURL from "../../utils/config";
import Spinner from "../../utils/Spinner";
import toast from "react-hot-toast";
import "./Class.css";
import BuyNow from "./BuyNow";

const { Title, Text, Paragraph } = Typography;

dayjs.extend(duration);
dayjs.extend(isSameOrAfter);

const Class = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [listing, setListing] = useState(null);
  const [isBuyNowModalOpen, setIsBuyNowModalOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [children, setChildren] = useState([]);
  const [allChildren, setAllChildren] = useState([]);
  const [slotAvailability, setSlotAvailability] = useState({});
  const [userBookings, setUserBookings] = useState([]);

  const { state } = useLocation();
  const { classId } = useParams();
  const { user, reauthenticate } = useUserContext();
  const isToday = dayjs(selectedDate).isSame(dayjs(), "day");
  const dateFormat = "ddd, D MMM YYYY";
  const navigate = useNavigate();
  const baseURL = getBaseURL();

  const formatTimeslot = (timeslot) => {
    const startTime = dayjs(timeslot[0], "HH:mm");
    const endTime = dayjs(timeslot[1], "HH:mm");
    const duration = dayjs.duration(endTime.diff(startTime)).asMinutes();

    return {
      timeRange: `${timeslot[0]} - ${timeslot[1]}`,
      duration: `${duration} mins`,
    };
  };

  const generateAvailableTimeSlots = () => {
    if (!listing || !listing?.schedule_info) return [];

    const selectedDay = dayjs(selectedDate).format("dddd");

    // Properly determine the start date - use long_term or short_term if they exist
    let startDate;
    if (listing?.long_term_start_date) {
      startDate = dayjs(listing.long_term_start_date);
    } else if (listing?.short_term_start_date) {
      startDate = dayjs(listing.short_term_start_date);
    } else {
      // Fallback to created_at or today if no start date is set
      startDate = listing?.created_at ? dayjs(listing.created_at) : dayjs();
    }

    return listing?.schedule_info.reduce((acc, curr) => {
      const { frequency, day, timeslot } = curr;
      if (frequency === "Daily") {
        if (dayjs(selectedDate).isValid()) {
          acc.push({ ...formatTimeslot(timeslot), location: curr });
        }
      } else if (frequency === "Weekly") {
        if (selectedDay === day) {
          acc.push({ ...formatTimeslot(timeslot), location: curr });
        }
      } else if (frequency === "Biweekly") {
        const weeksDifference = dayjs(selectedDate).diff(startDate, "week");
        if (
          weeksDifference >= 0 &&
          weeksDifference % 2 === 0 &&
          selectedDay === day
        ) {
          acc.push({ ...formatTimeslot(timeslot), location: curr });
        }
      } else if (frequency === "Monthly") {
        const selected = dayjs(selectedDate);

        // For monthly: check if selected date is on or after start date
        // and if the day of month matches the start date's day of month
        if (selected.isSameOrAfter(startDate, "day")) {
          const startDayOfMonth = startDate.date();
          const selectedDayOfMonth = selected.date();
          const daysInSelectedMonth = selected.daysInMonth();

          // Handle months with fewer days (e.g., start on 31st, but Feb only has 28)
          const targetDayOfMonth = Math.min(
            startDayOfMonth,
            daysInSelectedMonth,
          );

          if (selectedDayOfMonth === targetDayOfMonth) {
            acc.push({ ...formatTimeslot(timeslot), location: curr });
          }
        }
      }

      return acc;
    }, []);
  };

  const availableTimeSlots = generateAvailableTimeSlots();

  useEffect(() => {
    async function fetchUserBookings() {
      if (!user) return;

      try {
        const token = localStorage.getItem("token");
        const response = await fetch(`${baseURL}/bookings/user`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setUserBookings(data.bookings || []);
        }
      } catch (error) {
        console.error("Error fetching user bookings:", error);
      }
    }

    async function fetchAllChildren() {
      if (!user) return;

      try {
        const token = localStorage.getItem("token");
        const response = await fetch(`${baseURL}/children/${user.user_id}`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: token ? `Bearer ${token}` : "",
          },
        });

        if (response.ok) {
          const childrenData = await response.json();
          setAllChildren(Array.isArray(childrenData) ? childrenData : []);
        }
      } catch (error) {
        console.error("Error fetching children:", error);
      }
    }

    fetchUserBookings();
    fetchAllChildren();
  }, [user, baseURL]);

  useEffect(() => {
    async function fetchSlotAvailability() {
      if (!listing || !listing.schedule_info || !selectedDate) return;

      const slots = generateAvailableTimeSlots();
      if (!slots.length) return;

      const availability = {};

      for (const slot of slots) {
        const startDate = dayjs(selectedDate)
          .hour(parseInt(slot.location.timeslot[0].split(":")[0]))
          .minute(parseInt(slot.location.timeslot[0].split(":")[1]))
          .format("YYYY-MM-DDTHH:mm:ss");

        const endDate = dayjs(selectedDate)
          .hour(parseInt(slot.location.timeslot[1].split(":")[0]))
          .minute(parseInt(slot.location.timeslot[1].split(":")[1]))
          .format("YYYY-MM-DDTHH:mm:ss");

        try {
          const response = await fetch(
            `${baseURL}/bookings/availability/${slot.location.schedule_id}?start_date=${startDate}&end_date=${endDate}`,
          );

          if (response.ok) {
            const data = await response.json();
            const key = `${slot.location.schedule_id}-${startDate}`;
            availability[key] = {
              isFull: data.is_full,
              availableSpots: data.available_spots,
              maxSlots: data.max_slots,
            };
          }
        } catch (error) {
          console.error("Error fetching availability:", error);
        }
      }

      setSlotAvailability(availability);
    }

    fetchSlotAvailability();
  }, [listing, selectedDate, baseURL]);

  useEffect(() => {
    async function fetchListing() {
      try {
        const response = await fetch(`${baseURL}/listings/${classId}`, {
          method: "GET",
        });
        if (!response.ok) {
          throw new Error("Network response was not okay");
        }

        const data = await response.json();
        setListing(data);
      } catch (error) {
        setError(error);
        toast.error(error.message);
      } finally {
        setLoading(false);
      }
    }

    if (!state) {
      fetchListing();
    } else {
      setListing(state.listing);
      setLoading(false);
    }
  }, [classId, state]);

  const handleDateChange = (date) => {
    setSelectedDate(date);
  };

  const handleNextDay = () => {
    const nextDay = dayjs(selectedDate).add(1, "day").toDate();
    setSelectedDate(nextDay);
  };

  const handlePreviousDay = () => {
    const previousDay = dayjs(selectedDate).subtract(1, "day").toDate();
    setSelectedDate(previousDay);
  };

  const handleBookNow = async (item, bookedChildIds = []) => {
    if (!listing || !item) {
      toast.error(
        "Class information is not available. Please try again later.",
      );
      return;
    }

    if (!user) {
      toast.error("Please login to book the class");
      navigate("/login", { state: { from: `/class/${classId}` } });
      return;
    }

    if (user.credit < listing.credit) {
      toast.error("Insufficient credits to book this class.");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${baseURL}/children/${user.user_id}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
      });
      if (response.status === 401 || response.status === 403) {
        toast.error("Please login again to access your children profiles.");
        navigate(`/login`, { state: { from: `/class/${classId}` } });
        return;
      }
      const childrenData = await response.json();

      if (!Array.isArray(childrenData) || childrenData.length === 0) {
        toast.error("No child profile found. Please add one before booking.");
        return;
      }

      const availableChildren = childrenData.filter(
        (child) => !bookedChildIds.includes(child.child_id),
      );

      if (availableChildren.length === 0) {
        toast.error("All your children are already booked for this class.");
        return;
      }

      setChildren(availableChildren);
      setSelected({
        ...item,
        selectedDate: dayjs(selectedDate).format("YYYY-MM-DD"),
      });
      setIsBuyNowModalOpen(true);
    } catch (error) {
      toast.error("Something went wrong. Please try again.");
    }
  };

  const refreshSlotAvailability = async () => {
    if (!listing || !listing.schedule_info || !selectedDate) return;

    const slots = generateAvailableTimeSlots();
    if (!slots.length) return;

    const availability = {};

    for (const slot of slots) {
      const slotStartDate = dayjs(selectedDate)
        .hour(parseInt(slot.location.timeslot[0].split(":")[0]))
        .minute(parseInt(slot.location.timeslot[0].split(":")[1]))
        .format("YYYY-MM-DDTHH:mm:ss");

      const slotEndDate = dayjs(selectedDate)
        .hour(parseInt(slot.location.timeslot[1].split(":")[0]))
        .minute(parseInt(slot.location.timeslot[1].split(":")[1]))
        .format("YYYY-MM-DDTHH:mm:ss");

      try {
        const response = await fetch(
          `${baseURL}/bookings/availability/${slot.location.schedule_id}?start_date=${slotStartDate}&end_date=${slotEndDate}`,
        );

        if (response.ok) {
          const data = await response.json();
          const key = `${slot.location.schedule_id}-${slotStartDate}`;
          availability[key] = {
            isFull: data.is_full,
            availableSpots: data.available_spots,
            maxSlots: data.max_slots,
          };
        }
      } catch (error) {
        console.error("Error fetching availability:", error);
      }
    }

    setSlotAvailability(availability);
  };

  const handleBookingSuccess = async (updatedCredit) => {
    await reauthenticate();

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${baseURL}/bookings/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUserBookings(data.bookings || []);
      }
    } catch (error) {
      console.error("Error fetching user bookings:", error);
    }

    await refreshSlotAvailability();
  };

  if (loading) {
    return <Spinner />;
  }

  if (error) {
    return (
      <Alert
        message="Error"
        description={error.message}
        type="error"
        showIcon
      />
    );
  }

  return (
    <div className="class-page">
      <div className="class-page-inner">
        <Row gutter={[24, 24]}>
          <Col xs={24} sm={24} md={24} lg={16} xl={16}>
            {/* Hero Image Carousel */}
            <Card bordered={false} className="class-hero-card">
              <Carousel autoplay arrows dots>
                {listing?.images &&
                  listing?.images.map((imgUrl, index) => (
                    <div key={index} style={{ position: "relative" }}>
                      <Image
                        alt={`carousel-${index}`}
                        src={imgUrl}
                        preview={false}
                        className="class-carousel-image"
                      />
                      <div className="class-carousel-overlay">
                        <Title level={2} className="class-carousel-title">
                          {listing?.listing_title}
                        </Title>
                      </div>
                    </div>
                  ))}
              </Carousel>
            </Card>

            {/* Description Card */}
            <Card bordered={false} className="class-content-card">
              <Space
                direction="vertical"
                size="middle"
                style={{ width: "100%" }}
              >
                {/* Tags */}
                <Space wrap>
                  {listing?.package_types &&
                    listing.package_types
                      .replace(/[{}]/g, "")
                      .split(",")
                      .map((type, index) => (
                        <Tag
                          key={`package-type-${index}`}
                          color="blue"
                          className="class-tag"
                        >
                          {type.trim()}
                        </Tag>
                      ))}

                  {listing?.partner_info?.categories?.map((category, index) => (
                    <Tag
                      key={`category-${index}`}
                      color="purple"
                      className="class-tag"
                    >
                      {category}
                    </Tag>
                  ))}
                </Space>

                <Paragraph className="class-description">
                  {listing?.description}
                </Paragraph>
              </Space>
            </Card>

            {/* Schedule Card */}
            <Card bordered={false} className="class-content-card">
              <Title level={4} className="class-section-title">
                📅 Select a Date & Time
              </Title>

              {/* Date Navigation */}
              <div className="class-date-nav">
                <Button onClick={handlePreviousDay} disabled={isToday}>
                  <LeftOutlined />
                </Button>
                <DatePicker
                  value={dayjs(selectedDate)}
                  format={dateFormat}
                  onChange={handleDateChange}
                  allowClear={false}
                  className="custom-date-picker"
                  open={false}
                  inputReadOnly
                  suffixIcon={null}
                />
                <Button onClick={handleNextDay}>
                  <RightOutlined />
                </Button>
              </div>

              {/* Available Classes List */}
              <div className="class-schedule-list">
                <List
                  itemLayout="horizontal"
                  dataSource={availableTimeSlots}
                  locale={{
                    emptyText:
                      "There are no upcoming classes available on this day",
                  }}
                  renderItem={(item) => {
                    const startDate = dayjs(selectedDate)
                      .hour(parseInt(item.location.timeslot[0].split(":")[0]))
                      .minute(parseInt(item.location.timeslot[0].split(":")[1]))
                      .format("YYYY-MM-DDTHH:mm:ss");

                    const availabilityKey = `${item.location.schedule_id}-${startDate}`;
                    const availability = slotAvailability[availabilityKey];
                    const isSoldOut = availability?.isFull || false;
                    const spotsLeft = availability?.availableSpots;

                    const classStartTime = dayjs(selectedDate)
                      .hour(parseInt(item.location.timeslot[0].split(":")[0]))
                      .minute(
                        parseInt(item.location.timeslot[0].split(":")[1]),
                      );
                    const isPastClass = dayjs().isAfter(classStartTime);

                    const slotBookings = userBookings.filter((booking) => {
                      const bookingStart = dayjs(booking.start_date).format(
                        "YYYY-MM-DDTHH:mm",
                      );
                      const targetStart =
                        dayjs(startDate).format("YYYY-MM-DDTHH:mm");
                      const matchesListing = booking.listing_id === classId;
                      const matchesTime = bookingStart === targetStart;
                      return matchesListing && matchesTime;
                    });

                    const bookedChildIds = slotBookings
                      .map((b) => b.child_id)
                      .filter(Boolean);
                    const bookedChildrenNames = allChildren
                      .filter((child) =>
                        bookedChildIds.includes(child.child_id),
                      )
                      .map((child) => child.name);

                    const allChildrenBooked =
                      allChildren.length > 0 &&
                      allChildren.every((child) =>
                        bookedChildIds.includes(child.child_id),
                      );

                    const hasBooking = slotBookings.length > 0;

                    const getItemClassName = () => {
                      let className = "class-schedule-item";
                      if (isPastClass) className += " past";
                      else if (hasBooking) className += " booked";
                      else if (isSoldOut) className += " sold-out";
                      return className;
                    };

                    const renderAction = () => {
                      if (isPastClass) {
                        return <Tag color="default">CLASS ENDED</Tag>;
                      }

                      if (allChildrenBooked) {
                        return <Tag color="blue">✓ ALL BOOKED</Tag>;
                      }

                      if (isSoldOut) {
                        return <Tag color="red">SOLD OUT</Tag>;
                      }

                      return (
                        <Button
                          type="primary"
                          size="large"
                          onClick={() => handleBookNow(item, bookedChildIds)}
                          className="book-now-btn"
                        >
                          Book Now
                        </Button>
                      );
                    };

                    return (
                      <List.Item
                        className={getItemClassName()}
                        actions={[renderAction()]}
                      >
                        <List.Item.Meta
                          avatar={
                            <div
                              className={`schedule-time-icon ${isPastClass ? "past" : isSoldOut ? "sold-out" : ""}`}
                            >
                              {isPastClass ? "⏰" : isSoldOut ? "❌" : "🕐"}
                            </div>
                          }
                          title={
                            <Space wrap>
                              <Text strong className="schedule-time-text">
                                {item.timeRange}
                              </Text>
                              <Tag color="gold" className="schedule-credit-tag">
                                💰 {item.location.credit || listing?.credit}{" "}
                                Credits
                              </Tag>
                              {!isPastClass &&
                                !isSoldOut &&
                                spotsLeft !== undefined &&
                                spotsLeft <= 3 &&
                                spotsLeft > 0 && (
                                  <Tag
                                    color="orange"
                                    className="schedule-spots-tag"
                                  >
                                    Only {spotsLeft}{" "}
                                    {spotsLeft === 1 ? "spot" : "spots"} left!
                                  </Tag>
                                )}
                            </Space>
                          }
                          description={
                            <Space
                              direction="vertical"
                              size="small"
                              style={{ width: "100%" }}
                            >
                              <Space size="small">
                                <Tag>{item.duration}</Tag>
                                <Tag color="blue">
                                  {item.location.nearest_mrt}
                                </Tag>
                              </Space>
                              {hasBooking && bookedChildrenNames.length > 0 && (
                                <Space size="small" wrap>
                                  <Text
                                    type="secondary"
                                    className="schedule-booked-info"
                                  >
                                    Booked for:
                                  </Text>
                                  {bookedChildrenNames.map((name, idx) => (
                                    <Tag key={idx} color="green">
                                      ✓ {name}
                                    </Tag>
                                  ))}
                                </Space>
                              )}
                            </Space>
                          }
                        />
                      </List.Item>
                    );
                  }}
                />
              </div>
            </Card>

            {/* Review Card */}
            <Card
              bordered={false}
              className="class-content-card class-reviews-card"
            >
              <Title level={4} className="class-section-title">
                ⭐ Reviews
              </Title>
              <Text type="secondary">Reviews coming soon...</Text>
            </Card>
          </Col>

          <Col xs={24} sm={24} md={24} lg={8} xl={8}>
            <Affix offsetTop={120}>
              <Card
                bordered={false}
                className="class-partner-card"
                hoverable
                onClick={() => {
                  navigate(`/partner/${listing?.partner_info?.partner_id}`, {});
                }}
              >
                {/* Partner Header */}
                <div className="partner-card-header">
                  <Avatar
                    size={64}
                    src={listing?.partner_info?.picture}
                    className="partner-card-avatar"
                  />
                  <div>
                    <Title level={4} className="partner-card-name">
                      {listing?.partner_name}
                    </Title>
                    <Text className="partner-card-badge">Verified Partner</Text>
                  </div>
                </div>

                <Divider className="partner-card-divider" />

                {/* Contact Information */}
                <Space
                  direction="vertical"
                  size="middle"
                  style={{ width: "100%" }}
                >
                  <div className="partner-contact-item">
                    <ShopOutlined className="partner-contact-icon" />
                    <div>
                      <Text className="partner-contact-label">Website</Text>
                      <Text className="partner-contact-value">
                        {listing?.partner_info?.website || "N/A"}
                      </Text>
                    </div>
                  </div>

                  <div className="partner-contact-item">
                    <MailOutlined className="partner-contact-icon" />
                    <div>
                      <Text className="partner-contact-label">Email</Text>
                      <Text className="partner-contact-value">
                        {listing?.partner_info?.email}
                      </Text>
                    </div>
                  </div>

                  <div className="partner-contact-item">
                    <PhoneOutlined className="partner-contact-icon" />
                    <div>
                      <Text className="partner-contact-label">Phone</Text>
                      <Text className="partner-contact-value">
                        {listing?.partner_info?.contact_number}
                      </Text>
                    </div>
                  </div>
                </Space>

                <Divider className="partner-card-divider" />

                {/* View Profile Button */}
                <Button
                  type="primary"
                  block
                  size="large"
                  className="view-partner-btn"
                >
                  View Partner Profile
                </Button>
              </Card>
            </Affix>
          </Col>
        </Row>
      </div>

      <BuyNow
        isBuyNowModalOpen={isBuyNowModalOpen}
        setIsBuyNowModalOpen={setIsBuyNowModalOpen}
        selected={selected}
        listing={listing}
        user={user}
        children={children}
        onBookingSuccess={handleBookingSuccess}
      />
    </div>
  );
};

export default Class;
