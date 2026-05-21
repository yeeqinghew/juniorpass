import { useState, useEffect, useRef } from "react";
import { Avatar, Button, Form, Input, Typography } from "antd";
import {
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  LockOutlined,
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
  CameraOutlined,
} from "@ant-design/icons";
import { useUserContext } from "../UserContext";
import toast from "react-hot-toast";
import { fetchWithAuth, API_ENDPOINTS } from "../../utils/api";
import CryptoJS from "crypto-js";
import "./Account.css";

const { Title, Text } = Typography;

const Account = () => {
  const { user, reauthenticate } = useUserContext();
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [saveLoading, setSaveLoading] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (user) {
      profileForm.setFieldsValue({
        name: user.name,
        email: user.email,
        phone_number: user.phone_number || "",
      });
    }
  }, [user, profileForm]);

  const handleSaveProfile = async () => {
    try {
      setSaveLoading(true);
      const values = await profileForm.validateFields();
      const res = await fetchWithAuth(API_ENDPOINTS.UPDATE_PROFILE(user.user_id), {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Profile updated!");
        setIsEditingProfile(false);
        await reauthenticate();
      } else {
        toast.error(data.message || "Update failed");
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleCancelProfile = () => {
    setIsEditingProfile(false);
    profileForm.setFieldsValue({
      name: user.name,
      email: user.email,
      phone_number: user.phone_number || "",
    });
  };

  const handleChangePassword = async () => {
    try {
      setPwLoading(true);
      const values = await passwordForm.validateFields();

      const encryptedOldPassword = CryptoJS.SHA256(values.oldPassword).toString(
        CryptoJS.enc.Hex
      );
      const encryptedNewPassword = CryptoJS.SHA256(values.newPassword).toString(
        CryptoJS.enc.Hex
      );

      const res = await fetchWithAuth(API_ENDPOINTS.CHANGE_PASSWORD, {
        method: "POST",
        body: JSON.stringify({
          oldPassword: encryptedOldPassword,
          newPassword: encryptedNewPassword
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Password changed!");
        setIsChangingPassword(false);
        passwordForm.resetFields();
        // TODO: log out user from all devices after password change
        localStorage.removeItem("token");
        window.location.href = "/login";
      } else {
        toast.error(data.message || "Failed to change password");
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setPwLoading(false);
    }
  };

  const handleCancelPassword = () => {
    setIsChangingPassword(false);
    passwordForm.resetFields();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Only image files allowed"); return; }
    if (file.size / 1024 / 1024 > 5)    { toast.error("Image must be under 5MB");   return; }
    try {
      setUploadLoading(true);
      const oldDP = user?.display_picture;

      const sigRes  = await fetchWithAuth(API_ENDPOINTS.UPLOAD_USER_DP, { method: "POST" });
      const sigData = await sigRes.json();
      if (!sigRes.ok) throw new Error(sigData.error || "Signature failed");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key",   sigData.apiKey);
      formData.append("timestamp", sigData.allowedParams.timestamp);
      formData.append("signature", sigData.signature);
      formData.append("folder",    sigData.allowedParams.folder);
      formData.append("public_id", sigData.allowedParams.public_id);
      formData.append("overwrite", sigData.allowedParams.overwrite);

      const uploadRes  = await fetch(`https://api.cloudinary.com/v1_1/${sigData.cloudName}/image/upload`, { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error?.message || "Upload failed");

      const updateRes = await fetchWithAuth(API_ENDPOINTS.UPDATE_PROFILE(user.user_id), {
        method: "PATCH",
        body: JSON.stringify({ display_picture: uploadData.secure_url }),
      });
      if (!updateRes.ok) throw new Error("Failed to save picture");

      await reauthenticate();
      toast.success("Profile picture updated!");
    } catch (err) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploadLoading(false);
      e.target.value = "";
    }
  };

  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—";

  return (
    <div className="ac-page fade-in">

      {/* Page heading */}
      <div className="ac-page-header">
        <Title level={3} className="ac-page-title">
          <UserOutlined /> My Account
        </Title>
        <Text className="ac-page-sub">Manage your profile and security settings</Text>
      </div>

      <div className="ac-layout">

        {/* ── Sidebar ── */}
        <aside className="ac-sidebar">
          <div className="ac-avatar-wrap">
            <Avatar size={88} src={user?.display_picture} icon={<UserOutlined />} className="ac-avatar" />
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
            <button
              className="ac-camera-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadLoading}
              title="Change photo"
            >
              <CameraOutlined />
            </button>
          </div>

          <p className="ac-sidebar-name">{user?.name || "—"}</p>
          <p className="ac-sidebar-email">{user?.email || "—"}</p>

          <div className="ac-meta">
            <div className="ac-meta-row">
              <span className="ac-meta-label">Member since</span>
              <span className="ac-meta-val">{formatDate(user?.created_at)}</span>
            </div>
            <div className="ac-meta-row">
              <span className="ac-meta-label">Status</span>
              <span className="ac-meta-val ac-active">● Active</span>
            </div>
            <div className="ac-meta-row">
              <span className="ac-meta-label">User ID</span>
              <span className="ac-meta-val ac-uid">{user?.user_id || "—"}</span>
            </div>
          </div>
        </aside>

        {/* ── Main sections ── */}
        <main className="ac-main">

          {/* Profile section */}
          <div className="ac-section">
            <div className="ac-section-top">
              <div className="ac-section-info">
                <h3 className="ac-section-title">Personal Information</h3>
                <p className="ac-section-desc">Update your name and contact details</p>
              </div>
              <div className="ac-section-actions">
                {!isEditingProfile ? (
                  <Button icon={<EditOutlined />} onClick={() => setIsEditingProfile(true)}>Edit</Button>
                ) : (
                  <>
                    <Button icon={<CloseOutlined />} onClick={handleCancelProfile}>Cancel</Button>
                    <Button type="primary" icon={<SaveOutlined />} loading={saveLoading} onClick={handleSaveProfile}>Save</Button>
                  </>
                )}
              </div>
            </div>

            <Form form={profileForm} layout="vertical" disabled={!isEditingProfile} className="ac-form">
              <div className="ac-form-grid">
                <Form.Item name="name" label="Full Name"
                  rules={[{ required: true, message: "Name is required" }, { min: 2, message: "At least 2 characters" }]}>
                  <Input prefix={<UserOutlined />} placeholder="Your full name" />
                </Form.Item>

                <Form.Item name="email" label="Email Address">
                  <Input prefix={<MailOutlined />} disabled />
                </Form.Item>

                <Form.Item name="phone_number" label="Phone Number"
                  rules={[{ pattern: /^[0-9+\-\s()]*$/, message: "Invalid phone number" }]}>
                  <Input prefix={<PhoneOutlined />} placeholder="Your phone number" />
                </Form.Item>
              </div>
            </Form>
          </div>

          {/* Security section */}
          <div className="ac-section">
            <div className="ac-section-top">
              <div className="ac-section-info">
                <h3 className="ac-section-title">Security</h3>
                <p className="ac-section-desc">Keep your account safe with a strong password</p>
              </div>
              <div className="ac-section-actions">
                {!isChangingPassword ? (
                  <Button icon={<LockOutlined />} onClick={() => setIsChangingPassword(true)}>Change Password</Button>
                ) : (
                  <>
                    <Button icon={<CloseOutlined />} onClick={handleCancelPassword}>Cancel</Button>
                    <Button type="primary" icon={<SaveOutlined />} loading={pwLoading} onClick={handleChangePassword}>Update</Button>
                  </>
                )}
              </div>
            </div>

            {!isChangingPassword ? (
              <div className="ac-pw-row">
                <div className="ac-pw-icon-wrap"><LockOutlined /></div>
                <div>
                  <p className="ac-pw-label">Password</p>
                  <p className="ac-pw-hint">Click "Change Password" to update your credentials</p>
                </div>
              </div>
            ) : (
              <Form form={passwordForm} layout="vertical" className="ac-form">
                <div className="ac-form-grid">
                  <Form.Item name="oldPassword" label="Current Password"
                    rules={[{ required: true, message: "Required" }]}>
                    <Input.Password prefix={<LockOutlined />} placeholder="Current password" />
                  </Form.Item>

                  <Form.Item name="newPassword" label="New Password"
                    rules={[{ required: true, message: "Required" }, { min: 8, message: "At least 8 characters" }]}>
                    <Input.Password prefix={<LockOutlined />} placeholder="New password" />
                  </Form.Item>

                  <Form.Item name="confirmPassword" label="Confirm New Password"
                    dependencies={["newPassword"]}
                    rules={[
                      { required: true, message: "Required" },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue("newPassword") === value) return Promise.resolve();
                          return Promise.reject("Passwords do not match");
                        },
                      }),
                    ]}>
                    <Input.Password prefix={<LockOutlined />} placeholder="Confirm new password" />
                  </Form.Item>
                </div>
              </Form>
            )}
          </div>

        </main>
      </div>
    </div>
  );
};

export default Account;