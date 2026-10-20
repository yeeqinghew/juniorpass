import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Empty,
  List,
  Typography,
  Tag,
  Space,
  Avatar,
  Button,
  Spin,
  Collapse,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  DatePicker,
  Alert,
  Rate,
  Checkbox,
} from "antd";
import {
  CalendarOutlined,
  ClockCircleOutlined,
  UserOutlined,
  BookOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  TeamOutlined,
  SearchOutlined,
  SwapOutlined,
  FileTextOutlined,
  MinusCircleOutlined,
} from "@ant-design/icons";
import dayjs from "../../utils/dayjs";
import {
  formatClassScheduleTime,
  parseClassScheduleTime,
} from "../../utils/classScheduleTime";
import toast from "react-hot-toast";
import { useUserContext } from "../UserContext";
import { fetchWithAuth, API_ENDPOINTS } from "../../utils/api";
import "./ChildrenClasses.css";
import CalendarView from "./utils/CalendarView";
import CustomerDocumentModal from "./CustomerDocumentModal";
import boy from "../../images/profile/boys/boy0.png";
import girl from "../../images/profile/girls/girl0.png";

const { Text } = Typography;
const { Panel } = Collapse;
const { Option } = Select;

const getBookingPolicy = (booking) => {
  let snapshot = booking?.policy_snapshot;
  if (typeof snapshot === "string") {
    try {
      snapshot = JSON.parse(snapshot);
    } catch {
      snapshot = null;
    }
  }

  return {
    cancellation_notice_hours: Number(
      snapshot?.cancellation_notice_hours ?? 24,
    ),
    refund_before_deadline_percent: Number(
      snapshot?.refund_before_deadline_percent ?? 100,
    ),
    refund_after_deadline_percent: Number(
      snapshot?.refund_after_deadline_percent ?? 0,
    ),
    makeup_allowed: snapshot?.makeup_allowed === true,
    makeup_notice_hours: Number(snapshot?.makeup_notice_hours ?? 24),
    class_requirements: snapshot?.class_requirements || "",
  };
};

const getCancellationTerms = (booking) => {
  const policy = getBookingPolicy(booking);
  const classStart = parseClassScheduleTime(booking.start_date);
  const deadline = classStart.subtract(
    policy.cancellation_notice_hours,
    "hour",
  );
  const beforeDeadline = !dayjs().isAfter(deadline);
  const refundPercentage = beforeDeadline
    ? policy.refund_before_deadline_percent
    : policy.refund_after_deadline_percent;
  const chargedCredits = Math.max(0, Number(booking.charged_credits) || 0);

  return {
    ...policy,
    deadline,
    refundPercentage,
    refundCredits: Math.floor((chargedCredits * refundPercentage) / 100),
  };
};

