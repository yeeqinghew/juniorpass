import {
  LockOutlined,
  MailOutlined,
  EyeTwoTone,
  EyeInvisibleOutlined,
  UserOutlined,
  SafetyOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import { Button, Divider, Form, Input, Typography, Card } from "antd";
import { GoogleLogin } from "@react-oauth/google";
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import toast from "react-hot-toast";
import { fetchWithAuth, API_ENDPOINTS } from "../utils/api";
import useHandleLogin from "../hooks/useHandleLogin";
import CryptoJS from "crypto-js";
import "../Login.css";

const { Title, Text } = Typography;

const Login = () => {
  const location = useLocation();
  const from = location.state?.from || "/";
  const [googleLoading, setGoogleLoading] = useState(false);
  const { handleResponse, handleGoogleLogin } = useHandleLogin({
    from,
    setLoading: setGoogleLoading,
  });

  const handleLogin = async (values) => {
    try {
      const { password } = values;
      const encryptedPassword = CryptoJS.SHA256(password).toString(
        CryptoJS.enc.Hex
      );
      const loginData = { ...values, password: encryptedPassword };

      const response = await fetchWithAuth(API_ENDPOINTS.LOGIN, {
        method: "POST",
        body: JSON.stringify(loginData),
      });

      await handleResponse(response, from);
    } catch (error) {
      console.error(error.message);
      toast.error(error.message);
    }
  };

  const errorMessage = (error) => {
    console.error(error);
  };

  return (
    <section className="login-page">
      {googleLoading && (
        <div className="google-login-overlay">
          <div className="google-login-spinner">
            <div className="google-logo-wrapper">
              <div className="google-logo-pulse"></div>
              <svg className="google-logo" viewBox="0 0 48 48" width="56" height="56">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
            </div>
            <div className="google-loading-content">
              <h3 className="google-loading-title">Signing in with Google</h3>
              <p className="google-loading-text">Hang tight! We're securely connecting your account...</p>
              <div className="google-loading-dots">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="login-container">
        <Card className="login-card" bordered={false}>
          {/* Header Section */}
          <div className="login-header">
            <div className="login-icon-wrapper">
              <UserOutlined className="login-icon" />
            </div>
            <Title level={2} className="login-title">
              Welcome Back
            </Title>
            <Text className="login-subtitle">
              Sign in to access your Junior Pass account
            </Text>
          </div>

          {/* Google Login */}
          <div className="google-login-wrapper">
            <GoogleLogin
              onSuccess={handleGoogleLogin}
              onError={errorMessage}
              theme="outline"
              size="large"
              width="100%"
              text="signin_with"
            />
          </div>

          <Divider className="login-divider">
            <Text className="divider-text">or continue with email</Text>
          </Divider>

          {/* Login Form */}
          <Form
            name="normal_login"
            className="login-form"
            initialValues={{
              remember: true,
            }}
            onFinish={handleLogin}
            layout="vertical"
          >
            <Form.Item
              name="email"
              label={<Text strong>Email Address</Text>}
              rules={[
                {
                  required: true,
                  message: "Please enter your email address",
                },
                {
                  type: "email",
                  message: "Please enter a valid email address",
                },
              ]}
            >
              <Input
                prefix={<MailOutlined className="input-icon" />}
                type="email"
                size="large"
                className="login-input"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label={<Text strong>Password</Text>}
              rules={[
                {
                  required: true,
                  message: "Please enter your password",
                },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className="input-icon" />}
                type="password"
                size="large"
                className="login-input"
                iconRender={(visible) =>
                  visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
                }
              />
            </Form.Item>

            <Form.Item className="forgot-password-wrapper">
              <Link to="/forgot-password" className="forgot-password-link">
                <SafetyOutlined /> Forgot password?
              </Link>
            </Form.Item>

            <Form.Item className="submit-button-wrapper">
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                className="login-submit-btn"
                icon={<ArrowRightOutlined />}
              >
                Sign In
              </Button>
            </Form.Item>
          </Form>

          {/* Footer Links */}
          <div className="login-footer">
            <Divider className="footer-divider" />
            <div className="footer-links">
              <Text className="footer-text">
                Don't have an account?{" "}
                <Link to="/register" className="register-link">
                  Create Account
                </Link>
              </Text>
            </div>
            <div className="partner-login-wrapper">
              <Text className="partner-text">Are you a partner? </Text>
              <Link
                to="https://partner.juniorpass.sg"
                className="partner-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                Partner Login →
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
};
export default Login;
