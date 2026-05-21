import { useState, useEffect } from "react";
import {
  ArrowLeftOutlined,
  SafetyCertificateOutlined,
  MailOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import {
  Button,
  Form,
  Input,
  Typography,
  Divider,
  Card,
  Alert,
  Space,
} from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { fetchWithAuth, API_ENDPOINTS } from "../utils/api";
import {
  getSessionOtpState,
  saveOtpState,
  clearOtpState,
  setCooldownExpiry,
  getCooldownTimeLeft,
  MAX_OTP_ATTEMPTS,
  SESSION_KEYS,
} from "../utils/otpSessionUtils";
import { useUserContext } from "./UserContext";
import CryptoJS from "crypto-js";
import "../Login.css";

const { Title, Text } = Typography;

const VerifyOTP = () => {
  const [otpForm] = Form.useForm();
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuth } = useUserContext();

  // User Data
  const userData = location.state || {};
  const { name, phoneNumber, email, password, referral_code } = userData;

  // OTP State
  const [cooldown, setCooldown] = useState(() => getCooldownTimeLeft());
  const [otpAttempts, setOtpAttempts] = useState(
    () => getSessionOtpState().attempts,
  );
  const [isOtpLocked, setIsOtpLocked] = useState(
    () => getSessionOtpState().locked,
  );
  const [hasRequestedOtp, setHasRequestedOtp] = useState(
    () => getSessionOtpState().requested,
  );

  // UI State
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  // Check whether email/password exists
  useEffect(() => {
    if (!email || !password) {
      toast.error("No user data found, please register again.");
      navigate("/register");
    }
  }, [email, password, navigate]);

  // Countdown Timer
  useEffect(() => {
    if (cooldown > 0) {
      const interval = setInterval(() => {
        setCooldown(getCooldownTimeLeft());
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [cooldown]);

  // Auto-unlock after cooldown
  useEffect(() => {
    if (cooldown <= 0 && otpAttempts >= MAX_OTP_ATTEMPTS) {
      clearOtpState();
      setOtpAttempts(0);
      setIsOtpLocked(false);
      setHasRequestedOtp(false);
    }
  }, [cooldown, otpAttempts]);

  // Send OTP Handler
  const sendOtp = async () => {
    setIsResending(true);
    try {
      const response = await fetchWithAuth(API_ENDPOINTS.SEND_OTP, {
        method: "POST",
        body: JSON.stringify({ email }),
      });

      const parseRes = await response.json();
      if (response.ok) {
        toast.success(parseRes.message || "OTP sent successfully!");
        setCooldownExpiry();
        setCooldown(getCooldownTimeLeft());

        setOtpAttempts(0);
        setIsOtpLocked(false);

        sessionStorage.setItem(SESSION_KEYS.requested, "true");
        setHasRequestedOtp(true);
      } else {
        throw new Error(parseRes.message || "Failed to send OTP.");
      }
    } catch (error) {
      toast.error("Failed to send OTP. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  // Verify OTP Handler
  const onVerify = async (values) => {
    if (isOtpLocked) {
      toast.error(
        "Verification failed. Please click Resend OTP and try again.",
        {
          autoClose: 8000,
        },
      );
      return;
    }

    setIsVerifying(true);

    try {
      const otp = values.otp;

      const verifyResponse = await fetchWithAuth(API_ENDPOINTS.VERIFY_OTP, {
        method: "POST",
        body: JSON.stringify({ email, otp }),
      });

      const verifyRes = await verifyResponse.json();

      if (!verifyResponse.ok) {
        const attempts = otpAttempts + 1;
        const locked = attempts >= MAX_OTP_ATTEMPTS;

        setOtpAttempts((prev) => {
          const newAttempts = prev + 1;
          const locked = newAttempts >= MAX_OTP_ATTEMPTS;
          setIsOtpLocked(locked);
          saveOtpState(newAttempts, locked);
          return newAttempts;
        });

        toast.error(
          locked
            ? "Verification failed. Please click Resend OTP and try again."
            : verifyRes.message || "Enter a valid verification code.",
          { autoClose: 8000 },
        );

        return;
      }

      const encodedPhoneNumber = btoa(phoneNumber);
      const encryptedPassword = CryptoJS.SHA256(password).toString(
        CryptoJS.enc.Hex,
      );

      const registrationData = {
        name,
        phoneNumber: encodedPhoneNumber,
        email,
        password: encryptedPassword,
      };

      const registerResponse = await fetchWithAuth(API_ENDPOINTS.REGISTER, {
        method: "POST",
        body: JSON.stringify(registrationData),
      });

      const registerRes = await registerResponse.json();

      if (!registerResponse.ok || !registerRes.token) {
        toast.error(registerRes.message || "Failed to register user.");
        return;
      }

      const newUserId = registerRes.user_id;

      // If there was a referral code, create the referral record
      if (referral_code) {
        try {
          // Validate the code again to get referrer_id
          const referralValidation = await fetchWithAuth(API_ENDPOINTS.REGISTER_WITH_CODE, {
            method: "POST",
            body: JSON.stringify({ referral_code }),
          });

          const validationData = await referralValidation.json();

          if (referralValidation.ok && validationData.valid) {
            // Create the referral record
            await fetchWithAuth(API_ENDPOINTS.CREATE_REFERRAL, {
              method: "POST",
              body: JSON.stringify({
                referrer_id: validationData.referrer_id,
                referee_id: newUserId,
              }),
            });
          }
        } catch (referralError) {
          console.error("Error creating referral:", referralError);
          // Don't block registration if referral fails
        }
      }

      localStorage.setItem("token", registerRes.token);
      setAuth(true);
      clearOtpState();
      toast.success("Registration successful! Redirecting...");
      otpForm.resetFields();
      navigate("/login");
    } catch (error) {
      toast.error(error.message || "An error occurred.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <section className="register-page">
      <div className="register-container">
        <Card className="register-card" bordered={false}>
          {/* Back Button */}
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/register")}
            className="back-button"
          >
            Back to Registration
          </Button>

          {/* Header Section */}
          <div className="register-header">
            <div className="register-icon-wrapper">
              <SafetyCertificateOutlined className="register-icon" />
            </div>
            <Title level={2} className="register-title">
              Verify Your Email
            </Title>
            <Text className="register-subtitle">
              We've sent a verification code to{" "}
              <strong style={{ color: "#98BDD2" }}>{email}</strong>
            </Text>
          </div>

          {/* Info Alert */}
          {!hasRequestedOtp && (
            <Alert
              message="Ready to Verify"
              description="Click 'Send OTP' to receive your verification code via email. The code will be valid for 10 minutes."
              type="info"
              showIcon
              icon={<MailOutlined />}
              style={{ marginBottom: 24 }}
            />
          )}

          {isOtpLocked && (
            <Alert
              message="Too Many Attempts"
              description="Please request a new OTP code to continue."
              type="warning"
              showIcon
              style={{ marginBottom: 24 }}
            />
          )}

          {/* OTP Form */}
          <Form
            name="verify-otp"
            form={otpForm}
            className="register-form"
            onFinish={onVerify}
            layout="vertical"
          >
            <Form.Item
              name="otp"
              label={<Text strong>Verification Code</Text>}
              rules={[
                {
                  required: true,
                  message: "Please enter the verification code",
                },
                { pattern: /^\d{6}$/, message: "Code must be 6 digits" },
              ]}
            >
              <Input
                prefix={<SafetyCertificateOutlined className="input-icon" />}
                placeholder="Enter 6-digit code"
                size="large"
                className="register-input"
                maxLength={6}
                style={{
                  fontSize: "18px",
                  letterSpacing: "4px",
                  textAlign: "center",
                }}
              />
            </Form.Item>

            {/* OTP Attempts Indicator */}
            {otpAttempts > 0 && !isOtpLocked && (
              <div style={{ marginBottom: 16, textAlign: "center" }}>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Attempts remaining: {MAX_OTP_ATTEMPTS - otpAttempts}
                </Text>
              </div>
            )}

            {/* Send/Resend OTP Button */}
            <Form.Item>
              <Button
                type={hasRequestedOtp ? "default" : "primary"}
                onClick={sendOtp}
                disabled={cooldown > 0 || isResending}
                loading={isResending}
                size="large"
                className={hasRequestedOtp ? "" : "register-submit-btn"}
                style={{
                  width: "100%",
                  marginBottom: 12,
                }}
                icon={cooldown > 0 ? <ClockCircleOutlined /> : <MailOutlined />}
              >
                {cooldown > 0
                  ? `Resend Code in ${cooldown}s`
                  : hasRequestedOtp
                    ? "Resend Verification Code"
                    : "Send Verification Code"}
              </Button>
            </Form.Item>

            {/* Verify Button */}
            <Form.Item className="submit-button-wrapper">
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                className="register-submit-btn"
                loading={isVerifying}
                disabled={isVerifying || isOtpLocked || !hasRequestedOtp}
                icon={<CheckCircleOutlined />}
              >
                {isVerifying
                  ? "Verifying..."
                  : "Verify & Complete Registration"}
              </Button>
            </Form.Item>
          </Form>

          {/* Help Section */}
          <div className="register-footer">
            <Divider className="footer-divider" />
            <div style={{ textAlign: "center" }}>
              <Space direction="vertical" size={8}>
                <Text className="footer-text">
                  Didn't receive the code? Check your spam folder or click
                  resend.
                </Text>
                <Text
                  className="footer-text"
                  type="secondary"
                  style={{ fontSize: 12 }}
                >
                  Need help? Contact{" "}
                  <a href="mailto:admin@juniorpass.sg">admin@juniorpass.sg</a>
                </Text>
              </Space>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
};

export default VerifyOTP;
