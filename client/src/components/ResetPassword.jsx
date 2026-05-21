import { useState } from "react";
import { Form, Input, Button, Typography } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import getBaseURL from "../utils/config";
import CryptoJS from "crypto-js";

const { Title, Text } = Typography;

const ResetPassword = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const urlParams = new URLSearchParams(location.search);
  const token = urlParams.get("token");
  const baseURL = getBaseURL();

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const { password } = values;
      const encryptedPassword = CryptoJS.SHA256(password).toString(
        CryptoJS.enc.Hex
      );
      const response = await fetch(`${baseURL}/auth/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          newPassword: encryptedPassword,
        }),
      });
      const result = await response.json();

      if (response.ok && result.message) {
        toast.success(result.message);
        navigate("/login"); // Redirect to login after successful reset
      } else {
        toast.error(result.message || "Failed to reset password.");
      }
    } catch (error) {
      toast.error("Error occurred during password reset.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: "30px 40px",
        borderRadius: "10px",
        maxWidth: "600px",
        margin: "50px auto",
        boxShadow: "0 6px 20px rgba(0, 0, 0, 0.1)",
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
        gap: "15px",
      }}
    >
      <Title level={3} style={{ textAlign: "center", marginBottom: "20px" }}>
        Reset Your Password
      </Title>
      <Form
        onFinish={onFinish}
        layout="vertical"
        style={{ display: "flex", flexDirection: "column", gap: "15px" }}
      >
        <Form.Item
          name="password"
          label="New Password"
          rules={[
            {
              required: true,
              message: "Please enter your new password!",
            },
            {
              min: 6,
              message: "Password must be at least 6 characters long!",
            },
          ]}
        >
          <Input.Password
            placeholder="Enter your new password"
            size="large"
            style={{
              borderRadius: "8px",
              padding: "10px 12px",
              boxShadow: "0 2px 6px rgba(0, 0, 0, 0.1)",
            }}
          />
        </Form.Item>

        <Form.Item
          name="confirmPassword"
          label="Confirm Password"
          rules={[
            {
              required: true,
              message: "Please confirm your new password!",
            },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue("password") === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error("Passwords do not match!"));
              },
            }),
          ]}
        >
          <Input.Password
            placeholder="Confirm your new password"
            size="large"
            style={{
              borderRadius: "8px",
              padding: "10px 12px",
              boxShadow: "0 2px 6px rgba(0, 0, 0, 0.1)",
            }}
          />
        </Form.Item>

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            style={{
              width: "100%",
              borderRadius: "8px",
            }}
          >
            Reset Password
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
};

export default ResetPassword;
