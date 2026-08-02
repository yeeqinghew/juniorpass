import { useEffect, useState } from "react";
import { Avatar, Tabs, Tooltip } from "antd";
import Account from "./Account";
import Credits from "./Credits";
import ChildrenClasses from "./ChildrenClasses";
import Referrals from "./Referrals";
import { useLocation, useNavigate } from "react-router-dom";
import { useUserContext } from "../UserContext";
import {
  UserOutlined,
  TeamOutlined,
  CreditCardOutlined,
  GiftOutlined,
} from "@ant-design/icons";
import useWindowDimensions from "../../hooks/useWindowDimensions";
import "./index.css";

const Profile = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = location;
  const { user } = useUserContext();
  const initialTab = typeof state === "string" ? state : state?.activeTab;
  const openTopUpOnMount =
    typeof state === "object" && state?.openTopUp === true;
  const [activeTab, setActiveTab] = useState(initialTab || "account");

  useEffect(() => {
    if (!openTopUpOnMount) return;

    navigate(location.pathname, {
      replace: true,
      state: { activeTab: initialTab || "credit" },
    });
  }, [initialTab, location.pathname, navigate, openTopUpOnMount]);

  const { isMobile, isTabletPortrait } = useWindowDimensions();
  const isMobileOrTabletPortrait = isMobile || isTabletPortrait;

  const items = [
    {
      label: isMobileOrTabletPortrait ? (
        <Tooltip title="Account">
          <UserOutlined />
        </Tooltip>
      ) : (
        "Account"
      ),
      key: "account",
      children: (
        <div className="profile-tab-content">
          <Account />
        </div>
      ),
    },
    {
      label: isMobileOrTabletPortrait ? (
        <Tooltip title="Children & Classes">
          <TeamOutlined />
        </Tooltip>
      ) : (
        "Children & Classes"
      ),
      key: "children-classes",
      children: (
        <div className="profile-tab-content">
          <ChildrenClasses />
        </div>
      ),
    },
    {
      label: isMobileOrTabletPortrait ? (
        <Tooltip title="Credit">
          <CreditCardOutlined />
        </Tooltip>
      ) : (
        "Credit"
      ),
      key: "credit",
      children: (
        <div className="profile-tab-content">
          <Credits openTopUpOnMount={openTopUpOnMount} />
        </div>
      ),
    },
    {
      label: isMobileOrTabletPortrait ? (
        <Tooltip title="Referral">
          <GiftOutlined />
        </Tooltip>
      ) : (
        "Referral"
      ),
      key: "referral",
      children: (
        <div className="profile-tab-content">
          <Referrals />
        </div>
      ),
    },
  ];

  const avatarSection = (
    <div className="profile-avatar-container">
      <Avatar
        size={isMobileOrTabletPortrait ? 64 : 80}
        src={user?.display_picture}
        alt={user?.name}
        className="profile-avatar"
      />
      {user?.name && <div className="profile-user-name">{user.name}</div>}
      {user?.email && <div className="profile-user-email">{user.email}</div>}
    </div>
  );

  return (
    <div className="profile-container">
      {isMobileOrTabletPortrait ? (
        <>
          {avatarSection}

          <div className="profile-tabs mobile">
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              tabPosition="top"
              items={items}
              tabBarGutter={0}
              size="small"
            />
          </div>
        </>
      ) : (
        <div className="profile-desktop-layout">
          <aside className="profile-sidebar">
            {avatarSection}

            <div className="profile-sidebar-menu">
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`profile-menu-item ${
                    activeTab === item.key ? "active" : ""
                  }`}
                  onClick={() => setActiveTab(item.key)}
                >
                  {item.key === "account" && <UserOutlined />}
                  {item.key === "children-classes" && <TeamOutlined />}
                  {item.key === "credit" && <CreditCardOutlined />}
                  {item.key === "referral" && <GiftOutlined />}

                  <span>
                    {item.key === "account" && "Account"}
                    {item.key === "children-classes" && "Children & Classes"}
                    {item.key === "credit" && "Credit"}
                    {item.key === "referral" && "Referral"}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <main className="profile-main-content">
            {activeTab === "account" && <Account />}
            {activeTab === "children-classes" && <ChildrenClasses />}
            {activeTab === "credit" && (
              <Credits openTopUpOnMount={openTopUpOnMount} />
            )}
            {activeTab === "referral" && <Referrals />}
          </main>
        </div>
      )}
    </div>
  );
};

export default Profile;
