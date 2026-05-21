import { useState, useEffect, useMemo } from "react";
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
  Segmented,
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
import dayjs from "dayjs";
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

  const fetchChildrenAndBookings = async () => {
    setLoading(true);
    try {
      const [cr, br] = await Promise.all([
        fetchWithAuth(API_ENDPOINTS.GET_CHILDREN(user.user_id), {
          method: "GET",
        }),
        fetchWithAuth(API_ENDPOINTS.GET_BOOKINGS, { method: "GET" }),
      ]);
      if (cr.ok && br.ok) {
        setChildren(await cr.json());
        setBookings((await br.json()).bookings || []);
      }
    } catch {
      toast.error("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchChildrenAndBookings();
  }, [user]);

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
    const hoursUntil =
      (new Date(booking.start_date) - new Date()) / (1000 * 60 * 60);
    if (hoursUntil < 24) {
      Modal.error({
        title: "Cannot Cancel Booking",
        content: (
          <div>
            <p>
              Cancellations must be made at least 24 hours before the class.
            </p>
            <p style={{ color: "var(--text-secondary)" }}>
              Class starts:{" "}
              {new Date(booking.start_date).toLocaleString("en-US", {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        ),
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
    const isPast = new Date(booking.start_date) < new Date();

    return (
      <List.Item
        key={booking.booking_id}
        actions={
          !isPast
            ? [
                <Button
                  type="primary"
                  danger
                  size="small"
                  onClick={() => handleCancelBooking(booking)}
                >
                  Cancel
                </Button>,
              ]
            : []
        }
      >
        <List.Item.Meta
          avatar={
            <Avatar
              size={52}
              src={imageUrl}
              icon={<UserOutlined />}
              className="cc-booking-avatar"
            />
          }
          title={
            <Space direction="vertical" size={4}>
              <Text strong className="cc-booking-title">
                {booking.listing_title}
              </Text>
              <Space size="small">
                <Tag
                  color={isPast ? "default" : "green"}
                  style={{ borderRadius: 100, fontSize: 11, fontWeight: 600 }}
                >
                  {isPast ? "Completed" : "Confirmed"}
                </Tag>
                {booking.partner_name && (
                  <Tag
                    color="purple"
                    style={{ borderRadius: 100, fontSize: 11, fontWeight: 600 }}
                  >
                    {booking.partner_name}
                  </Tag>
                )}
              </Space>
            </Space>
          }
          description={
            /* ── Plain flex div — NO Row/Col ── */
            <div className="cc-booking-meta">
              <span className="cc-booking-meta-item">
                <CalendarOutlined /> {formatDate(booking.start_date)}
              </span>
              <span className="cc-booking-meta-item">
                <ClockCircleOutlined /> {formatTime(booking.start_date)} –{" "}
                {formatTime(booking.end_date)}
              </span>
            </div>
          }
        />
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

  const upcomingCount = filteredBookings.filter(
    (b) => new Date(b.start_date) >= new Date(),
  ).length;
  const pastCount = filteredBookings.filter(
    (b) => new Date(b.start_date) < new Date(),
  ).length;

  return (
    <div className="cc-page fade-in">
      {/* Header row */}
      <div className="cc-header-row">
        <div>
          <h2 className="cc-page-title">
            <TeamOutlined /> Children &amp; Classes
          </h2>
          <p className="cc-page-sub">
            Manage your children and view their booked classes
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddChild}>
          Add Child
        </Button>
      </div>

      {/* Stats — CSS grid, NO Row/Col */}
      {!loading && children.length > 0 && (
        <div className="cc-stats-grid">
          <div className="cc-stat-card">
            <div className="cc-stat-icon primary">
              <TeamOutlined />
            </div>
            <div>
              <span className="cc-stat-value">{children.length}</span>
              <span className="cc-stat-label">
                {children.length === 1 ? "Child" : "Children"}
              </span>
            </div>
          </div>
          <div className="cc-stat-card">
            <div className="cc-stat-icon success">
              <CalendarOutlined />
            </div>
            <div>
              <span className="cc-stat-value">{upcomingCount}</span>
              <span className="cc-stat-label">Upcoming</span>
            </div>
          </div>
          <div className="cc-stat-card">
            <div className="cc-stat-icon muted">
              <BookOutlined />
            </div>
            <div>
              <span className="cc-stat-value">{pastCount}</span>
              <span className="cc-stat-label">Completed</span>
            </div>
          </div>
          <div className="cc-stat-card">
            <div className="cc-stat-icon warning">
              <UserOutlined />
            </div>
            <div>
              <span className="cc-stat-value">{user?.credit || 0}</span>
              <span className="cc-stat-label">Credits</span>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="cc-search">
        <Input
          placeholder="Search class name, partner, child, or location…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          prefix={<SearchOutlined />}
          allowClear
          size="large"
        />
        {searchTerm && (
          <span className="cc-search-count">
            Found {filteredBookings.length} result
            {filteredBookings.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* View toggle */}
      <div className="cc-filter-block">
        <Segmented
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { label: "📋 List View", value: "list" },
            { label: "📅 Calendar View", value: "calendar" },
          ]}
          block
        />
      </div>

      {/* Filter */}
      {activeTab !== "calendar" && (
        <div className="cc-filter-block">
          <Segmented
            value={filterType}
            onChange={setFilterType}
            options={[
              { label: `Upcoming (${upcomingCount})`, value: "upcoming" },
              { label: `Past (${pastCount})`, value: "past" },
              { label: `All (${filteredBookings.length})`, value: "all" },
            ]}
            block
          />
        </div>
      )}

      {activeTab === "calendar" && <CalendarView bookings={filteredBookings} />}

      {activeTab === "list" && (
        <Spin spinning={loading}>
          {children.length === 0 ? (
            <div className="cc-empty-card">
              <Empty
                description="No children profiles yet"
                image={
                  <UserOutlined
                    style={{ fontSize: 40, color: "var(--text-light)" }}
                  />
                }
              >
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleAddChild}
                >
                  Add Your First Child
                </Button>
              </Empty>
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
                  placeholder="Select date of birth"
                  size="large"
                  style={{ width: "100%" }}
                  disabledDate={(current) => {
                    // Disable future dates
                    if (current && current > dayjs().endOf("day")) return true;

                    return false;
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
              onClick={() => {
                setIsCancelModalOpen(false);
                setBookingToCancel(null);
              }}
            >
              Keep Booking
            </Button>
            <Button
              danger
              loading={cancelLoading}
              onClick={confirmCancelBooking}
            >
              Cancel Booking
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
