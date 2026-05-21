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
import toast from "react-hot-toast";
import getBaseURL from "../utils/config";
import useHandleLogin from "../hooks/useHandleLogin";
import CryptoJS from "crypto-js";
import "../Login.css";

const { Title, Text } = Typography;

const Login = () => {
  const baseURL = getBaseURL();
  const location = useLocation();
  const from = location.state?.from || "/";
  const { handleResponse, handleGoogleLogin } = useHandleLogin({
    from,
  });

  const handleLogin = async (values) => {
    try {
      const { password } = values;
      const encryptedPassword = CryptoJS.SHA256(password).toString(
        CryptoJS.enc.Hex
      );
      const loginData = { ...values, password: encryptedPassword };

      const response = await fetch(`${baseURL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
