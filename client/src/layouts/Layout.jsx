import { useState } from "react";
import {
  Layout,
  Menu,
  ConfigProvider,
  Image,
  Drawer,
  Typography,
  Space,
} from "antd";
import { Outlet, Link, useNavigate } from "react-router-dom";
import { MenuOutlined, createFromIconfontCN } from "@ant-design/icons";
import "./Layout.css";
import Footer from "./Footer";
import { Toaster } from "react-hot-toast";
import { useUserContext } from "../components/UserContext";
import { googleLogout } from "@react-oauth/google";
import toast from "react-hot-toast";
import logo from "../images/logopngResize.png";
import { fetchWithAuth, API_ENDPOINTS } from "../utils/api";

const { Header, Content } = Layout;
const { Text } = Typography;
const IconFont = createFromIconfontCN({
  scriptUrl: ["//at.alicdn.com/t/c/font_4957401_wsnyu01fcm.js"],
});

const OverallLayout = () => {
  const isProduction = import.meta.env.VITE_NODE_ENV === "production";
  const [drawerVisible, setDrawerVisible] = useState(false);
  const { user, isAuthenticated, setAuth, setLoading } = useUserContext();
  const navigate = useNavigate();

  const showDrawer = () => {
    setDrawerVisible(true);
  };

  const closeDrawer = () => {
    setDrawerVisible(false);
  };

  const handleLogout = async () => {
    try {
      await fetchWithAuth(API_ENDPOINTS.LOGOUT, { method: "POST" });
    } catch (error) {
      console.error("Logout error:", error);
    }
    setAuth(false);
    setLoading(false);
    googleLogout();
    toast.success("Logout successfully");
    navigate("/login");
  };

  return (
    <ConfigProvider
      theme={{
        token: {
          // Seed Token
          borderRadius: 2,
          colorPrimary: "#98BDD2",
          colorPrimaryActive: "#98BDD2",

          // Alias Token
          colorBgContainer: "#FCFBF8",
          fontSize: 14,
          colorLink: "black",
          fontFamily: "Poppins, sans-serif",
        },
        components: {
          Layout: {
            headerBg: "#FCFBF8",
            bodyBg: "#FCFBF8",
            headerHeight: 84,
          },
          Menu: {
            horizontalItemSelectedColor: "#98BDD2",
          },
          Tabs: {
            itemActiveColor: "#98BDD2",
            itemHoverColor: "#98BDD2",
            itemSelectedColor: "#98BDD2",
            inkBarColor: "#98BDD2",
          },
        },
      }}
    >
      <Layout>
        <Header className="layout-header">
          <Link to={"/"}>
            <Image
              className="logo-homepage"
              alt="logo"
              src={logo}
              preview={false}
            />
          </Link>

          {/* Hamburger menu (visible on mobile) */}
          <div className="hamburger-menu" onClick={showDrawer}>
            <MenuOutlined style={{ fontSize: "24px" }} />
          </div>

          {/* Drawer (Hamburger menu for mobile) */}
          <Drawer
            placement="right"
            onClose={closeDrawer}
            open={drawerVisible}
            width="100%"
            className="homepage-drawer"
            zIndex={1050}
            styles={{
              mask: { zIndex: 1040 },
              wrapper: { zIndex: 1050 },
            }}
          >
            <Menu
              mode="vertical"
              onClick={closeDrawer}
              className="homepage-drawer__menu"
            >
              {!isProduction && (
                <Menu.Item key="classes">
                  <Link to="/classes" style={{ fontWeight: "600" }}>
                    Browse our classes
                  </Link>
                </Menu.Item>
              )}
              <Menu.Item key="package-types">
                <Link to="/package-types" style={{ fontWeight: "600" }}>
                  Package Types
                </Link>
              </Menu.Item>
              <Menu.Item key="plan">
                <Link to="/pricing" style={{ fontWeight: "600" }}>
                  Credits
                </Link>
              </Menu.Item>
              {isAuthenticated ? (
                <>
                  <Menu.Item key="profile">
                    <Link to="/profile" style={{ fontWeight: "600" }}>
                      Profile
                    </Link>
                  </Menu.Item>
                  <Menu.Item key="credit">
                    <Link
                      to="/profile"
                      state="credit"
                      style={{ fontWeight: "600" }}
                    >
                      Credits: {user?.credit}
                    </Link>
                  </Menu.Item>
                  <Menu.Item key="logout" onClick={handleLogout}>
                    <span style={{ fontWeight: "600" }}>Logout</span>
                  </Menu.Item>
                </>
              ) : (
                <>
                  {!isProduction && (
                    <Menu.Item key="login">
                      <Link to="/login" style={{ fontWeight: "600" }}>
                        Login/Register
                      </Link>
                    </Menu.Item>
                  )}
                </>
              )}
            </Menu>
          </Drawer>

          <Menu mode="horizontal" className="desktop-menu">
            {!isProduction && (
              <Menu.Item key="classes">
                <Link to="/classes">Browse Classes</Link>
              </Menu.Item>
            )}
            <Menu.Item key="package-types">
              <Link to="/package-types">Package Types</Link>
            </Menu.Item>
            <Menu.Item key="plan">
              <Link to="/pricing">Credits</Link>
            </Menu.Item>
            {isAuthenticated ? (
              <>
                <Menu.Item
                  key="credit"
                  onClick={() => navigate("/profile", { state: "credit" })}
                  className="credit-menu-item"
                >
                  <Space size={4}>
                    <IconFont type="icon-money" style={{ fontSize: "16px" }} />
                    <Text strong>{user?.credit}</Text>
                  </Space>
                </Menu.Item>
                <Menu.Item key="notification" className="icon-menu-item">
                  <IconFont
                    type="icon-notification"
                    style={{ fontSize: "18px" }}
                  />
                </Menu.Item>
                <Menu.Item
                  key="logout"
                  onClick={handleLogout}
                  className="icon-menu-item"
                >
                  <IconFont
                    type="icon-signout-1"
                    style={{ fontSize: "18px" }}
                  />
                </Menu.Item>
              </>
            ) : (
              <>
                {!isProduction && (
                  <Menu.Item key="login">
                    <Link to="/login">Login/Register</Link>
                  </Menu.Item>
                )}
              </>
            )}
          </Menu>
        </Header>
        <Content className="layout-content">
          <Toaster />
          <Outlet />
        </Content>
      </Layout>
      <Footer />
    </ConfigProvider>
  );
};

export default OverallLayout;
