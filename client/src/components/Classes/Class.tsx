/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-unused-vars */
// @ts-nocheck -- Legacy class-detail API models are being migrated incrementally.
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
  Rate,
  Empty,
} from "antd";
import {
  LeftOutlined,
  RightOutlined,
  MailOutlined,
  ShopOutlined,
  PhoneOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
} from "@ant-design/icons";
import dayjs from "../../utils/dayjs";
import duration from "dayjs/plugin/duration";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import { useUserContext } from "../UserContext";
import { fetchWithAuth, API_ENDPOINTS } from "../../utils/api";
import Spinner from "../../utils/Spinner";
import toast from "react-hot-toast";
import useWindowDimensions from "../../hooks/useWindowDimensions";
import "./Class.css";
import BuyNow from "./BuyNow";

const { Title, Text, Paragraph } = Typography;

dayjs.extend(duration);
dayjs.extend(isSameOrAfter);

const toCredits = (dollarValue, dollarsPerCredit) => {
  const dollars = Number(dollarValue);
  const rate = Number(dollarsPerCredit);
  return Number.isFinite(dollars) && dollars > 0 && Number.isFinite(rate) && rate > 0
    ? Math.ceil(dollars / rate)
    : null;
};

const getMinimumScheduleCredits = (location, listingCredits) => {
  const packageTypes = location.package_types || [];
  const prices = {
    "pay-as-you-go": location.credit,
    "short-term": location.price_shortterm,
    "full-term": location.price_fullterm,
  };
  const credits = packageTypes
    .map((type) => toCredits(prices[type], location.pricing_dollars_per_credit))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (credits.length) return Math.min(...credits);
  const fallback = Number(listingCredits);
  return Number.isInteger(fallback) && fallback > 0 ? fallback : null;
};

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
  const [reviews, setReviews] = useState([]);
  const [reviewSummary, setReviewSummary] = useState({
    count: 0,
    average_rating: 0,
  });

  const { state } = useLocation();
  const { classId } = useParams();
  const { user, reauthenticate } = useUserContext();
  const { isDesktop, isTabletLandscape } = useWindowDimensions();
  const isToday = dayjs(selectedDate).isSame(dayjs(), "day");
  const dateFormat = "ddd, D MMM YYYY";
  const navigate = useNavigate();

  const parseClockTime = (value) => {
    const [hours = 0, minutes = 0, seconds = 0] = String(value)
      .split(":")
      .map(Number);
    return { hours, minutes, seconds };
  };

  const formatClockTime = (value) => {
    const { hours, minutes } = parseClockTime(value);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  };

  const formatTimeslot = (startTime, endTime) => {
    const start = parseClockTime(startTime);
    const end = parseClockTime(endTime);
    const startSeconds =
      start.hours * 3600 + start.minutes * 60 + start.seconds;
    const endSeconds = end.hours * 3600 + end.minutes * 60 + end.seconds;
    const duration = (endSeconds - startSeconds) / 60;

    return {
      timeRange: `${formatClockTime(startTime)} - ${formatClockTime(endTime)}`,
      duration: `${duration} mins`,
    };
  };

  const generateAvailableTimeSlots = () => {
    if (!listing || !listing?.outlets_info) return [];

    const selectedDay = dayjs(selectedDate).format("dddd");
    const slots = [];

    // Flatten the nested structure: outlets > schedule_groups > time_slots
    listing.outlets_info.forEach((outlet) => {
      if (!outlet.schedule_groups) return;

      outlet.schedule_groups.forEach((scheduleGroup) => {
        if (!scheduleGroup.time_slots) return;

        // Determine start date from schedule group
        let startDate;
        if (scheduleGroup.full_term_start_date) {
          startDate = dayjs(scheduleGroup.full_term_start_date);
        } else {
          startDate = listing?.created_at ? dayjs(listing.created_at) : dayjs();
        }

        scheduleGroup.time_slots.forEach((timeSlot) => {
          const {
            day,
            start_time,
            end_time,
            schedule_id,
            slots: maxSlots,
          } = timeSlot;
          const {
            frequency,
            package_types,
            price_payg,
            price_fullterm,
            price_shortterm,
            pricing_dollars_per_credit,
            full_term_class_count,
            short_term_class_count,
          } = scheduleGroup;

          // Check if this time slot matches the selected date
          let shouldInclude = false;

          if (frequency === "Daily") {
            if (dayjs(selectedDate).isValid()) {
              shouldInclude = true;
            }
          } else if (frequency === "Weekly") {
            if (selectedDay === day) {
              shouldInclude = true;
            }
          } else if (frequency === "Biweekly") {
            const weeksDifference = dayjs(selectedDate).diff(startDate, "week");
            if (
              weeksDifference >= 0 &&
              weeksDifference % 2 === 0 &&
              selectedDay === day
            ) {
              shouldInclude = true;
            }
          } else if (frequency === "Monthly") {
            const selected = dayjs(selectedDate);

            if (selected.isSameOrAfter(startDate, "day")) {
              const startDayOfMonth = startDate.date();
              const selectedDayOfMonth = selected.date();
              const daysInSelectedMonth = selected.daysInMonth();

              const targetDayOfMonth = Math.min(
                startDayOfMonth,
                daysInSelectedMonth,
              );

              if (selectedDayOfMonth === targetDayOfMonth) {
                shouldInclude = true;
              }
            }
          }

          if (shouldInclude) {
            slots.push({
              ...formatTimeslot(start_time, end_time),
              location: {
                schedule_id,
                day,
                timeslot: [
                  formatClockTime(start_time),
                  formatClockTime(end_time),
                ],
                frequency,
                nearest_mrt: outlet.nearest_mrt,
                outlet_address: outlet.outlet_address,
                credit: price_payg,
                price_fullterm,
                price_shortterm,
                pricing_dollars_per_credit,
                full_term_class_count,
                short_term_class_count,
                max_slots: maxSlots,
                package_types,
              },
            });
          }
        });
      });
    });

    return slots;
  };

  const availableTimeSlots = generateAvailableTimeSlots();

  useEffect(() => {
    let active = true;
    const fetchReviews = async () => {
      try {
        const response = await fetchWithAuth(
          API_ENDPOINTS.GET_LISTING_REVIEWS(classId),
        );
        if (!response.ok) return;
        const data = await response.json();
        if (!active) return;
        setReviews(data.reviews || []);
        setReviewSummary(data.summary || { count: 0, average_rating: 0 });
      } catch (reviewError) {
        console.error("Unable to load reviews:", reviewError);
      }
    };
    fetchReviews();
    return () => {
      active = false;
    };
  }, [classId]);

  useEffect(() => {
    async function fetchUserBookings() {
      if (!user) return;

      try {
        const response = await fetchWithAuth(API_ENDPOINTS.GET_BOOKINGS);

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
        const response = await fetchWithAuth(
          API_ENDPOINTS.GET_CHILDREN(user.user_id),
        );

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
  }, [user]);

  useEffect(() => {
    async function fetchSlotAvailability() {
      if (!listing || !listing.outlets_info || !selectedDate) return;

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
          const response = await fetchWithAuth(
            `/bookings/availability/${slot.location.schedule_id}?start_date=${startDate}&end_date=${endDate}`,
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
  }, [listing, selectedDate]);

  useEffect(() => {
    async function fetchListing() {
      try {
        const response = await fetchWithAuth(
          API_ENDPOINTS.GET_LISTING(classId),
        );
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

    try {
      const response = await fetchWithAuth(
        API_ENDPOINTS.GET_CHILDREN(user.user_id),
      );
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
    if (!listing || !listing.outlets_info || !selectedDate) return;

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
        const response = await fetchWithAuth(
          `/bookings/availability/${slot.location.schedule_id}?start_date=${slotStartDate}&end_date=${slotEndDate}`,
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
      const response = await fetchWithAuth(API_ENDPOINTS.GET_BOOKINGS);

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
          <Col xs={24} sm={24} md={24} lg={17} xl={17}>
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
                <Title level={2}>{listing?.listing_title}</Title>
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

                {!isDesktop && !isTabletLandscape && (
                  <button
                    type="button"
                    className="mobile-partner-strip"
                    onClick={() =>
                      navigate(`/partner/${listing?.partner_info?.partner_id}`)
                    }
                  >
                    <Avatar
                      size={48}
                      src={listing?.partner_info?.picture}
                      className="mobile-partner-avatar"
                    />

                    <div className="mobile-partner-info">
                      <Text className="mobile-partner-label">Offered by</Text>

                      <Text strong className="mobile-partner-name">
                        {listing?.partner_name}
                      </Text>

                      <Text className="mobile-partner-verified">
                        Verified Partner
                      </Text>
                    </div>

                    <RightOutlined className="mobile-partner-arrow" />
                  </button>
                )}

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
                    const minimumCredits = getMinimumScheduleCredits(
                      item.location,
                      listing?.credit,
                    );

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
                      >
                        <div className="schedule-card-content">
                          <div className="schedule-card-details">
                            <div className="schedule-card-heading">
                              <ClockCircleOutlined className="schedule-time-icon" />
                              <div>
                                <Text strong className="schedule-time-text">
                                  {item.timeRange}
                                </Text>
                                <Text className="schedule-duration">{item.duration}</Text>
                              </div>
                            </div>

                            <div className="schedule-card-meta">
                              <span className="schedule-location">
                                <EnvironmentOutlined />
                                {item.location.nearest_mrt || "Location unavailable"}
                              </span>
                              <span className="schedule-price">
                                {minimumCredits ? `From ${minimumCredits} credits` : "Credits unavailable"}
                              </span>
                            </div>

                            <div className="schedule-package-list">
                              {(item.location.package_types || []).map((packageType) => {
                                const labels = {
                                  "pay-as-you-go": "Pay as you go",
                                  "full-term": "Full term",
                                  "short-term": "Short term",
                                };
                                return (
                                  <Tag key={packageType} className="schedule-package-tag">
                                    {labels[packageType] || packageType}
                                  </Tag>
                                );
                              })}
                              {!isPastClass && !isSoldOut && spotsLeft > 0 && spotsLeft <= 3 && (
                                <span className="schedule-spots-tag">
                                  {spotsLeft} {spotsLeft === 1 ? "spot" : "spots"} left
                                </span>
                              )}
                            </div>

                            {hasBooking && bookedChildrenNames.length > 0 && (
                              <div className="schedule-booked-row">
                                <Text className="schedule-booked-info">Booked for</Text>
                                {bookedChildrenNames.map((name) => (
                                  <Tag key={name} color="green">✓ {name}</Tag>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="schedule-card-action">{renderAction()}</div>
                        </div>
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
                Reviews
              </Title>
              {reviews.length > 0 ? (
                <>
                  <div className="class-review-summary">
                    <strong>{Number(reviewSummary.average_rating).toFixed(1)}</strong>
                    <div>
                      <Rate
                        disabled
                        allowHalf
                        value={Number(reviewSummary.average_rating)}
                      />
                      <span>{reviewSummary.count} verified reviews</span>
                    </div>
                  </div>
                  <List
                    className="class-review-list"
                    dataSource={reviews}
                    renderItem={(review) => (
                      <List.Item className="class-review-item">
                        <article>
                          <div className="class-review-heading">
                            <Avatar>{review.reviewer_name?.[0] || "J"}</Avatar>
                            <div>
                              <strong>{review.reviewer_name}</strong>
                              <span>
                                Verified booking · {dayjs(review.created_at).format("MMM YYYY")}
                              </span>
                            </div>
                            <Rate disabled value={review.rating} />
                          </div>
                          {review.tags?.length > 0 ? (
                            <div className="class-review-tags">
                              {review.tags.map((tag) => (
                                <Tag key={tag}>{tag}</Tag>
                              ))}
                            </div>
                          ) : null}
                          {review.comment ? <Paragraph>{review.comment}</Paragraph> : null}
                          {review.partner_reply ? (
                            <div className="class-review-reply">
                              <strong>Response from {listing?.partner_name}</strong>
                              <p>{review.partner_reply}</p>
                            </div>
                          ) : null}
                        </article>
                      </List.Item>
                    )}
                  />
                </>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No reviews yet"
                />
              )}
            </Card>
          </Col>

          <Col lg={7} xl={7}>
            {(isDesktop || isTabletLandscape) && (
              <Affix offsetTop={120}>
                <Card
                  bordered={false}
                  className="class-partner-card"
                  hoverable
                  onClick={() => {
                    navigate(
                      `/partner/${listing?.partner_info?.partner_id}`,
                      {},
                    );
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
                      <Text className="partner-card-badge">
                        Verified Partner
                      </Text>
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
            )}
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
