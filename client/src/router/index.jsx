import { useState, useCallback, useRef } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useIdleTimer } from "react-idle-timer";
import { Modal, Button, Space, Typography } from "antd";
import { ClockCircleOutlined } from "@ant-design/icons";
import OverallLayout from "../layouts/Layout";
import Profile from "../components/Profile";
import HomePage from "../components/HomePage";
import Classes from "../components/Classes";
import Pricing from "../components/Pricing";
import Login from "../components/Login";
import Register from "../components/Register";
import VerifyOTP from "../components/VerifyOTP";
import { useUserContext } from "../components/UserContext";
import Class from "../components/Classes/Class";
import AuthenticatedRoute from "./AuthenticatedRoute";
import toast from "react-hot-toast";
import ContactUs from "../components/ContactUs";
import AboutUs from "../components/AboutUs";
import Partner from "../components/Partner";
import PackageTypes from "../components/PackageTypes";
import { fetchWithAuth, API_ENDPOINTS } from "../utils/api";

import "mapbox-gl/dist/mapbox-gl.css";
import "./index.css";
import ForgotPassword from "../components/ForgotPassword";
import ResetPassword from "../components/ResetPassword";

const { Title, Text } = Typography;

const Routers = () => {
  const navigate = useNavigate();
  const { isAuthenticated, setLoading, setAuth } = useUserContext();
  const [isTimeoutModalOpen, setIsTimeoutModalOpen] = useState(false);
  const [isRenewingSession, setIsRenewingSession] = useState(false);
  const sessionRenewalLockRef = useRef(false);

  const handleLogout = useCallback(async () => {
    try {
      await fetchWithAuth(API_ENDPOINTS.LOGOUT, {
        method: "POST",
      });
    } catch (e) {
      console.error("Logout error:", e);
    }
    setAuth(false);
    setLoading(false);
    setIsTimeoutModalOpen(false);
    toast.success("You have been logged out due to inactivity");
    navigate("/login");
  }, [navigate, setAuth, setLoading]);

  const handleOnIdle = useCallback(() => {
    if (isAuthenticated) {
      setIsTimeoutModalOpen(true);
    }
  }, [isAuthenticated]);

  const { activate } = useIdleTimer({
    timeout: 720000, // 12 minutes of inactivity
    onIdle: handleOnIdle,
    debounce: 500,
  });

  const handleStayLoggedIn = useCallback(async () => {
    if (sessionRenewalLockRef.current) return;
    sessionRenewalLockRef.current = true;
    setIsRenewingSession(true);

    try {
      const response = await fetchWithAuth(API_ENDPOINTS.REFRESH_SESSION, {
        method: "POST",
      });

      if (!response.ok) {
        setAuth(false);
        setLoading(false);
        setIsTimeoutModalOpen(false);
        toast.error("Your session has expired. Please log in again.");
        navigate("/login");
        return;
      }

      setIsTimeoutModalOpen(false);
      activate?.();
      toast.success("Your session has been renewed");
    } catch (error) {
      console.error("Session renewal error:", error);
      setAuth(false);
      setLoading(false);
      setIsTimeoutModalOpen(false);
      toast.error("Unable to renew your session. Please log in again.");
      navigate("/login");
    } finally {
      sessionRenewalLockRef.current = false;
      setIsRenewingSession(false);
    }
  }, [activate, navigate, setAuth, setLoading]);

  return (
    <div className="App">
      {/* Session Timeout Modal */}
      <Modal
        open={isTimeoutModalOpen}
        onCancel={handleStayLoggedIn}
        footer={null}
        centered
        closable={false}
        maskClosable={false}
        width={420}
        className="session-timeout-modal"
      >
        <div className="session-timeout-content">
          <div className="session-timeout-icon">
            <ClockCircleOutlined />
          </div>

          <Title level={3} className="session-timeout-title">
            Session Timeout
          </Title>
          <Text className="session-timeout-text">
            You've been inactive for a while. Would you like to stay logged in?
          </Text>

          <Space
            direction="vertical"
            size={12}
            className="session-timeout-actions"
          >
            <Button
              type="primary"
              size="large"
              block
              onClick={handleStayLoggedIn}
              loading={isRenewingSession}
              disabled={isRenewingSession}
              className="session-timeout-btn session-timeout-btn-primary"
            >
              Stay Logged In
            </Button>
            <Button
              size="large"
              block
              onClick={handleLogout}
              className="session-timeout-btn"
            >
              Logout
            </Button>
          </Space>
        </div>
      </Modal>

      <Routes>
        <Route path="/" element={<HomePage />} />

        <Route element={<OverallLayout />}>
          <Route path="/classes" element={<Classes />} />
          <Route path="/class/:classId" element={<Class />} />
          <Route path="/partner/:partnerId" element={<Partner />} />
          <Route path="/package-types" element={<PackageTypes />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/about-us" element={<AboutUs />} />
          <Route path="/partner-contact" element={<ContactUs />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/login"
            element={
              !isAuthenticated ? (
                <Login />
              ) : (
                <Navigate replace to="/profile" state={"account"} />
              )
            }
          ></Route>
          <Route
            path="/register"
            element={
              !isAuthenticated ? (
                <Register />
              ) : (
                <Navigate replace to="/profile" state={"account"} />
              )
            }
          ></Route>
          <Route path="/verify-otp" element={<VerifyOTP />} />

          <Route element={<AuthenticatedRoute />}>
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Route>
      </Routes>
    </div>
  );
};

export default Routers;
