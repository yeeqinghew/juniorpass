import { useState, useEffect } from "react";
import {
  Button,
  Card,
  Empty,
  Space,
  Spin,
  Tag,
  Typography,
  Segmented,
  Tooltip,
} from "antd";
import {
  PlusOutlined,
  WalletOutlined,
  HistoryOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  GiftOutlined,
  ShoppingCartOutlined,
  CalendarOutlined,
  UserOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import { useUserContext } from "../UserContext";
import TopupModal from "./TopupModal";
import toast from "react-hot-toast";
import { fetchWithAuth, API_ENDPOINTS } from "../../utils/api";
import "./Credits.css";

const { Text, Title } = Typography;

const Credits = () => {
  const { user } = useUserContext();
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState("all");

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(API_ENDPOINTS.GET_TRANSACTIONS, { 
        method: "GET",
      });
      const data = res.ok ? await res.json() : null;
      setTransactions(data?.transactions || []);
    } catch {
      toast.error("Failed to fetch transaction history");
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchTransactions();
  }, [user]);

  const calculateStats = () => {
    const totalSpent = transactions
      .filter((t) => t.transaction_type === "DEBIT")
      .reduce((s, t) => s + t.used_credit, 0);
    const totalRefunded = transactions
      .filter((t) => t.transaction_type === "CREDIT")
      .reduce((s, t) => s + t.used_credit, 0);
    const debitCount = transactions.filter(
      (t) => t.transaction_type === "DEBIT",
    ).length;
    const creditCount = transactions.filter(
      (t) => t.transaction_type === "CREDIT",
    ).length;
    return { totalSpent, totalRefunded, debitCount, creditCount };
  };
  const stats = calculateStats();

  const filteredTransactions =
    filterType === "spent"
      ? transactions.filter((t) => t.transaction_type === "DEBIT")
      : filterType === "refunded"
        ? transactions.filter((t) => t.transaction_type === "CREDIT")
        : transactions;

  const formatDate = (s) => {
    const date = new Date(s),
      now = new Date();
    const days = Math.floor(Math.abs(now - date) / (1000 * 60 * 60 * 24));
    if (days === 0)
      return `Today, ${date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
    if (days === 1)
      return `Yesterday, ${date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
    if (days < 7)
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const renderTxn = (item) => {
    const isDebit = item.transaction_type === "DEBIT";
    return (
      <div className="cr-txn-item" key={item.transaction_id}>
        <div className={`cr-txn-icon ${isDebit ? "debit" : "credit"}`}>
          {isDebit ? <ShoppingCartOutlined /> : <GiftOutlined />}
        </div>
        <div className="cr-txn-details">
          <div className="cr-txn-row">
            <span className="cr-txn-name">
              {item.listing_title || "Transaction"}
            </span>
            <span className={`cr-txn-amount ${isDebit ? "debit" : "credit"}`}>
              {isDebit ? "−" : "+"}
              {item.used_credit}
            </span>
          </div>
          <div className="cr-txn-tags">
            {item.child_name && (
              <Tag icon={<UserOutlined />} className="cr-tag child-tag">
                {item.child_name}
              </Tag>
            )}
            {item.partner_name && (
              <Tag className="cr-tag partner-tag">{item.partner_name}</Tag>
            )}
          </div>
          <span className="cr-txn-date">
            <CalendarOutlined /> {formatDate(item.created_at)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="cr-page fade-in">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Title level={3} className="cr-page-title">
          <WalletOutlined /> My Credits
        </Title>
        <Text className="cr-page-sub">
          Manage your credits and view transaction history
        </Text>
      </div>

      {/* ── Balance hero — plain flex, NO Row/Col ── */}
      <Card className="cr-balance-card" bordered={false}>
        <div className="cr-balance-inner">
          <div className="cr-balance-left">
            <div className="cr-balance-eyebrow">
              <WalletOutlined /> Available Balance
            </div>
            <div className="cr-balance-amount-row">
              <span className="cr-balance-number">{user?.credit || 0}</span>
              <span className="cr-balance-unit">credits</span>
            </div>
            <Tooltip title="Credits can be used to book classes for your children">
              <span className="cr-balance-hint">
                <InfoCircleOutlined /> Use credits to book enrichment classes
              </span>
            </Tooltip>
          </div>
          <div className="cr-balance-right">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setIsTopUpModalOpen(true)}
              className="cr-topup-btn"
            >
              Top Up Credits
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Stats — CSS grid, NO Row/Col ── */}
      <div className="cr-stats-grid">
        <div className="cr-stat-card">
          <div className="cr-stat-icon error">
            <ArrowUpOutlined />
          </div>
          <div>
            <span className="cr-stat-value">{stats.totalSpent}</span>
            <span className="cr-stat-label">Total Spent</span>
          </div>
        </div>
        <div className="cr-stat-card">
          <div className="cr-stat-icon success">
            <ArrowDownOutlined />
          </div>
          <div>
            <span className="cr-stat-value">{stats.totalRefunded}</span>
            <span className="cr-stat-label">Refunded</span>
          </div>
        </div>
        <div className="cr-stat-card">
          <div className="cr-stat-icon primary">
            <ShoppingCartOutlined />
          </div>
          <div>
            <span className="cr-stat-value">{stats.debitCount}</span>
            <span className="cr-stat-label">Bookings</span>
          </div>
        </div>
        <div className="cr-stat-card">
          <div className="cr-stat-icon muted">
            <HistoryOutlined />
          </div>
          <div>
            <span className="cr-stat-value">{transactions.length}</span>
            <span className="cr-stat-label">Transactions</span>
          </div>
        </div>
      </div>

      {/* ── Transaction history ── */}
      <Card className="cr-txn-card" bordered={false}>
        <div className="cr-txn-head">
          <Title level={5} className="cr-txn-title">
            <HistoryOutlined /> Transaction History
          </Title>
          <div className="cr-filter">
            <Segmented
              value={filterType}
              onChange={setFilterType}
              options={[
                { label: `All (${transactions.length})`, value: "all" },
                { label: `Spent (${stats.debitCount})`, value: "spent" },
                { label: `Refunded (${stats.creditCount})`, value: "refunded" },
              ]}
            />
          </div>
        </div>

        <Spin spinning={loading}>
          {filteredTransactions.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <Space direction="vertical" size={6}>
                  <Text type="secondary">No transactions found</Text>
                  {filterType === "all" && (
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      Start by topping up your credits!
                    </Text>
                  )}
                </Space>
              }
              style={{ padding: "40px 0" }}
            >
              {filterType === "all" && (
                <Button
                  type="primary"
                  onClick={() => setIsTopUpModalOpen(true)}
                  icon={<PlusOutlined />}
                >
                  Top Up Now
                </Button>
              )}
            </Empty>
          ) : (
            <div className="cr-txn-list">
              {filteredTransactions.map(renderTxn)}
            </div>
          )}
        </Spin>
      </Card>

      <TopupModal
        isTopUpModalOpen={isTopUpModalOpen}
        setIsTopUpModalOpen={setIsTopUpModalOpen}
        onSuccess={fetchTransactions}
      />
    </div>
  );
};

export default Credits;
