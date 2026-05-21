import { useState, useEffect } from "react";
import {
  Button,
  Card,
  Col,
  Empty,
  List,
  Row,
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
import { createFromIconfontCN } from "@ant-design/icons";
import { useUserContext } from "../UserContext";
import TopupModal from "./TopupModal";
import toast from "react-hot-toast";
import getBaseURL from "../../utils/config";
import "./Credits.css";

const { Text, Title } = Typography;

const IconFont = createFromIconfontCN({
  scriptUrl: ["//at.alicdn.com/t/c/font_4957401_wsnyu01fcm.js"],
});

const Credits = () => {
  const { user } = useUserContext();
  const baseURL = getBaseURL();
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState("all");

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const url = `${baseURL}/transactions/user`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTransactions(data.transactions || []);
      } else {
        setTransactions([]);
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
      toast.error("Failed to fetch transaction history");
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchTransactions();
    }
  }, [user]);

  const handleTopUp = () => {
    setIsTopUpModalOpen(true);
  };

  const calculateStats = () => {
    const totalSpent = transactions
      .filter((t) => t.transaction_type === "DEBIT")
      .reduce((sum, t) => sum + t.used_credit, 0);

    const totalRefunded = transactions
      .filter((t) => t.transaction_type === "CREDIT")
      .reduce((sum, t) => sum + t.used_credit, 0);

    const debitCount = transactions.filter(
      (t) => t.transaction_type === "DEBIT",
    ).length;
    const creditCount = transactions.filter(
      (t) => t.transaction_type === "CREDIT",
    ).length;

    return { totalSpent, totalRefunded, debitCount, creditCount };
  };

  const stats = calculateStats();

  const getFilteredTransactions = () => {
    if (filterType === "all") return transactions;
    if (filterType === "spent")
      return transactions.filter((t) => t.transaction_type === "DEBIT");
    if (filterType === "refunded")
      return transactions.filter((t) => t.transaction_type === "CREDIT");
    return transactions;
  };

  const filteredTransactions = getFilteredTransactions();

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Today, ${date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
    } else if (diffDays === 1) {
      return `Yesterday, ${date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
    } else if (diffDays < 7) {
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
  };

  const renderTransactionItem = (item) => {
    const isDebit = item.transaction_type === "DEBIT";

    return (
      <div className="transaction-item" key={item.transaction_id}>
        <div className="transaction-icon-wrapper">
          <div className={`transaction-icon ${isDebit ? "debit" : "credit"}`}>
            {isDebit ? <ShoppingCartOutlined /> : <GiftOutlined />}
          </div>
        </div>

        <div className="transaction-details">
          <div className="transaction-main">
            <Text strong className="transaction-title">
              {item.listing_title || "Transaction"}
            </Text>
            <Text
              className={`transaction-amount ${isDebit ? "debit" : "credit"}`}
            >
              {isDebit ? "-" : "+"}
              {item.used_credit}
            </Text>
          </div>

          <div className="transaction-meta">
            <Space size={4} wrap>
              {item.child_name && (
                <Tag icon={<UserOutlined />} className="meta-tag child-tag">
                  {item.child_name}
                </Tag>
              )}
              {item.partner_name && (
                <Tag className="meta-tag partner-tag">{item.partner_name}</Tag>
              )}
            </Space>
          </div>

          <div className="transaction-footer">
            <Text type="secondary" className="transaction-date">
              <CalendarOutlined style={{ marginRight: 4 }} />
              {formatDate(item.created_at)}
            </Text>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="credits-page">
      {/* Header Section */}
      <div className="credits-header">
        <div className="header-content">
          <Title level={3} className="page-title">
            <WalletOutlined /> My Credits
          </Title>
          <Text type="secondary" className="page-subtitle">
            Manage your credits and view transaction history
          </Text>
        </div>
      </div>

      {/* Credit Balance Hero Card */}
      <Card className="balance-card" bordered={false}>
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} md={14}>
            <div className="balance-content">
              <div className="balance-label">
                <WalletOutlined className="balance-icon" />
                <Text className="balance-text">Available Balance</Text>
              </div>
              <div className="balance-amount-wrapper">
                <span className="balance-amount">{user?.credit || 0}</span>
                <span className="balance-unit">credits</span>
              </div>
              <div className="balance-info">
                <Tooltip title="Credits can be used to book classes for your children">
                  <Text type="secondary">
                    <InfoCircleOutlined /> Use credits to book enrichment
                    classes
                  </Text>
                </Tooltip>
              </div>
            </div>
          </Col>
          <Col xs={24} md={10}>
            <div className="balance-actions">
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleTopUp}
                className="topup-button"
              >
                Top Up Credits
              </Button>
            </div>
          </Col>
        </Row>
      </Card>

      {/* Statistics Cards */}
      <Row gutter={[16, 16]} className="stats-row">
        <Col xs={12} sm={6}>
          <Card className="stat-card" bordered={false}>
            <div className="stat-icon spent">
              <ArrowUpOutlined />
            </div>
            <div className="stat-content">
              <Text className="stat-value">{stats.totalSpent}</Text>
              <Text type="secondary" className="stat-label">
                Total Spent
              </Text>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="stat-card" bordered={false}>
            <div className="stat-icon refunded">
              <ArrowDownOutlined />
            </div>
            <div className="stat-content">
              <Text className="stat-value">{stats.totalRefunded}</Text>
              <Text type="secondary" className="stat-label">
                Refunded
              </Text>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="stat-card" bordered={false}>
            <div className="stat-icon bookings">
              <ShoppingCartOutlined />
            </div>
            <div className="stat-content">
              <Text className="stat-value">{stats.debitCount}</Text>
              <Text type="secondary" className="stat-label">
                Bookings
              </Text>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="stat-card" bordered={false}>
            <div className="stat-icon total">
              <HistoryOutlined />
            </div>
            <div className="stat-content">
              <Text className="stat-value">{transactions.length}</Text>
              <Text type="secondary" className="stat-label">
                Transactions
              </Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Transaction History */}
      <Card className="transactions-card" bordered={false}>
        <div className="transactions-header">
          <div className="transactions-title">
            <HistoryOutlined />
            <Title level={5} style={{ margin: 0 }}>
              Transaction History
            </Title>
          </div>
          <Segmented
            value={filterType}
            onChange={setFilterType}
            options={[
              { label: `All (${transactions.length})`, value: "all" },
              { label: `Spent (${stats.debitCount})`, value: "spent" },
              { label: `Refunded (${stats.creditCount})`, value: "refunded" },
            ]}
            className="filter-segmented"
          />
        </div>

        <Spin spinning={loading}>
          {filteredTransactions.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <Space direction="vertical" size={8}>
                  <Text type="secondary">No transactions found</Text>
                  {filterType === "all" && (
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      Start by topping up your credits!
                    </Text>
                  )}
                </Space>
              }
              className="empty-state"
            >
              {filterType === "all" && (
                <Button
                  type="primary"
                  onClick={handleTopUp}
                  icon={<PlusOutlined />}
                >
                  Top Up Now
                </Button>
              )}
            </Empty>
          ) : (
            <div className="transactions-list">
              {filteredTransactions.map(renderTransactionItem)}
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