const ChildrenClasses = () => {
  const { user, reauthenticate } = useUserContext();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [children, setChildren] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [occurrences, setOccurrences] = useState([]);
  const [makeupRequests, setMakeupRequests] = useState([]);
  const [makeupOccurrence, setMakeupOccurrence] = useState(null);
  const [isMakeupModalOpen, setIsMakeupModalOpen] = useState(false);
  const [makeupLoading, setMakeupLoading] = useState(false);
  const [filterType, setFilterType] = useState("upcoming");
  const [isAddChildModalOpen, setIsAddChildModalOpen] = useState(false);
  const [editingChild, setEditingChild] = useState(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [bookingToCancel, setBookingToCancel] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [isDeleteChildModalOpen, setIsDeleteChildModalOpen] = useState(false);
  const [childToDelete, setChildToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [saveChildLoading, setSaveChildLoading] = useState(false);
  const saveChildLockRef = useRef(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("list");
  const [confirmationBookingId, setConfirmationBookingId] = useState(null);
  const [reviewEligibility, setReviewEligibility] = useState([]);
  const [reviewTags, setReviewTags] = useState([]);
  const [reviewBooking, setReviewBooking] = useState(null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [form] = Form.useForm();
  const [makeupForm] = Form.useForm();
  const [reviewForm] = Form.useForm();

  const filteredBookings = useMemo(() => {
    if (!searchTerm.trim()) return bookings;
    const term = searchTerm.toLowerCase();
    return bookings.filter(
      (b) =>
        b.listing_title?.toLowerCase().includes(term) ||
        b.partner_name?.toLowerCase().includes(term) ||
        b.child_name?.toLowerCase().includes(term) ||
        b.outlet_address?.toLowerCase().includes(term),
    );
  }, [bookings, searchTerm]);

  const filteredOccurrences = useMemo(() => {
    if (!searchTerm.trim()) return occurrences;
    const term = searchTerm.toLowerCase();
    return occurrences.filter(
      (o) =>
        o.listing_title?.toLowerCase().includes(term) ||
        o.partner_name?.toLowerCase().includes(term) ||
        o.child_name?.toLowerCase().includes(term) ||
        o.outlet_address?.toLowerCase().includes(term),
    );
  }, [occurrences, searchTerm]);

  const fetchChildrenAndBookings = useCallback(async () => {
    setLoading(true);
    try {
      const [cr, br, or, mr, rr] = await Promise.all([
        fetchWithAuth(API_ENDPOINTS.GET_CHILDREN(user.user_id), {
          method: "GET",
        }),
        fetchWithAuth(API_ENDPOINTS.GET_BOOKINGS, { method: "GET" }),
        fetchWithAuth(API_ENDPOINTS.GET_CLASS_OCCURRENCES, { method: "GET" }),
        fetchWithAuth(API_ENDPOINTS.GET_USER_MAKEUP_REQUESTS, { method: "GET" }),
        fetchWithAuth(API_ENDPOINTS.GET_REVIEW_ELIGIBILITY, { method: "GET" }),
      ]);
      if (cr.ok && br.ok) {
        setChildren(await cr.json());
        setBookings((await br.json()).bookings || []);
      }
      if (or.ok) {
        setOccurrences((await or.json()).occurrences || []);
      }
      if (mr.ok) {
        setMakeupRequests((await mr.json()).requests || []);
      }
      if (rr.ok) {
        const reviewData = await rr.json();
        setReviewEligibility(reviewData.bookings || []);
        setReviewTags(reviewData.allowed_tags || []);
      }
    } catch {
      toast.error("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const fetchTimer = setTimeout(() => {
      fetchChildrenAndBookings();
    }, 0);

    return () => clearTimeout(fetchTimer);
  }, [fetchChildrenAndBookings, user]);

  const handleAddChild = () => {
    setEditingChild(null);
    form.resetFields();
    form.setFieldsValue({ authorized_pickups: [{}] });
    setIsAddChildModalOpen(true);
  };

  const handleEditChild = (child) => {
    setEditingChild(child);
    form.setFieldsValue({
      name: child.name,
      date_of_birth: child.date_of_birth ? dayjs(child.date_of_birth) : null,
      gender: child.gender,
      special_notes: child.special_notes,
      emergency_contact_name: child.emergency_contact_name,
      emergency_contact_relationship: child.emergency_contact_relationship,
      emergency_contact_phone: child.emergency_contact_phone,
      authorized_pickups:
        Array.isArray(child.authorized_pickups) &&
        child.authorized_pickups.length > 0
          ? child.authorized_pickups
          : [{}],
    });
    setIsAddChildModalOpen(true);
  };

  const handleDeleteChild = (child) => {
    const now = dayjs();
    const upcoming = bookings.filter(
      (b) =>
        b.child_id === child.child_id &&
        b.status !== "cancelled" &&
        parseClassScheduleTime(b.start_date).isSameOrAfter(now),
    );
    if (upcoming.length > 0) {
      Modal.error({
        title: "Cannot Delete Child Profile",
        content: (
          <div>
            <p>
              This child has {upcoming.length} upcoming{" "}
              {upcoming.length === 1 ? "class" : "classes"}.
            </p>
            <p>Please cancel all upcoming classes first.</p>
          </div>
        ),
        okText: "Understood",
        centered: true,
      });
      return;
    }
    setChildToDelete(child);
    setIsDeleteChildModalOpen(true);
  };

  const confirmDeleteChild = async () => {
    if (!childToDelete) return;
    setDeleteLoading(true);
    try {
      const res = await fetchWithAuth(
        API_ENDPOINTS.DELETE_CHILD(childToDelete.child_id),
        { method: "DELETE" },
      );
      if (res.ok) {
        toast.success("Child profile deleted");
        await fetchChildrenAndBookings();
        setIsDeleteChildModalOpen(false);
        setChildToDelete(null);
      } else toast.error("Failed to delete child profile");
    } catch {
      toast.error("Failed to delete child profile");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleSaveChild = async (values) => {
    if (saveChildLockRef.current) return;

    saveChildLockRef.current = true;
    setSaveChildLoading(true);
    try {
      const payload = {
        ...values,
        date_of_birth: values.date_of_birth
          ? values.date_of_birth.format("YYYY-MM-DD")
          : null,
        parent_id: user.user_id,
      };
      const res = await fetchWithAuth(
        editingChild
          ? API_ENDPOINTS.UPDATE_CHILD(editingChild.child_id)
          : API_ENDPOINTS.CREATE_CHILD,
        {
          method: editingChild ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      if (res.ok) {
        toast.success(editingChild ? "Profile updated" : "Child added");
        setIsAddChildModalOpen(false);
        form.resetFields();
        setEditingChild(null);
        await fetchChildrenAndBookings();
      } else toast.error("Failed to save profile");
    } catch {
      toast.error("Failed to save profile");
    } finally {
      saveChildLockRef.current = false;
      setSaveChildLoading(false);
    }
  };

  const handleCancelBooking = (booking) => {
    const classStart = parseClassScheduleTime(booking.start_date);
    const now = dayjs();

    if (now.isSameOrAfter(classStart)) {
      Modal.error({
        title: "Cannot Cancel Booking",
        content:
          "This booking can no longer be cancelled because the class or programme has already started.",
        okText: "Understood",
        centered: true,
      });
      return;
    }

    const cancellationTerms = getCancellationTerms(booking);

    setBookingToCancel({
      bookingId: booking.booking_id,
      bookingTitle: booking.listing_title,
      ...cancellationTerms,
    });

    setIsCancelModalOpen(true);
  };

  const confirmCancelBooking = async () => {
    if (!bookingToCancel) return;
    setCancelLoading(true);
    try {
      const res = await fetchWithAuth(
        API_ENDPOINTS.CANCEL_BOOKING(bookingToCancel.bookingId),
        { method: "DELETE" },
      );
      if (res.ok) {
        const data = await res.json();
        toast.success(
          `Booking cancelled! ${data.refunded_credit} credits refunded.`,
        );
        await fetchChildrenAndBookings();
        await reauthenticate();
        setIsCancelModalOpen(false);
        setBookingToCancel(null);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to cancel booking");
      }
    } catch {
      toast.error("Failed to cancel booking");
    } finally {
      setCancelLoading(false);
    }
  };

  const openMakeupRequest = (occurrence) => {
    setMakeupOccurrence(occurrence);
    makeupForm.resetFields();
    setIsMakeupModalOpen(true);
  };

  const openReview = (booking) => {
    const reviewState = reviewEligibility.find(
      (item) => item.booking_id === booking.booking_id,
    );
    if (!reviewState) return;

    setReviewBooking(reviewState);
    reviewForm.setFieldsValue({
      rating: reviewState.rating || 0,
      comment: reviewState.comment || "",
      tags: reviewState.tags || [],
      attended_at_least_one: reviewState.attended_at_least_one ?? false,
    });
  };

  const saveReview = async (values) => {
    if (!reviewBooking) return;
    setReviewSaving(true);
    try {
      const response = await fetchWithAuth(
        reviewBooking.review_id
          ? API_ENDPOINTS.UPDATE_REVIEW(reviewBooking.review_id)
          : API_ENDPOINTS.CREATE_REVIEW,
        {
          method: reviewBooking.review_id ? "PATCH" : "POST",
          body: JSON.stringify({
            booking_id: reviewBooking.booking_id,
            ...values,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save review");
      toast.success(reviewBooking.review_id ? "Review updated" : "Review published");
      setReviewBooking(null);
      reviewForm.resetFields();
      await fetchChildrenAndBookings();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setReviewSaving(false);
    }
  };

  const deleteReview = () => {
    if (!reviewBooking?.review_id) return;
    Modal.confirm({
      title: "Delete this review?",
      content: "The review and any partner response will be removed permanently.",
      okText: "Delete review",
      okButtonProps: { danger: true },
      centered: true,
      onOk: async () => {
        setReviewSaving(true);
        try {
          const response = await fetchWithAuth(
            API_ENDPOINTS.DELETE_REVIEW(reviewBooking.review_id),
            { method: "DELETE" },
          );
          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Unable to delete review");
          }
          toast.success("Review deleted");
          setReviewBooking(null);
          reviewForm.resetFields();
          await fetchChildrenAndBookings();
        } catch (error) {
          toast.error(error.message);
        } finally {
          setReviewSaving(false);
        }
      },
    });
  };

  const submitMakeupRequest = async (values) => {
    if (!makeupOccurrence) return;
    setMakeupLoading(true);
    try {
      const response = await fetchWithAuth(API_ENDPOINTS.CREATE_MAKEUP_REQUEST, {
        method: "POST",
        body: JSON.stringify({
          occurrence_id: makeupOccurrence.occurrence_id,
          reason: values.reason,
          preferred_dates: values.preferred_date
            ? [values.preferred_date.format("YYYY-MM-DD")]
            : [],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to submit request");
      toast.success("Make-up request sent to the activity partner");
      setIsMakeupModalOpen(false);
      setMakeupOccurrence(null);
      makeupForm.resetFields();
      await fetchChildrenAndBookings();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setMakeupLoading(false);
    }
  };

  const updateMakeupRequest = async (request, action) => {
    setMakeupLoading(true);
    try {
      const endpoint =
        action === "confirm"
          ? API_ENDPOINTS.CONFIRM_MAKEUP_REQUEST(request.request_id)
          : API_ENDPOINTS.WITHDRAW_MAKEUP_REQUEST(request.request_id);
      const response = await fetchWithAuth(endpoint, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update request");
      toast.success(
        action === "confirm"
          ? "Replacement date confirmed"
          : "Make-up request withdrawn",
      );
      await fetchChildrenAndBookings();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setMakeupLoading(false);
    }
  };

  const formatDate = (s) =>
    parseClassScheduleTime(s).toDate().toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  const formatTime = formatClassScheduleTime;

  const getFilteredBookings = (childId) => {
    const now = dayjs();
    let list = filteredBookings.filter((b) => b.child_id === childId);
    if (filterType === "upcoming")
      list = list.filter(
        (b) =>
          b.status !== "cancelled" &&
          parseClassScheduleTime(b.start_date).isSameOrAfter(now),
      );
    else if (filterType === "past")
      list = list.filter((b) => parseClassScheduleTime(b.start_date).isBefore(now));
    return list;
  };

  const getChildImage = (child) => {
    if (child.display_picture) return child.display_picture;
    try {
      return child.gender === "M" ? boy : girl;
    } catch {
      return null;
    }
  };

  const renderBookingItem = (booking) => {
    let imageUrl = null;
    if (booking.images) {
      try {
        const arr =
          typeof booking.images === "string"
            ? JSON.parse(booking.images)
            : booking.images;
        imageUrl = arr[0];
      } catch {
        imageUrl = booking.partner_picture;
      }
    } else {
      imageUrl = booking.partner_picture;
    }

    const now = dayjs();
    const classStart = parseClassScheduleTime(booking.start_date);
    const bookingPolicy = getBookingPolicy(booking);
    const cancellationTerms = getCancellationTerms(booking);

    const isProgressive = booking.is_progressive;
    const hasStarted = now.isSameOrAfter(classStart);

    const canCancel =
      booking.status !== "cancelled" && now.isBefore(classStart);
    const reviewState = reviewEligibility.find(
      (item) => item.booking_id === booking.booking_id,
    );

    const statusLabel = booking.status === "cancelled"
      ? "Cancelled"
      : isProgressive
      ? hasStarted
        ? "In Progress"
        : "Confirmed"
      : hasStarted
        ? "Completed"
        : "Confirmed";

    const statusColor = booking.status === "cancelled"
      ? "red"
      : isProgressive
      ? hasStarted
        ? "blue"
        : "green"
      : hasStarted
        ? "default"
        : "green";

    return (
      <List.Item key={booking.booking_id} className="cc-booking-item">
        <div className="cc-booking-card">
          <Avatar
            size={52}
            src={imageUrl}
            icon={<UserOutlined />}
            className="cc-booking-avatar"
          />

          <div className="cc-booking-content">
            <div className="cc-booking-top">
              <div className="cc-booking-heading">
                <Text strong className="cc-booking-title">
                  {booking.listing_title}
                </Text>

                <div className="cc-booking-tags">
                  <Tag color={statusColor} className="cc-booking-status-tag">
                    {statusLabel}
                  </Tag>
                  {isProgressive && (
                    <Tag color="gold" className="cc-booking-progressive-tag">
                      Progressive Programme
                    </Tag>
                  )}

                  {booking.partner_name && (
                    <Tag color="purple" className="cc-booking-partner-tag">
                      {booking.partner_name}
                    </Tag>
                  )}
                </div>
              </div>

              <div className="cc-booking-actions">
                {reviewState ? (
                  <Button
                    size="small"
                    onClick={() => openReview(booking)}
                    disabled={!reviewState.can_review && !reviewState.review_id}
                  >
                    {reviewState.review_id
                      ? reviewState.can_review
                        ? "Edit review"
                        : "View review"
                      : "Write review"}
                  </Button>
                ) : null}
                <Button
                  size="small"
                  icon={<FileTextOutlined />}
                  onClick={() => setConfirmationBookingId(booking.booking_id)}
                >
                  Confirmation
                </Button>
                {canCancel && (
                  <Button
                    danger
                    size="small"
                    className="cc-booking-cancel"
                    onClick={() => handleCancelBooking(booking)}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>

            <div className="cc-booking-meta">
              <span className="cc-booking-meta-item">
                <CalendarOutlined />
                {formatDate(booking.start_date)}
              </span>

              <span className="cc-booking-meta-item">
                <ClockCircleOutlined />
                {formatTime(booking.start_date)} –{" "}
                {formatTime(booking.end_date)}
              </span>
            </div>

            <div className="cc-booking-policy-summary">
              {booking.status === "cancelled" ? (
                <span>
                  Cancellation refund: {Number(booking.refunded_credits || 0)} credits
                </span>
              ) : (
                <span>
                  Cancellation: {cancellationTerms.refundCredits} credits back
                  until {cancellationTerms.deadline.format("DD MMM YYYY, h:mm A")}
                </span>
              )}
              <span>
                Make-up requests: {bookingPolicy.makeup_allowed
                  ? `allowed with ${bookingPolicy.makeup_notice_hours} hours’ notice`
                  : "not available"}
              </span>
              {bookingPolicy.class_requirements && (
                <span>Requirements: {bookingPolicy.class_requirements}</span>
              )}
            </div>
          </div>
        </div>
      </List.Item>
    );
  };

  const renderChildPanel = (child) => {
    const childBookings = getFilteredBookings(child.child_id);
    return (
      <Panel
        header={
          <div className="cc-child-header">
            <Avatar
              size={44}
              src={getChildImage(child)}
              icon={<UserOutlined />}
              className="cc-child-avatar"
            />
            <div className="cc-child-info">
              <div className="cc-child-name">
                {child.name}
                <sup>
                  <Tag
                    color={childBookings.length > 0 ? "blue" : "default"}
                    style={{
                      borderRadius: 100,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "1px 7px",
                    }}
                  >
                    {childBookings.length}
                  </Tag>
                </sup>
              </div>
              <span className="cc-child-meta">
                {dayjs(child.date_of_birth).format("DD MMM YYYY")} •{" "}
                {child.gender === "M" ? "Male" : "Female"}
              </span>
            </div>
          </div>
        }
        key={child.child_id}
        extra={
          <Space
            onClick={(e) => e.stopPropagation()}
            className="cc-panel-actions"
          >
            <Button
              type="primary"
              ghost
              icon={<EditOutlined />}
              className="cc-panel-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleEditChild(child);
              }}
            />
            <Button
              danger
              icon={<DeleteOutlined />}
              className="cc-panel-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteChild(child);
              }}
            />
          </Space>
        }
      >
        {childBookings.length === 0 ? (
          <Empty
            description={`No ${filterType} classes`}
            image={
              <BookOutlined
                style={{ fontSize: 40, color: "var(--text-light)" }}
              />
            }
            style={{ padding: "28px 0" }}
          >
            {filterType === "upcoming" && (
              <Button type="primary" onClick={() => navigate("/classes")}>
                Browse Classes
              </Button>
            )}
          </Empty>
        ) : (
          <List
            className="cc-booking-list"
            dataSource={childBookings}
            renderItem={renderBookingItem}
          />
        )}
      </Panel>
    );
  };

  const visibleBookingCount = filteredBookings.filter((booking) => {
    const startDate = parseClassScheduleTime(booking.start_date);
    const now = dayjs();
    if (filterType === "upcoming") {
      return booking.status !== "cancelled" && startDate.isSameOrAfter(now);
    }
    if (filterType === "past") return startDate.isBefore(now);
    return true;
  }).length;

  return (
    <div className="cc-page fade-in">
      <div className="cc-page-header">
        <h2 className="cc-page-title">
          <TeamOutlined /> Children &amp; Classes
        </h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAddChild}
          className="profile-action-btn"
        >
          Add Child
        </Button>
      </div>

      <section className="cc-panel cc-controls-panel">
        <div className="cc-panel-header">
          <div>
            <span className="cc-panel-eyebrow">Schedule workspace</span>
            <h4>Classes and children</h4>
          </div>
          <span className="cc-count-pill">
            {activeTab === "calendar"
              ? `${filteredOccurrences.length} calendar items`
              : `${visibleBookingCount} bookings`}
          </span>
        </div>

        <div className="cc-controls-body">
          <div className="cc-search">
            <Input
              placeholder="Search class, partner, child, or location…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              prefix={<SearchOutlined />}
              allowClear
              size="large"
            />
            {searchTerm && (
              <span className="cc-search-count">
                Found{" "}
                {activeTab === "calendar"
                  ? filteredOccurrences.length
                  : filteredBookings.length}{" "}
                result
                {(activeTab === "calendar"
                  ? filteredOccurrences.length
                  : filteredBookings.length) !== 1
                  ? "s"
                  : ""}
              </span>
            )}
          </div>

          <div className="cc-toggle-grid">
            <div className="cc-filter-block cc-view-filter">
              <span className="cc-filter-label">View</span>
              <div
                className="cc-view-tabs"
                role="group"
                aria-label="Schedule view"
              >
                <button
                  type="button"
                  className={activeTab === "list" ? "is-active" : ""}
                  onClick={() => setActiveTab("list")}
                  aria-pressed={activeTab === "list"}
                >
                  <BookOutlined />
                  <span>List</span>
                </button>
                <button
                  type="button"
                  className={activeTab === "calendar" ? "is-active" : ""}
                  onClick={() => setActiveTab("calendar")}
                  aria-pressed={activeTab === "calendar"}
                >
                  <CalendarOutlined />
                  <span>Calendar</span>
                </button>
              </div>
            </div>

            {activeTab !== "calendar" && (
              <div className="cc-filter-block cc-status-filter">
                <span className="cc-filter-label">Status</span>
                <div
                  className="cc-status-chips"
                  role="group"
                  aria-label="Booking status"
                >
                  {[
                    { label: "Upcoming", value: "upcoming" },
                    { label: "Past", value: "past" },
                    { label: "All", value: "all" },
                  ].map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      className={
                        filterType === option.value ? "is-active" : ""
                      }
                      onClick={() => setFilterType(option.value)}
                      aria-pressed={filterType === option.value}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {activeTab === "calendar" && (
        <CalendarView
          bookings={filteredBookings}
          occurrences={filteredOccurrences}
          makeupRequests={makeupRequests}
          onRequestMakeup={openMakeupRequest}
        />
      )}

      {makeupRequests.length > 0 && (
        <section className="cc-panel cc-makeup-panel" aria-labelledby="makeup-heading">
          <div className="cc-panel-header">
            <div>
              <span className="cc-panel-eyebrow">Make-up requests</span>
              <h4 id="makeup-heading">Replacement date updates</h4>
            </div>
            <span className="cc-count-pill">{makeupRequests.length}</span>
          </div>
          <div className="cc-makeup-list">
            {makeupRequests.map((request) => (
              <article className="cc-makeup-item" key={request.request_id}>
                <div className="cc-makeup-copy">
                  <div className="cc-makeup-title-row">
                    <strong>{request.listing_title}</strong>
                    <Tag className={`cc-makeup-status is-${request.status}`}>
                      {request.status}
                    </Tag>
                  </div>
                  <span>
                    Original class: {formatDate(request.original_start_date)}, {formatTime(request.original_start_date)}
                  </span>
                  {request.offered_start_date && (
                    <span className="cc-makeup-offer">
                      Offered: {formatDate(request.offered_start_date)}, {formatTime(request.offered_start_date)}
                    </span>
                  )}
                  {request.partner_response && <span>{request.partner_response}</span>}
                </div>
                <div className="cc-makeup-actions">
                  {request.status === "offered" && (
                    <Button
                      type="primary"
                      loading={makeupLoading}
                      onClick={() => updateMakeupRequest(request, "confirm")}
                    >
                      Confirm date
                    </Button>
                  )}
                  {["pending", "offered"].includes(request.status) && (
                    <Button
                      loading={makeupLoading}
                      onClick={() => updateMakeupRequest(request, "withdraw")}
                    >
                      Withdraw
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === "list" && (
        <Spin spinning={loading} className="cc-list-spin">
          {children.length === 0 ? (
            <div className="cc-panel cc-empty-card">
              <span className="cc-empty-icon">
                <UserOutlined />
              </span>
              <h5>Add your first child profile</h5>
              <p>
                Add a child to start booking activities and tracking their class
                schedule here.
              </p>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddChild}
                className="profile-action-btn cc-empty-action"
              >
                Add Your First Child
              </Button>
            </div>
          ) : (
            <Collapse
              className="cc-collapse"
              defaultActiveKey={children
                .filter((c) => getFilteredBookings(c.child_id).length > 0)
                .map((c) => c.child_id)}
              expandIconPosition="end"
            >
              {children.map(renderChildPanel)}
            </Collapse>
          )}
        </Spin>
      )}

      <Modal
        open={isMakeupModalOpen}
        onCancel={() => {
          if (makeupLoading) return;
          setIsMakeupModalOpen(false);
          setMakeupOccurrence(null);
          makeupForm.resetFields();
        }}
        footer={null}
        centered
        width={500}
        maskClosable={false}
        className="cc-modal cc-makeup-modal"
        title={null}
      >
        <div className="cc-modal-stack">
          <div className="cc-modal-heading">
            <div className="cc-modal-icon success"><SwapOutlined /></div>
            <h3>Request another class date</h3>
            <p>{makeupOccurrence?.listing_title}</p>
          </div>
          {makeupOccurrence && (
            <Alert
              type="info"
              showIcon
              message={`Current class: ${formatDate(makeupOccurrence.scheduled_date)}, ${formatTime(makeupOccurrence.scheduled_date)}`}
              description={`Submit at least ${getBookingPolicy(makeupOccurrence).makeup_notice_hours} hours before class. The activity partner will offer a date for you to confirm.`}
            />
          )}
          <Form
            form={makeupForm}
            layout="vertical"
            onFinish={submitMakeupRequest}
            requiredMark={false}
            className="cc-modal-form"
          >
            <Form.Item label="Preferred date (optional)" name="preferred_date">
              <DatePicker
                format="DD/MM/YYYY"
                placeholder="Suggest a date"
                disabledDate={(date) => date && date.isBefore(dayjs().startOf("day"), "day")}
                className="cc-full-width-control"
              />
            </Form.Item>
            <Form.Item label="Reason (optional)" name="reason">
              <Input.TextArea
                rows={3}
                maxLength={1000}
                showCount
                placeholder="Tell the partner why another date would help"
              />
            </Form.Item>
          </Form>
          <div className="cc-modal-btns">
            <Button
              disabled={makeupLoading}
              onClick={() => setIsMakeupModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="primary"
              loading={makeupLoading}
              onClick={() => makeupForm.submit()}
            >
              Send request
            </Button>
          </div>
        </div>
      </Modal>

      {/* ══ Add / Edit child ══ */}
      <Modal
        open={isAddChildModalOpen}
        onCancel={() => {
          if (saveChildLockRef.current) return;
          setIsAddChildModalOpen(false);
          form.resetFields();
        }}
        footer={null}
        centered
        maskClosable={false}
        className="cc-modal cc-child-profile-modal"
        title={null}
      >
        <Space direction="vertical" size={20} className="cc-child-modal-content">
          <div className="cc-child-modal-heading">
            <div className="cc-modal-icon success">
              <UserOutlined />
            </div>
            <h3 className="cc-child-modal-title">
              {editingChild ? "Edit Child Profile" : "Add Child Profile"}
            </h3>
            <p className="cc-child-modal-description">
              {editingChild
                ? "Update your child's information"
                : "Add a new child to your family account"}
            </p>
          </div>

          <Form
            form={form}
            layout="vertical"
            onFinish={handleSaveChild}
            requiredMark={false}
            className="cc-modal-form"
          >
            <Form.Item
              label="Child's Name"
              name="name"
              rules={[{ required: true, message: "Name required" }]}
            >
              <Input placeholder="Full name" size="large" />
            </Form.Item>
            {/* Date of Birth + Gender */}
            <div className="cc-child-form-grid">
              <Form.Item
                label="Date of Birth"
                name="date_of_birth"
                rules={[{ required: true, message: "Required" }]}
              >
                <DatePicker
                  placeholder="Select DOB"
                  size="large"
                  className="cc-child-date-picker"
                  disabledDate={(current) => {
                    return Boolean(
                      current &&
                      !current.isBefore(dayjs().startOf("day"), "day"),
                    );
                  }}
                  format="DD/MM/YYYY"
                  showToday
                />
              </Form.Item>
              <Form.Item
                label="Gender"
                name="gender"
                rules={[{ required: true, message: "Required" }]}
              >
                <Select placeholder="Select" size="large">
                  <Option value="M">Male</Option>
                  <Option value="F">Female</Option>
                </Select>
              </Form.Item>
            </div>
            <div className="cc-child-form-section">
              <h4>Emergency contact</h4>
              <p>Someone the activity partner can contact if you are unavailable.</p>
              <Form.Item
                label="Contact name"
                name="emergency_contact_name"
                rules={[{ required: true, message: "Contact name required" }]}
              >
                <Input placeholder="Full name" size="large" maxLength={100} />
              </Form.Item>
              <div className="cc-child-form-grid">
                <Form.Item
                  label="Relationship"
                  name="emergency_contact_relationship"
                  rules={[{ required: true, message: "Relationship required" }]}
                >
                  <Input placeholder="e.g. Parent, aunt" size="large" maxLength={60} />
                </Form.Item>
                <Form.Item
                  label="Phone number"
                  name="emergency_contact_phone"
                  rules={[
                    { required: true, message: "Phone number required" },
                    {
                      pattern: /^[+0-9()\-\s]{7,30}$/,
                      message: "Enter a valid phone number",
                    },
                  ]}
                >
                  <Input placeholder="e.g. +65 9123 4567" size="large" maxLength={30} />
                </Form.Item>
              </div>
            </div>

            <div className="cc-child-form-section">
              <h4>Authorised pickup people</h4>
              <p>Add at least one person who may collect this child.</p>
              <Form.List name="authorized_pickups">
                {(fields, { add, remove }) => (
                  <div className="cc-pickup-list">
                    {fields.map(({ key, name, ...restField }, index) => (
                      <div className="cc-pickup-card" key={key}>
                        <div className="cc-pickup-card-heading">
                          <strong>Pickup person {index + 1}</strong>
                          {fields.length > 1 && (
                            <Button
                              type="text"
                              danger
                              icon={<MinusCircleOutlined />}
                              onClick={() => remove(name)}
                              aria-label={`Remove pickup person ${index + 1}`}
                            />
                          )}
                        </div>
                        <Form.Item
                          {...restField}
                          label="Name"
                          name={[name, "name"]}
                          rules={[{ required: true, message: "Name required" }]}
                        >
                          <Input placeholder="Full name" maxLength={100} />
                        </Form.Item>
                        <div className="cc-child-form-grid">
                          <Form.Item
                            {...restField}
                            label="Relationship"
                            name={[name, "relationship"]}
                            rules={[{ required: true, message: "Relationship required" }]}
                          >
                            <Input placeholder="e.g. Parent" maxLength={60} />
                          </Form.Item>
                          <Form.Item
                            {...restField}
                            label="Phone number"
                            name={[name, "phone"]}
                            rules={[
                              { required: true, message: "Phone required" },
                              {
                                pattern: /^[+0-9()\-\s]{7,30}$/,
                                message: "Enter a valid phone number",
                              },
                            ]}
                          >
                            <Input placeholder="e.g. +65 9123 4567" maxLength={30} />
                          </Form.Item>
                        </div>
                      </div>
                    ))}
                    {fields.length < 10 && (
                      <Button type="dashed" onClick={() => add()} block>
                        Add another pickup person
                      </Button>
                    )}
                  </div>
                )}
              </Form.List>
            </div>

            <Form.Item
              label="Allergies, medical and care notes"
              name="special_notes"
              extra="Include allergies, medication, medical conditions, dietary requirements, or care instructions. Enter “None” if there is nothing to declare."
              rules={[{ required: true, message: "Enter safety notes or None" }]}
            >
              <Input.TextArea
                placeholder="Describe anything the activity partner should know, or enter None"
                rows={3}
                maxLength={2000}
              />
            </Form.Item>
          </Form>

          <div className="cc-modal-btns">
            <Button
              disabled={saveChildLoading}
              onClick={() => {
                setIsAddChildModalOpen(false);
                form.resetFields();
              }}
            >
              Cancel
            </Button>
            <Button
              type="primary"
              loading={saveChildLoading}
              disabled={saveChildLoading}
              onClick={() => {
                if (!saveChildLockRef.current) form.submit();
              }}
            >
              {editingChild ? "Update Profile" : "Add Child"}
            </Button>
          </div>
        </Space>
      </Modal>

      {/* ══ Cancel booking ══ */}
      <Modal
        open={isCancelModalOpen}
        onCancel={() => {
          setIsCancelModalOpen(false);
          setBookingToCancel(null);
        }}
        footer={null}
        centered
        width={460}
        maskClosable={false}
        className="cc-modal"
        title={null}
      >
        <Space direction="vertical" size={20} style={{ width: "100%" }}>
          <div style={{ textAlign: "center" }}>
            <div className="cc-modal-icon danger">
              <DeleteOutlined />
            </div>
            <h3
              style={{
                margin: "0 0 4px",
                fontSize: 18,
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              Cancel Booking
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: "var(--text-secondary)",
              }}
            >
              Are you sure you want to cancel this booking?
            </p>
          </div>
          {bookingToCancel?.bookingTitle && (
            <div className="cc-modal-info-tile">
              <p
                style={{
                  margin: "0 0 4px",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--text-secondary)",
                }}
              >
                Booking
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                {bookingToCancel.bookingTitle}
              </p>
            </div>
          )}
          <Alert
            message={
              bookingToCancel?.refundCredits > 0
                ? `${bookingToCancel.refundCredits} credits will be refunded`
                : "This cancellation is non-refundable"
            }
            description={
              bookingToCancel?.refundCredits > 0
                ? `${bookingToCancel.refundPercentage}% of the booking credits will be returned immediately.`
                : `The refund deadline was ${bookingToCancel?.deadline?.format("DD MMM YYYY, h:mm A")}. You may still cancel to release the place.`
            }
            type={bookingToCancel?.refundCredits > 0 ? "success" : "warning"}
            showIcon
            className="cc-cancellation-alert"
          />
          <div className="cc-modal-btns">
            <Button
              danger
              loading={cancelLoading}
              onClick={confirmCancelBooking}
            >
              Yes, Cancel Booking
            </Button>
            <Button
              type="primary"
              onClick={() => {
                setIsCancelModalOpen(false);
                setBookingToCancel(null);
              }}
            >
              No, Go Back
            </Button>
          </div>
        </Space>
      </Modal>

      {/* ══ Delete child ══ */}
      <Modal
        open={isDeleteChildModalOpen}
        onCancel={() => {
          setIsDeleteChildModalOpen(false);
          setChildToDelete(null);
        }}
        footer={null}
        centered
        width={460}
        maskClosable={false}
        className="cc-modal"
        title={null}
      >
        <Space direction="vertical" size={20} style={{ width: "100%" }}>
          <div style={{ textAlign: "center" }}>
            <div className="cc-modal-icon danger">
              <UserOutlined />
            </div>
            <h3
              style={{
                margin: "0 0 4px",
                fontSize: 18,
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              Delete Child Profile
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: "var(--text-secondary)",
              }}
            >
              This action cannot be undone.
            </p>
          </div>
          {childToDelete && (
            <div
              className="cc-modal-info-tile"
              style={{ display: "flex", alignItems: "center", gap: 14 }}
            >
              <Avatar
                size={48}
                src={getChildImage(childToDelete)}
                icon={<UserOutlined />}
              />
              <div>
                <p
                  style={{
                    margin: "0 0 2px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                  }}
                >
                  {childToDelete.name}
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: "var(--text-secondary)",
                  }}
                >
                  {dayjs(childToDelete.date_of_birth).format("DD MMM YYYY")} •{" "}
                  {childToDelete.gender === "M" ? "Male" : "Female"}
                </p>
              </div>
            </div>
          )}
          <Alert
            message="This action cannot be undone"
            description="All data for this child will be permanently deleted"
            type="error"
            showIcon
            style={{ borderRadius: "var(--border-radius)" }}
          />
          <div className="cc-modal-btns">
            <Button
              onClick={() => {
                setIsDeleteChildModalOpen(false);
                setChildToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button danger loading={deleteLoading} onClick={confirmDeleteChild}>
              Delete Profile
            </Button>
          </div>
        </Space>
      </Modal>

      <CustomerDocumentModal
        documentType="booking"
        recordId={confirmationBookingId}
        open={Boolean(confirmationBookingId)}
        onClose={() => setConfirmationBookingId(null)}
      />

      <Modal
        open={Boolean(reviewBooking)}
        onCancel={() => {
          if (reviewSaving) return;
          setReviewBooking(null);
          reviewForm.resetFields();
        }}
        footer={null}
        centered
        maskClosable={false}
        className="cc-modal cc-review-modal"
        title={null}
      >
        <div className="cc-review-modal-content">
          <div className="cc-review-modal-heading">
            <span className="cc-review-kicker">Verified booking</span>
            <h3>{reviewBooking?.listing_title}</h3>
            <p>
              Share your experience without including children’s names or personal information.
            </p>
            {reviewBooking?.review_deadline ? (
              <span className="cc-review-deadline">
                {reviewBooking.can_review ? "Open" : "Editing closed"} · {" "}
                {dayjs(reviewBooking.review_deadline).format("DD MMM YYYY")}
              </span>
            ) : null}
          </div>
          <Form
            form={reviewForm}
            layout="vertical"
            onFinish={saveReview}
            requiredMark={false}
          >
            <Form.Item
              label="Overall rating"
              name="rating"
              rules={[
                {
                  validator: (_, value) =>
                    Number(value) >= 1
                      ? Promise.resolve()
                      : Promise.reject(new Error("Choose a rating")),
                },
              ]}
            >
              <Rate
                className="cc-review-rate"
                disabled={Boolean(reviewBooking?.review_id && !reviewBooking?.can_review)}
              />
            </Form.Item>
            <Form.Item label="What stood out?" name="tags">
              <Checkbox.Group
                className="cc-review-tags"
                disabled={Boolean(reviewBooking?.review_id && !reviewBooking?.can_review)}
              >
                {reviewTags.map((tag) => (
                  <Checkbox value={tag} key={tag}>
                    {tag}
                  </Checkbox>
                ))}
              </Checkbox.Group>
            </Form.Item>
            <Form.Item
              label="Your review"
              name="comment"
              extra="Optional · maximum 1,000 characters"
            >
              <Input.TextArea
                rows={5}
                maxLength={1000}
                showCount
                placeholder="What did you and your child enjoy? What could be improved?"
                disabled={Boolean(reviewBooking?.review_id && !reviewBooking?.can_review)}
              />
            </Form.Item>
            <Form.Item name="attended_at_least_one" valuePropName="checked">
              <Checkbox
                disabled={Boolean(reviewBooking?.review_id && !reviewBooking?.can_review)}
              >
                My child attended at least one session
              </Checkbox>
            </Form.Item>
            <div className="cc-modal-btns">
              {reviewBooking?.review_id ? (
                <Button danger onClick={deleteReview} disabled={reviewSaving}>
                  Delete
                </Button>
              ) : null}
              <Button
                onClick={() => {
                  setReviewBooking(null);
                  reviewForm.resetFields();
                }}
                disabled={reviewSaving}
              >
                Cancel
              </Button>
              {reviewBooking?.can_review ? (
                <Button type="primary" htmlType="submit" loading={reviewSaving}>
                  {reviewBooking?.review_id ? "Update review" : "Publish review"}
                </Button>
              ) : null}
            </div>
          </Form>
        </div>
      </Modal>
    </div>
  );
};

export default ChildrenClasses;
