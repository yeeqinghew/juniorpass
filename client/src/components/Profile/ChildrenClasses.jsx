import { useState, useEffect, useMemo, useCallback } from "react";
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
} from "@ant-design/icons";
import dayjs from "../../utils/dayjs";
import toast from "react-hot-toast";
import { useUserContext } from "../UserContext";
import { fetchWithAuth, API_ENDPOINTS } from "../../utils/api";
import "./ChildrenClasses.css";
import CalendarView from "./utils/CalendarView";
import boy from "../../images/profile/boys/boy0.png";
import girl from "../../images/profile/girls/girl0.png";

const { Text } = Typography;
const { Panel } = Collapse;
const { Option } = Select;

const ChildrenClasses = () => {
  const { user, reauthenticate } = useUserContext();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [children, setChildren] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [occurrences, setOccurrences] = useState([]);
  const [filterType, setFilterType] = useState("upcoming");
  const [isAddChildModalOpen, setIsAddChildModalOpen] = useState(false);
  const [editingChild, setEditingChild] = useState(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [bookingToCancel, setBookingToCancel] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [isDeleteChildModalOpen, setIsDeleteChildModalOpen] = useState(false);
  const [childToDelete, setChildToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("list");
  const [form] = Form.useForm();

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
      const [cr, br, or] = await Promise.all([
        fetchWithAuth(API_ENDPOINTS.GET_CHILDREN(user.user_id), {
          method: "GET",
        }),
        fetchWithAuth(API_ENDPOINTS.GET_BOOKINGS, { method: "GET" }),
        fetchWithAuth(API_ENDPOINTS.GET_CLASS_OCCURRENCES, { method: "GET" }),
      ]);
      if (cr.ok && br.ok) {
        setChildren(await cr.json());
        setBookings((await br.json()).bookings || []);
      }
      if (or.ok) {
        setOccurrences((await or.json()).occurrences || []);
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
    setIsAddChildModalOpen(true);
  };

  const handleEditChild = (child) => {
    setEditingChild(child);
    form.setFieldsValue({
      name: child.name,
      date_of_birth: child.date_of_birth ? dayjs(child.date_of_birth) : null,
      gender: child.gender,
      special_notes: child.special_notes,
    });
    setIsAddChildModalOpen(true);
  };

  const handleDeleteChild = (child) => {
    const now = new Date();
    const upcoming = bookings.filter(
      (b) => b.child_id === child.child_id && new Date(b.start_date) >= now,
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
    }
  };

  const handleCancelBooking = (booking) => {
    const classStart = new Date(booking.start_date);
    const now = new Date();

    const hoursUntil = (classStart - now) / (1000 * 60 * 60);

    const isProgressive = booking.is_progressive === true;

    if (isProgressive) {
      if (now >= classStart) {
        Modal.error({
          title: "Cannot Cancel Programme",
          content:
            "This progressive programme can no longer be cancelled because the first lesson has already started.",
          okText: "Understood",
          centered: true,
        });

        return;
      }
    } else if (hoursUntil < 24) {
      Modal.error({
        title: "Cannot Cancel Booking",
        content:
          "Cancellations must be made at least 24 hours before the class.",
        okText: "Understood",
        centered: true,
      });

      return;
    }

    setBookingToCancel({
      bookingId: booking.booking_id,
      bookingTitle: booking.listing_title,
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

  const formatDate = (s) =>
    new Date(s).toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  const formatTime = (s) =>
    new Date(s).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  const getFilteredBookings = (childId) => {
    const now = new Date();
    let list = filteredBookings.filter((b) => b.child_id === childId);
    if (filterType === "upcoming")
      list = list.filter((b) => new Date(b.start_date) >= now);
    else if (filterType === "past")
      list = list.filter((b) => new Date(b.start_date) < now);
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

    const now = new Date();
    const classStart = new Date(booking.start_date);

    const hoursUntilClass = (classStart - now) / (1000 * 60 * 60);

    const isProgressive = booking.is_progressive;
    const hasStarted = now >= classStart;

    const canCancel = isProgressive ? now < classStart : hoursUntilClass >= 24;

    const statusLabel = isProgressive
      ? hasStarted
        ? "In Progress"
        : "Confirmed"
      : hasStarted
        ? "Completed"
        : "Confirmed";

    const statusColor = isProgressive
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
    const startDate = new Date(booking.start_date);
    if (filterType === "upcoming") return startDate >= new Date();
    if (filterType === "past") return startDate < new Date();
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
        />
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

      {/* ══ Add / Edit child ══ */}
      <Modal
        open={isAddChildModalOpen}
        onCancel={() => {
          setIsAddChildModalOpen(false);
          form.resetFields();
        }}
        footer={null}
        centered
        width={500}
        maskClosable={false}
        className="cc-modal"
        title={null}
      >
        <Space direction="vertical" size={20} style={{ width: "100%" }}>
          <div style={{ textAlign: "center" }}>
            <div className="cc-modal-icon success">
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
              {editingChild ? "Edit Child Profile" : "Add Child Profile"}
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: "var(--text-secondary)",
              }}
            >
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0 16px",
              }}
            >
              <Form.Item
                label="Date of Birth"
                name="date_of_birth"
                rules={[{ required: true, message: "Required" }]}
              >
                <DatePicker
                  placeholder="Select DOB"
                  size="large"
                  style={{ width: "100%" }}
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
            <Form.Item
              label="Special Notes"
              name="special_notes"
              extra="Allergies, medical conditions, dietary requirements."
            >
              <Input.TextArea
                placeholder="Any special notes…"
                rows={3}
                maxLength={1000}
              />
            </Form.Item>
          </Form>

          <div className="cc-modal-btns">
            <Button
              onClick={() => {
                setIsAddChildModalOpen(false);
                form.resetFields();
              }}
            >
              Cancel
            </Button>
            <Button type="primary" onClick={() => form.submit()}>
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
            message="Credits will be automatically refunded"
            description="Refunded credits are available immediately for other bookings"
            type="success"
            showIcon
            style={{ borderRadius: "var(--border-radius)" }}
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
    </div>
  );
};

export default ChildrenClasses;
