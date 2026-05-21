import { useState, useEffect } from "react";
import {
  Avatar,
  Button,
  Card,
  Col,
  Form,
  Input,
  Row,
  Space,
  Typography,
  Upload,
  message,
} from "antd";
import {
  EditOutlined,
  SaveOutlined,
  UserOutlined,
  UploadOutlined,
  CheckCircleOutlined,
  LockOutlined,
  MailOutlined,
  PhoneOutlined,
  CalendarOutlined,
  IdcardOutlined,
} from "@ant-design/icons";
import { useUserContext } from "../UserContext";
import toast from "react-hot-toast";
import getBaseURL from "../../utils/config";
import "./Account.css";

const { Title, Text } = Typography;

const Account = () => {
  const { user } = useUserContext();
  const baseURL = getBaseURL();
  const [isEditing, setIsEditing] = useState(false);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      form.setFieldsValue({
        name: user.name,
        email: user.email,
        phone_number: user.phone_number || "",
      });
    }
  }, [user, form]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    form.setFieldsValue({
      name: user.name,
      email: user.email,
      phone: user.phone_number || "",
    });
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const values = await form.validateFields();
      console.log("Form values to save:", values);
      const token = localStorage.getItem("token");

      const response = await fetch(`${baseURL}/auth/${user.user_id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(values),
      });

      const parseRes = await response.json();

      if (response.ok) {
        toast.success("Profile updated successfully!");
        setIsEditing(false);
      } else {
        toast.error(parseRes.message || "Failed to update profile");
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (info) => {
    if (info.file.status === "done") {
      message.success(`${info.file.name} file uploaded successfully`);
    } else if (info.file.status === "error") {
      message.error(`${info.file.name} file upload failed.`);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="account-page">
      {/* Header Section */}
      <div className="account-header">
        <Title level={3} className="account-title">
          <UserOutlined /> My Account
        </Title>
        <Text className="account-subtitle">
          Manage your profile information and account settings
        </Text>
      </div>

      <div className="account-cards-row">
        {/* Profile Picture Section */}
        <div className="profile-card-wrapper">
          <Card className="profile-card" bordered={false}>
            <div className="profile-card-content">
              <Avatar
                size={100}
                src={user?.display_picture}
                icon={<UserOutlined />}
                className="profile-avatar"
              />
              <Title level={5} className="profile-name">
                {user?.name || "User"}
              </Title>
              <Text className="profile-email">{user?.email}</Text>
              <div className="profile-badge">
                <CheckCircleOutlined />
                Active Account
              </div>

              <Upload
                name="avatar"
                showUploadList={false}
                action={`${baseURL}/upload/avatar`}
                onChange={handleAvatarUpload}
                disabled={!isEditing}
              >
                <Button
                  icon={<UploadOutlined />}
                  disabled={!isEditing}
                  size="small"
                  className="upload-button"
                >
                  {isEditing ? "Change Photo" : "Photo"}
                </Button>
              </Upload>

              <div className="profile-member-since">
                <CalendarOutlined className="member-icon" />
                <span>Member since {formatDate(user?.created_at)}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* User Information Section */}
        <div className="info-card-wrapper">
          <Card
            title="Personal Information"
            bordered={false}
            extra={
              <Space className="action-buttons">
                {!isEditing ? (
                  <Button
                    type="primary"
                    icon={<EditOutlined />}
                    onClick={handleEdit}
                  >
                    Edit Profile
                  </Button>
                ) : (
                  <>
                    <Button onClick={handleCancel}>Cancel</Button>
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      loading={loading}
                      onClick={handleSave}
                    >
                      Save Changes
                    </Button>
                  </>
                )}
              </Space>
            }
          >
            <Form
              form={form}
              layout="vertical"
              disabled={!isEditing}
              className="account-form"
            >
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="name"
                    label="Full Name"
                    rules={[
                      {
                        required: true,
                        message: "Please enter your full name",
                      },
                      { min: 2, message: "Name must be at least 2 characters" },
                    ]}
                  >
                    <Input
                      prefix={<UserOutlined />}
                      placeholder="Enter your full name"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="email" label="Email Address">
                    <Input disabled prefix={<MailOutlined />} />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="phone_number"
                    label="Phone Number"
                    rules={[
                      {
                        pattern: /^[0-9+\-\s()]*$/,
                        message: "Please enter a valid phone number",
                      },
                    ]}
                  >
                    <Input
                      prefix={<PhoneOutlined />}
                      placeholder="Enter your phone number"
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Form>

            {/* Account Details */}
            <div className="account-details-section">
              <Text strong className="account-details-title">
                Account Details
              </Text>
              <div className="detail-row">
                <span className="detail-label">
                  <IdcardOutlined className="detail-icon" />
                  User ID
                </span>
                <span className="detail-value">{user?.user_id || "N/A"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">
                  <CheckCircleOutlined className="detail-icon" />
                  Account Status
                </span>
                <span className="detail-value active">Active</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Security Section */}
      <Row gutter={[24, 24]} className="security-row">
        <Col xs={24}>
          <Card
            className="security-card"
            title={
              <Space>
                <LockOutlined />
                Security
              </Space>
            }
            bordered={false}
          >
            <div className="security-item">
              <div className="security-item-info">
                <span className="security-item-title">Password</span>
                <span className="security-item-desc">Last changed: Never</span>
              </div>
              <Button type="default">Change Password</Button>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Account;
