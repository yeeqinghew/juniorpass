import { useState } from "react";
import { Form, Input, Button, Typography } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { fetchWithAuth, API_ENDPOINTS } from "../utils/api";
import CryptoJS from "crypto-js";
import { strongPasswordRule } from "../utils/passwordValidation";
import "./ResetPassword.css";

const { Title } = Typography;

type ResetPasswordValues = { password: string; confirmPassword: string };
type ResetPasswordResponse = { message?: string };

const ResetPassword = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const urlParams = new URLSearchParams(location.search);
  const token = urlParams.get("token");

  const onFinish = async (values: ResetPasswordValues): Promise<void> => {
    setLoading(true);
    try {
      const { password } = values;
      const encryptedPassword = CryptoJS.SHA256(password).toString(
        CryptoJS.enc.Hex
      );
      const response = await fetchWithAuth(API_ENDPOINTS.RESET_PASSWORD, {
        method: "POST",
        body: JSON.stringify({
          token,
          newPassword: encryptedPassword,
        }),
      });
      const result = (await response.json()) as ResetPasswordResponse;

      if (response.ok && result.message) {
        toast.success(result.message);
        navigate("/login"); // Redirect to login after successful reset
      } else {
        toast.error(result.message || "Failed to reset password.");
      }
    } catch {
      toast.error("Error occurred during password reset.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="reset-password-card">
      <Title level={3} className="reset-password-title">
        Reset Your Password
      </Title>
      <Form
        onFinish={onFinish}
        layout="vertical"
        className="reset-password-form"
      >
        <Form.Item
          name="password"
          label="New Password"
          rules={[
            {
              required: true,
              message: "Please enter your new password!",
            },
            strongPasswordRule,
          ]}
        >
          <Input.Password
            placeholder="Enter your new password"
            size="large"
            className="reset-password-input"
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
            className="reset-password-input"
          />
        </Form.Item>

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            className="reset-password-submit"
          >
            Reset Password
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
};

export default ResetPassword;
