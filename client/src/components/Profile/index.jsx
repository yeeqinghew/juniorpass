import { Avatar, Tabs } from "antd";
import Account from "./Account";
import Credits from "./Credits";
import ChildrenClasses from "./ChildrenClasses";
import Referrals from "./Referrals";
import { useLocation } from "react-router-dom";
import { useUserContext } from "../UserContext";
import useWindowDimensions from "../../hooks/useWindowDimensions";
import "./index.css";

const Profile = () => {
  const { state } = useLocation();
  const { user } = useUserContext();
  const { isMobile, isTabletPortrait } = useWindowDimensions();
  const isMobileOrTabletPortrait = isMobile || isTabletPortrait;

  const items = [
    {
      label: "Account",
      key: "account",
      children: (
        <div className="profile-tab-content">
          <Account />
        </div>
      ),
    },
    {
      label: "Children & Classes",
      key: "children-classes",
      children: (
        <div className="profile-tab-content">
          <ChildrenClasses />
        </div>
      ),
    },
    {
      label: "Credit",
      key: "credit",
      children: (
        <div className="profile-tab-content">
          <Credits />
        </div>
      ),
    },
    {
      label: "Referral",
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
      {isMobileOrTabletPortrait && avatarSection}
      <div className="profile-tabs">
        <Tabs
          defaultActiveKey={state || "account"}
          tabPosition={isMobileOrTabletPortrait ? "top" : "left"}
          tabBarExtraContent={
            isMobileOrTabletPortrait ? null : { top: avatarSection }
          }
          items={items}
          tabBarGutter={isMobileOrTabletPortrait ? 0 : 12}
          size={isMobileOrTabletPortrait ? "small" : "middle"}
        />
      </div>
    </div>
  );
};

export default Profile;
