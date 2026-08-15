import { useCallback, useEffect, useState } from "react";
import { Button, Pagination, Spin, Tag, Typography } from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CalendarOutlined,
  GiftOutlined,
  HistoryOutlined,
  PlusOutlined,
  ShoppingCartOutlined,
  UserOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import toast from "react-hot-toast";
import { useUserContext } from "../UserContext";
import useWindowDimensions from "../../hooks/useWindowDimensions";
import { fetchWithAuth, API_ENDPOINTS } from "../../utils/api";
import TopupModal from "./TopupModal";
import "./Credits.css";

const { Title } = Typography;

const Credits = ({ openTopUpOnMount = false }) => {
  const { user } = useUserContext();
  const { isMobile, isTabletPortrait } = useWindowDimensions();
  const isMobileOrTabletPortrait = isMobile || isTabletPortrait;
  const balance = user?.credit ?? 0;
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(openTopUpOnMount);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(isMobileOrTabletPortrait ? 5 : 10);

  const fetchTransactions = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    const requestId = window.setTimeout(fetchTransactions, 0);
    return () => window.clearTimeout(requestId);
  }, [fetchTransactions, user]);

  const totalSpent = transactions
    .filter((transaction) => transaction.transaction_type === "DEBIT")
    .reduce(
      (sum, transaction) => sum + (Number(transaction.used_credit) || 0),
      0,
    );
  const totalAdded = transactions
    .filter((transaction) => transaction.transaction_type === "CREDIT")
    .reduce(
      (sum, transaction) => sum + (Number(transaction.used_credit) || 0),
      0,
    );
  const debitCount = transactions.filter(
    (transaction) => transaction.transaction_type === "DEBIT",
  ).length;
  const creditCount = transactions.filter(
    (transaction) => transaction.transaction_type === "CREDIT",
  ).length;

  const filteredTransactions =
    filterType === "spent"
      ? transactions.filter(
          (transaction) => transaction.transaction_type === "DEBIT",
        )
      : filterType === "added"
        ? transactions.filter(
            (transaction) => transaction.transaction_type === "CREDIT",
          )
        : transactions;

  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const statItems = [
    {
      key: "spent",
      icon: <ArrowUpOutlined />,
      value: totalSpent,
      label: "Credits spent",
      color: "spent",
    },
    {
      key: "added",
      icon: <ArrowDownOutlined />,
      value: totalAdded,
      label: "Credits added",
      color: "added",
    },
    {
      key: "bookings",
      icon: <ShoppingCartOutlined />,
      value: debitCount,
      label: "Class bookings",
      color: "primary",
    },
    {
      key: "transactions",
      icon: <HistoryOutlined />,
      value: transactions.length,
      label: "Transactions",
      color: "reward",
    },
  ];

  const handleFilterChange = (value) => {
    setFilterType(value);
    setCurrentPage(1);
  };

  const formatDate = (value) => {
    const date = new Date(value);
    const now = new Date();
    const days = Math.floor(Math.abs(now - date) / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return `Today, ${date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }

    if (days === 1) {
      return `Yesterday, ${date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }

    if (days < 7) {
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const renderTransaction = (item) => {
    const isDebit = item.transaction_type === "DEBIT";
    const displayTitle =
      item.listing_title || (isDebit ? "Class booking" : "Credits added");

    return (
      <article className="cr-txn-item" key={item.transaction_id}>
        <span className={`cr-txn-icon ${isDebit ? "debit" : "credit"}`}>
          {isDebit ? <ShoppingCartOutlined /> : <GiftOutlined />}
        </span>
        <div className="cr-txn-details">
          <div className="cr-txn-row">
            <span className="cr-txn-name">{displayTitle}</span>
            <strong className={`cr-txn-amount ${isDebit ? "debit" : "credit"}`}>
              {isDebit ? "−" : "+"}
              {item.used_credit}
            </strong>
          </div>
          {(item.child_name || item.partner_name) && (
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
          )}
          <span className="cr-txn-date">
            <CalendarOutlined /> {formatDate(item.created_at)}
          </span>
        </div>
      </article>
    );
  };

  return (
    <div className="cr-page fade-in">
      <div className="cr-page-header">
        <Title level={3} className="cr-page-title">
          <WalletOutlined /> My Credits
        </Title>
      </div>

      <section className="cr-balance-summary">
        <div className="cr-balance-overview">
          <span className="cr-balance-icon">
            <WalletOutlined />
          </span>
          <div>
            <div className="cr-balance-label">Available balance</div>
            <div className="cr-balance-amount-row">
              <strong className="cr-balance-number">{balance}</strong>
              <span className="cr-balance-unit">credits</span>
            </div>
          </div>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setIsTopUpModalOpen(true)}
          className="profile-action-btn cr-topup-btn"
        >
          Top up credits
        </Button>
      </section>

      <div className="cr-stats-grid">
        {statItems.map((item) => (
          <div className="cr-stat-card" key={item.key}>
            <div className={`cr-stat-icon ${item.color}`}>{item.icon}</div>
            <div>
              <span className="cr-stat-value">{item.value}</span>
              <span className="cr-stat-label">{item.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="cr-content-grid">
        <section className="cr-panel cr-transactions-panel">
          <div className="cr-panel-header">
            <div>
              <span className="cr-panel-eyebrow">Wallet activity</span>
              <h4>Transaction history</h4>
            </div>
            <span className="cr-count-pill">{transactions.length} total</span>
          </div>

          <div className="cr-filter" role="tablist" aria-label="Transactions">
            {[
              { label: "All", value: "all", count: transactions.length },
              { label: "Spent", value: "spent", count: debitCount },
              { label: "Added", value: "added", count: creditCount },
            ].map((option) => (
              <button
                type="button"
                role="tab"
                aria-selected={filterType === option.value}
                className={`cr-filter-tab ${
                  filterType === option.value ? "active" : ""
                }`}
                key={option.value}
                onClick={() => handleFilterChange(option.value)}
              >
                <span>{option.label}</span>
                <small>{option.count}</small>
              </button>
            ))}
          </div>

          <Spin spinning={loading}>
            {filteredTransactions.length === 0 ? (
              <div className="cr-empty">
                <span className="cr-empty-icon">
                  <HistoryOutlined />
                </span>
                <h5>
                  {filterType === "all"
                    ? "Your wallet history starts here"
                    : `No ${filterType} transactions`}
                </h5>
                <p>
                  {filterType === "all"
                    ? "Top up your wallet to prepare for your next class booking."
                    : "Try another filter to see more wallet activity."}
                </p>
                {filterType === "all" && (
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    className="profile-action-btn cr-empty-action"
                    onClick={() => setIsTopUpModalOpen(true)}
                  >
                    Top up now
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="cr-txn-list">
                  {paginatedTransactions.map(renderTransaction)}
                </div>

                <div className="cr-pagination-section">
                  <span className="cr-pagination-summary">
                    Showing {(currentPage - 1) * pageSize + 1}–
                    {Math.min(
                      currentPage * pageSize,
                      filteredTransactions.length,
                    )}{" "}
                    of {filteredTransactions.length}
                  </span>
                  <Pagination
                    current={currentPage}
                    pageSize={pageSize}
                    total={filteredTransactions.length}
                    onChange={(page, size) => {
                      setCurrentPage(page);
                      if (size !== pageSize) {
                        setPageSize(size);
                        setCurrentPage(1);
                      }
                    }}
                    pageSizeOptions={[5, 10, 20]}
                    showSizeChanger
                    showLessItems
                    responsive
                  />
                </div>
              </>
            )}
          </Spin>
        </section>
      </div>

      <TopupModal
        isTopUpModalOpen={isTopUpModalOpen}
        setIsTopUpModalOpen={setIsTopUpModalOpen}
        onSuccess={fetchTransactions}
      />
    </div>
  );
};

export default Credits;
