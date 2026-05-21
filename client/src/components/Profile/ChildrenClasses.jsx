import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  Empty,
  List,
  Typography,
  Tag,
  Space,
  Avatar,
  Button,
  Row,
  Col,
  Spin,
  Collapse,
  Segmented,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
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
import toast from "react-hot-toast";
import { useUserContext } from "../UserContext";
import getBaseURL from "../../utils/config";
import "./ChildrenClasses.css";
import CalendarView from "./utils/CalendarView";
import boy from "../../images/profile/boys/boy0.png";
import girl from "../../images/profile/girls/girl0.png";

const { Title, Text } = Typography;
const { Panel } = Collapse;
const { Option } = Select;

const ChildrenClasses = () => {
  const { user, reauthenticate } = useUserContext();
  const baseURL = getBaseURL();
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
      (booking) =>
        booking.listing_title?.toLowerCase().includes(term) ||
        booking.partner_name?.toLowerCase().includes(term) ||
        booking.child_name?.toLowerCase().includes(term) ||
        booking.outlet_address?.toLowerCase().includes(term),
    );
  }, [bookings, searchTerm]);

  const fetchChildrenAndBookings = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");

      const childrenResponse = await fetch(
        `${baseURL}/children/${user.user_id}`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const bookingsResponse = await fetch(`${baseURL}/bookings/user`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (childrenResponse.ok && bookingsResponse.ok) {
        const childrenData = await childrenResponse.json();
        const bookingsData = await bookingsResponse.json();
        setChildren(childrenData);
        setBookings(bookingsData.bookings || []);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchChildrenAndBookings();
    }
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
      age: child.age,
      gender: child.gender,
      special_notes: child.special_notes,
    });
    setIsAddChildModalOpen(true);
  };

  const handleDeleteChild = (child) => {
    const now = new Date();
    const childUpcomingBookings = bookings.filter(
      (b) => b.child_id === child.child_id && new Date(b.start_date) >= now,
    );

    if (childUpcomingBookings.length > 0) {
      Modal.error({
        title: "Cannot Delete Child Profile",
        content: (
          <div>
            <p className="modal-alert-desc">
              This child has {childUpcomingBookings.length} upcoming{" "}
              {childUpcomingBookings.length === 1 ? "class" : "classes"}.
            </p>
            <p className="modal-alert-desc">
              Please cancel all upcoming classes before deleting the profile.
            </p>
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
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${baseURL}/children/${childToDelete.child_id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.ok) {
        toast.success("Child profile deleted successfully");
        await fetchChildrenAndBookings();
        setIsDeleteChildModalOpen(false);
        setChildToDelete(null);
      } else {
        toast.error("Failed to delete child profile");
      }
    } catch (error) {
      console.error("Error deleting child:", error);
      toast.error("Failed to delete child profile");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleSaveChild = async (values) => {
    try {
      const token = localStorage.getItem("token");
      const url = editingChild
        ? `${baseURL}/children/${editingChild.child_id}`
        : `${baseURL}/children`;

      const method = editingChild ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...values,
          parent_id: user.user_id,
        }),
      });

      if (response.ok) {
        toast.success(
          editingChild
            ? "Child profile updated successfully"
            : "Child profile added successfully",
        );
        setIsAddChildModalOpen(false);
        form.resetFields();
        setEditingChild(null);
        await fetchChildrenAndBookings();
      } else {
        toast.error("Failed to save child profile");
      }
    } catch (error) {
      console.error("Error saving child:", error);
      toast.error("Failed to save child profile");
    }
  };

  const handleCancelBooking = (booking) => {
    const classStartTime = new Date(booking.start_date);
    const now = new Date();
    const hoursUntilClass = (classStartTime - now) / (1000 * 60 * 60);

    if (hoursUntilClass < 24) {
      Modal.error({
        title: "Cannot Cancel Booking",
        content: (
          <div>
            <p className="modal-alert-desc">
              Cancellations must be made at least 24 hours before the class
              starts.
            </p>
            <p
              className="modal-alert-desc"
              style={{ color: "var(--text-disabled)" }}
            >
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
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${baseURL}/bookings/${bookingToCancel.bookingId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        toast.success(
          `Booking cancelled! ${data.refunded_credit} credits refunded.`,
        );
        await fetchChildrenAndBookings();
        await reauthenticate();
        setIsCancelModalOpen(false);
        setBookingToCancel(null);
      } else {
        const data = await response.json();
        toast.error(data.error || "Failed to cancel booking");
      }
    } catch (error) {
      console.error("Error cancelling booking:", error);
      toast.error("Failed to cancel booking");
    } finally {
      setCancelLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (dateTimeString) => {
    return new Date(dateTimeString).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const getFilteredBookings = (childId) => {
    const now = new Date();
    let filtered = filteredBookings.filter((b) => b.child_id === childId);

    if (filterType === "upcoming") {
      filtered = filtered.filter((b) => new Date(b.start_date) >= now);
    } else if (filterType === "past") {
      filtered = filtered.filter((b) => new Date(b.start_date) < now);
    }

    return filtered;
  };

  const getChildImage = (child) => {
    if (child.display_picture) {
      return child.display_picture;
    }
    try {
      return child.gender === "M"
        ? boy
        : girl;
    } catch (e) {
      return null;
    }
  };

  const renderBookingItem = (booking) => {
    let imageUrl = null;
    if (booking.images) {
      try {
        const imagesArray =
          typeof booking.images === "string"
            ? JSON.parse(booking.images)
            : booking.images;
        imageUrl = imagesArray[0];
      } catch (e) {
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
              size={64}
              src={imageUrl}
              icon={<UserOutlined />}
              className="booking-avatar"
            />
          }
          title={
            <Space direction="vertical" size={4}>
              <Text strong className="booking-title">
                {booking.listing_title}
              </Text>
              <Space size="small" className="booking-tags">
                <Tag
                  color={isPast ? "default" : "green"}
                  className="booking-tag"
                >
                  {isPast ? "Completed" : "Confirmed"}
                </Tag>
                {booking.partner_name && (
                  <Tag color="purple" className="booking-tag">
                    {booking.partner_name}
                  </Tag>
                )}
              </Space>
            </Space>
          }
          description={
            <div className="booking-meta">
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <div className="booking-meta-item">
                    <CalendarOutlined />
                    <Text type="secondary">
                      {formatDate(booking.start_date)}
                    </Text>
                  </div>
                </Col>
                <Col xs={24} sm={12}>
                  <div className="booking-meta-item">
                    <ClockCircleOutlined />
                    <Text type="secondary">
                      {formatTime(booking.start_date)} -{" "}
                      {formatTime(booking.end_date)}
                    </Text>
                  </div>
                </Col>
              </Row>
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
          <div className="child-panel-header">
            <Avatar
              size={48}
              src={getChildImage(child)}
              icon={<UserOutlined />}
              className="child-avatar"
            />
            <div className="child-info">
              <div className="child-name">
                {child.name}
                <sup>
                  <Tag
                    color={childBookings.length > 0 ? "blue" : "default"}
                    className="child-count-badge"
                  >
                    {childBookings.length}
                  </Tag>
                </sup>
              </div>
              <Text className="child-meta">
                Age {child.age} • {child.gender === "M" ? "Male" : "Female"}
              </Text>
            </div>
          </div>
        }
        key={child.child_id}
        extra={
          <Space onClick={(e) => e.stopPropagation()} className="panel-actions">
            <Button
              type="primary"
              ghost
              icon={<EditOutlined />}
              className="panel-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleEditChild(child);
              }}
            />
            <Button
              danger
              icon={<DeleteOutlined />}
              className="panel-action-btn"
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
                style={{ fontSize: 48, color: "var(--text-disabled)" }}
              />
            }
            className="empty-state"
          >
            {filterType === "upcoming" && (
              <Button type="primary" onClick={() => navigate("/classes")}>
                Browse Classes
              </Button>
            )}
          </Empty>
        ) : (
          <List
            className="booking-list"
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
    <div className="children-classes-page">
      {/* Header Section */}
      <div className="children-header">
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={3} className="children-title">
              <TeamOutlined /> Children & Classes
            </Title>
            <Text className="children-subtitle">
              Manage your children and view their booked classes
            </Text>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddChild}
            >
              Add Child
            </Button>
          </Col>
        </Row>
      </div>

      {/* Summary Stats */}
      {!loading && children.length > 0 && (
        <Row gutter={[16, 16]} className="stats-row">
          <Col xs={12} sm={6}>
            <Card className="stat-card" bordered={false}>
              <div className="stat-card-content">
                <span className="stat-card-value info">{children.length}</span>
                <Text className="stat-card-label">
                  {children.length === 1 ? "Child" : "Children"}
                </Text>
              </div>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card className="stat-card" bordered={false}>
              <div className="stat-card-content">
                <span className="stat-card-value success">{upcomingCount}</span>
                <Text className="stat-card-label">Upcoming</Text>
              </div>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card className="stat-card" bordered={false}>
              <div className="stat-card-content">
                <span className="stat-card-value muted">{pastCount}</span>
                <Text className="stat-card-label">Completed</Text>
              </div>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card className="stat-card" bordered={false}>
              <div className="stat-card-content">
                <span className="stat-card-value error">
                  {user?.credit || 0}
                </span>
                <Text className="stat-card-label">Credits</Text>
              </div>
            </Card>
          </Col>
        </Row>
      )}

      {/* Search Bar */}
      <div className="search-bar">
        <Input
          placeholder="Search by class name, partner, child name, or location..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          prefix={<SearchOutlined />}
          allowClear
          size="large"
        />
        {searchTerm && (
          <Text type="secondary" className="search-results-count">
            Found {filteredBookings.length} result
            {filteredBookings.length !== 1 ? "s" : ""}
          </Text>
        )}
      </div>

      {/* View Toggle */}
      <Card className="filter-card" bordered={false}>
        <Segmented
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { label: "📋 List View", value: "list" },
            { label: "📅 Calendar View", value: "calendar" },
          ]}
          block
          className="filter-segmented"
        />
      </Card>

      {/* Filter Card */}
      {activeTab !== "calendar" && (
        <Card className="filter-card" bordered={false}>
          <Segmented
            value={filterType}
            onChange={setFilterType}
            options={[
              { label: `Upcoming (${upcomingCount})`, value: "upcoming" },
              { label: `Past (${pastCount})`, value: "past" },
              { label: `All (${filteredBookings.length})`, value: "all" },
            ]}
            block
            className="filter-segmented"
          />
        </Card>
      )}

      {/* Calendar View */}
      {activeTab === "calendar" && <CalendarView bookings={filteredBookings} />}

      {/* Children List */}
      {activeTab === "list" && (
        <Spin spinning={loading}>
          {children.length === 0 ? (
            <Card className="empty-card" bordered={false}>
              <Empty
                description="No children profiles found"
                image={
                  <UserOutlined
                    style={{ fontSize: 48, color: "var(--text-disabled)" }}
                  />
                }
                className="empty-state"
              >
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleAddChild}
                >
                  Add Your First Child
                </Button>
              </Empty>
            </Card>
          ) : (
            <Collapse
              className="children-collapse"
              defaultActiveKey={children
                .filter((c) => getFilteredBookings(c.child_id).length > 0)
                .map((c) => c.child_id)}
              expandIconPosition="end"
            >
              {children.map((child) => renderChildPanel(child))}
            </Collapse>
          )}
        </Spin>
      )}

      {/* Add/Edit Child Modal */}
      <Modal
        title={null}
        open={isAddChildModalOpen}
        onCancel={() => {
          setIsAddChildModalOpen(false);
          form.resetFields();
        }}
        footer={null}
        centered
        width={520}
        maskClosable={false}
        className="child-modal"
      >
        <Space direction="vertical" size={24} style={{ width: "100%" }}>
          <div style={{ textAlign: "center" }}>
            <div className="modal-icon-wrapper success">
              <UserOutlined />
            </div>
            <Title level={3} className="modal-title">
              {editingChild ? "Edit Child Profile" : "Add Child Profile"}
            </Title>
            <Text className="modal-subtitle">
              {editingChild
                ? "Update your child's information"
                : "Add a new child to your family account"}
            </Text>
          </div>

          <Form
            form={form}
            layout="vertical"
            onFinish={handleSaveChild}
            requiredMark={false}
            className="modal-form"
          >
            <Form.Item
              label="Child's Name"
              name="name"
              rules={[{ required: true, message: "Please enter child name" }]}
            >
              <Input placeholder="Enter child's full name" size="large" />
            </Form.Item>

            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  label="Age"
                  name="age"
                  rules={[{ required: true, message: "Please enter age" }]}
                >
                  <InputNumber
                    min={0}
                    max={18}
                    style={{ width: "100%" }}
                    size="large"
                    placeholder="Age"
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label="Gender"
                  name="gender"
                  rules={[{ required: true, message: "Please select gender" }]}
                >
                  <Select placeholder="Select" size="large">
                    <Option value="M">Male</Option>
                    <Option value="F">Female</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Form.Item
              label="Special Notes"
              name="special_notes"
              extra="Allergies, medical conditions, or dietary requirements."
            >
              <Input.TextArea
                placeholder="Enter any special notes about the child..."
                rows={4}
                maxLength={1000}
              />
            </Form.Item>
          </Form>

          <Row gutter={12} className="modal-actions">
            <Col span={12}>
              <Button
                block
                size="large"
                className="modal-btn"
                onClick={() => {
                  setIsAddChildModalOpen(false);
                  form.resetFields();
                }}
              >
                Cancel
              </Button>
            </Col>
            <Col span={12}>
              <Button
                block
                type="primary"
                size="large"
                className="modal-btn success"
                onClick={() => form.submit()}
              >
                {editingChild ? "Update Profile" : "Add Child"}
              </Button>
            </Col>
          </Row>
        </Space>
      </Modal>

      {/* Cancel Booking Modal */}
      <Modal
        open={isCancelModalOpen}
        onCancel={() => {
          setIsCancelModalOpen(false);
          setBookingToCancel(null);
        }}
        footer={null}
        centered
        width={500}
        maskClosable={false}
        className="child-modal"
      >
        <Space direction="vertical" size={24} style={{ width: "100%" }}>
          <div style={{ textAlign: "center" }}>
            <div className="modal-icon-wrapper error">
              <DeleteOutlined />
            </div>
            <Title level={3} className="modal-title">
              Cancel Class Booking
            </Title>
            <Text className="modal-subtitle">
              Are you sure you want to cancel this booking?
            </Text>
          </div>

          {bookingToCancel?.bookingTitle && (
            <Card className="modal-info-card" bordered={false}>
              <Text className="modal-info-label">Booking Details</Text>
              <Text className="modal-info-value">
                {bookingToCancel.bookingTitle}
              </Text>
            </Card>
          )}

          <Alert
            message={
              <span className="modal-alert-title">
                Credits will be automatically refunded
              </span>
            }
            description={
              <Text className="modal-alert-desc">
                The refunded credits will be available immediately for booking
                other classes
              </Text>
            }
            type="success"
            showIcon
            className="modal-alert success"
          />

          <Row gutter={12} className="modal-actions">
            <Col span={12}>
              <Button
                block
                size="large"
                className="modal-btn"
                onClick={() => {
                  setIsCancelModalOpen(false);
                  setBookingToCancel(null);
                }}
              >
                Keep Booking
              </Button>
            </Col>
            <Col span={12}>
              <Button
                block
                danger
                size="large"
                loading={cancelLoading}
                className="modal-btn error"
                onClick={confirmCancelBooking}
              >
                Cancel Booking
              </Button>
            </Col>
          </Row>
        </Space>
      </Modal>

      {/* Delete Child Profile Modal */}
      <Modal
        open={isDeleteChildModalOpen}
        onCancel={() => {
          setIsDeleteChildModalOpen(false);
          setChildToDelete(null);
        }}
        footer={null}
        centered
        width={500}
        maskClosable={false}
        className="child-modal"
      >
        <Space direction="vertical" size={24} style={{ width: "100%" }}>
          <div style={{ textAlign: "center" }}>
            <div className="modal-icon-wrapper error">
              <UserOutlined />
            </div>
            <Title level={3} className="modal-title">
              Delete Child Profile
            </Title>
            <Text className="modal-subtitle">
              Are you sure you want to delete this child's profile?
            </Text>
          </div>

          {childToDelete && (
            <Card className="modal-info-card" bordered={false}>
              <Space align="center" style={{ width: "100%" }}>
                <Avatar
                  size={56}
                  src={getChildImage(childToDelete)}
                  icon={<UserOutlined />}
                />
                <Space direction="vertical" size={4} style={{ flex: 1 }}>
                  <Text strong className="modal-info-value">
                    {childToDelete.name}
                  </Text>
                  <Text className="modal-alert-desc">
                    Age {childToDelete.age} •{" "}
                    {childToDelete.gender === "M" ? "Male" : "Female"}
                  </Text>
                </Space>
              </Space>
            </Card>
          )}

          <Alert
            message={
              <span className="modal-alert-title">
                This action cannot be undone
              </span>
            }
            description={
              <Text className="modal-alert-desc">
                All data associated with this child's profile will be
                permanently deleted
              </Text>
            }
            type="error"
            showIcon
            className="modal-alert error"
          />

          <Row gutter={12} className="modal-actions">
            <Col span={12}>
              <Button
                block
                size="large"
                className="modal-btn"
                onClick={() => {
                  setIsDeleteChildModalOpen(false);
                  setChildToDelete(null);
                }}
              >
                Cancel
              </Button>
            </Col>
            <Col span={12}>
              <Button
                block
                danger
                size="large"
                loading={deleteLoading}
                className="modal-btn error"
                onClick={confirmDeleteChild}
              >
                Delete Profile
              </Button>
            </Col>
          </Row>
        </Space>
      </Modal>
    </div>
  );
};

export default ChildrenClasses;
