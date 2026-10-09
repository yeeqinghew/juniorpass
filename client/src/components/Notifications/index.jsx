import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Pagination,
  Skeleton,
  Typography,
} from "antd";
import {
  BellOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  GiftOutlined,
  RightOutlined,
  TeamOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { API_ENDPOINTS, fetchWithAuth } from "../../utils/api";
import { AUTH_ROLES } from "../../constants/auth";
import "./index.css";

const { Text, Title } = Typography;
const PAGE_SIZE = 10;

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
};

const getNotificationPresentation = (type) => {
  switch (type) {
    case "booking":
      return {
        icon: <CheckCircleOutlined />,
        actionLabel: "View booking",
        destination: "children-classes",
      };
    case "cancellation":
    case "class_cancelled":
      return {
        icon: <CloseCircleOutlined />,
        actionLabel: "View classes",
        destination: "children-classes",
      };
    case "class_rescheduled":
    case "makeup_class":
      return {
        icon: <CalendarOutlined />,
        actionLabel: "View schedule",
        destination: "children-classes",
      };
    case "attendance":
      return {
        icon: <TeamOutlined />,
        actionLabel: "View attendance",
        destination: "children-classes",
      };
    case "class_reminder":
      return {
        icon: <ClockCircleOutlined />,
        actionLabel: "View booking",
        destination: "children-classes",
      };
    case "payment_completed":
      return {
        icon: <WalletOutlined />,
        actionLabel: "View credits",
        destination: "credit",
      };
    case "referral_completed":
    case "referral_bonus":
      return {
        icon: <GiftOutlined />,
        actionLabel: "View referrals",
        destination: "referral",
      };
    default:
      return { icon: <BellOutlined />, actionLabel: "", destination: "" };
  }
};

const Notifications = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [total, setTotal] = useState(0);
  const [allTotal, setAllTotal] = useState(0);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchWithAuth(
        `${API_ENDPOINTS.GET_NOTIFICATIONS}?type=${AUTH_ROLES.USER}&page=${page}&limit=${PAGE_SIZE}&unread=${filter === "unread"}`,
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to load notifications");
      }
      setNotifications(Array.isArray(data.data) ? data.data : []);
      setTotal(Number(data.total || 0));
      setAllTotal(Number(data.all_total || 0));
      setUnreadTotal(Number(data.unread_total || 0));
    } catch (requestError) {
      setError(requestError.message || "Unable to load notifications");
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    const requestId = window.setTimeout(loadNotifications, 0);
    return () => window.clearTimeout(requestId);
  }, [loadNotifications]);

  const markAsRead = async (notification) => {
    if (!notification.is_read) {
      try {
        const response = await fetchWithAuth(
          API_ENDPOINTS.MARK_NOTIFICATION_READ(notification.notification_id),
          {
            method: "PATCH",
            body: JSON.stringify({ type: AUTH_ROLES.USER }),
          },
        );
        if (!response.ok) throw new Error("Unable to mark notification as read");

        if (filter === "unread") {
          setNotifications((items) =>
            items.filter(
              (item) => item.notification_id !== notification.notification_id,
            ),
          );
          setTotal((current) => Math.max(0, current - 1));
        } else {
          setNotifications((items) =>
            items.map((item) =>
              item.notification_id === notification.notification_id
                ? { ...item, is_read: true }
                : item,
            ),
          );
        }
        setUnreadTotal((current) => Math.max(0, current - 1));
        window.dispatchEvent(new CustomEvent("notifications:updated"));
      } catch (requestError) {
        setError(requestError.message || "Unable to update notification");
      }
    }

    const presentation = getNotificationPresentation(notification.type);
    if (presentation.destination) {
      navigate("/profile", { state: presentation.destination });
    }
  };

  const markAllAsRead = async () => {
    setMarkingAll(true);
    try {
      const response = await fetchWithAuth(
        API_ENDPOINTS.MARK_ALL_NOTIFICATIONS_READ,
        {
          method: "PATCH",
          body: JSON.stringify({ type: AUTH_ROLES.USER }),
        },
      );
      if (!response.ok) throw new Error("Unable to update notifications");
      if (filter === "unread") {
        setNotifications([]);
        setTotal(0);
      } else {
        setNotifications((items) =>
          items.map((item) => ({ ...item, is_read: true })),
        );
      }
      setUnreadTotal(0);
      window.dispatchEvent(new CustomEvent("notifications:updated"));
    } catch (requestError) {
      setError(requestError.message || "Unable to update notifications");
    } finally {
      setMarkingAll(false);
    }
  };

  const changeFilter = (nextFilter) => {
    setFilter(nextFilter);
    setPage(1);
  };

  return (
    <main className="notifications-page">
      <header className="notifications-header">
        <div>
          <span className="notifications-kicker">Updates</span>
          <Title level={1}>Notifications</Title>
          <Text>Booking updates, class reminders and account activity.</Text>
        </div>
        <Button
          icon={<CheckOutlined />}
          disabled={unreadTotal === 0}
          loading={markingAll}
          onClick={markAllAsRead}
        >
          Mark all as read
        </Button>
      </header>

      <div className="notifications-toolbar">
        <nav className="notifications-tabs" aria-label="Notification filters">
          <button
            type="button"
            className={filter === "all" ? "is-active" : ""}
            aria-pressed={filter === "all"}
            onClick={() => changeFilter("all")}
          >
            All <span>{allTotal}</span>
          </button>
          <button
            type="button"
            className={filter === "unread" ? "is-active" : ""}
            aria-pressed={filter === "unread"}
            onClick={() => changeFilter("unread")}
          >
            Unread <span>{unreadTotal}</span>
          </button>
        </nav>
        <Text>
          {unreadTotal === 0
            ? "You’re all caught up"
            : `${unreadTotal} unread notification${unreadTotal === 1 ? "" : "s"}`}
        </Text>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          message="Notifications could not be loaded"
          description={error}
          action={<Button onClick={loadNotifications}>Try again</Button>}
        />
      )}

      <section className="notifications-panel" aria-live="polite">
        {loading ? (
          <Skeleton active paragraph={{ rows: 5 }} />
        ) : notifications.length === 0 ? (
          <Empty description="You do not have any notifications yet" />
        ) : (
          <div className="notifications-list">
            {notifications.map((notification) => {
              const presentation = getNotificationPresentation(
                notification.type,
              );

              return (
                <button
                  type="button"
                  className={`notification-card ${notification.is_read ? "is-read" : "is-unread"}`}
                  key={notification.notification_id}
                  onClick={() => markAsRead(notification)}
                >
                  <span className="notification-card-icon">
                    {presentation.icon}
                  </span>
                  <span className="notification-card-copy">
                    <strong>{notification.title}</strong>
                    <span>{notification.message}</span>
                    <small>
                      <CalendarOutlined /> {formatDate(notification.created_at)}
                    </small>
                  </span>
                  <span className="notification-card-status">
                    {!notification.is_read && (
                      <span
                        className="notification-unread-dot"
                        aria-label="Unread"
                      />
                    )}
                    {presentation.actionLabel && (
                      <span className="notification-card-action">
                        {presentation.actionLabel} <RightOutlined />
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {total > PAGE_SIZE && (
          <Pagination
            current={page}
            pageSize={PAGE_SIZE}
            total={total}
            showSizeChanger={false}
            onChange={setPage}
          />
        )}
      </section>
    </main>
  );
};

export default Notifications;
