import { useEffect, useState, useRef } from "react";
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Space,
  Spin,
  Typography,
  Divider,
  Tag,
  Alert,
} from "antd";
import {
  CreditCardOutlined,
  DollarOutlined,
  GiftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import toast from "react-hot-toast";
import { fetchWithAuth, API_ENDPOINTS } from "../../utils/api";
import { useUserContext } from "../UserContext";
import "./TopupModal.css";

const { Title, Text } = Typography;

const TopupModal = ({ isTopUpModalOpen, setIsTopUpModalOpen, onSuccess, creditBalance }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [_modalStep, _setModalStep] = useState("form");
  const [topUpForm] = Form.useForm();
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [topupPreview, setTopupPreview] = useState(null);
  const { user, reauthenticate } = useUserContext();
  const isPollingRef = useRef(false);

  // Wrapper to log all modalStep changes
  const setModalStep = (newStep) => {
    _setModalStep(newStep);
  };

  const modalStep = _modalStep;

  // Predefined top-up packages
  const topupPackages = [
    { amount: 20, label: "20", bonus: 0, popular: false },
    { amount: 50, label: "50", bonus: 5, popular: true },
    { amount: 100, label: "100", bonus: 15, popular: false },
    { amount: 200, label: "200", bonus: 40, popular: false },
  ];

  // Fetch topup preview when amount is selected
  useEffect(() => {
    if (selectedAmount && isTopUpModalOpen) {
      fetchTopupPreview(selectedAmount);
    }
  }, [selectedAmount, isTopUpModalOpen]);

  const fetchTopupPreview = async (amount) => {
    try {
      const creditAmount = amount + getBonusAmount(amount);
      const res = await fetchWithAuth(API_ENDPOINTS.CALCULATE_TOPUP, {
        method: "POST",
        body: JSON.stringify({
          amount_usd: amount,
          credit_amount: creditAmount,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setTopupPreview(data);
      }
    } catch (error) {
      console.error("Failed to fetch topup preview:", error);
    }
  };

  const handleCancel = async () => {
    if (modalStep === "loading") return;
    await reauthenticate();
    setIsTopUpModalOpen(false);
    setSelectedAmount(null);
    setTopupPreview(null);
    topUpForm.resetFields();
    setModalStep("form");
    setIsLoading(false);
  };

  const handleSuccessContinue = () => {
    if (onSuccess) onSuccess();
    handleCancel();
  };

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://sandbox.hit-pay.com/hitpay.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const pollPaymentStatus = (reference_number) => {
    let attempts = 0;
    const maxAttempts = 20;
    let timeoutId;
    isPollingRef.current = true;

    const checkStatus = async () => {
      if (!isPollingRef.current) return;

      attempts++;

      try {
        const res = await fetchWithAuth(
          API_ENDPOINTS.PAYMENT_STATUS(reference_number),
        );

        if (!res.ok) {
          console.error(`🔴 HTTP Error: ${res.status} ${res.statusText}`);
          toast.error(`Error checking payment status: ${res.status}`);
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        const statusUpper = data.status?.toUpperCase();

        if (statusUpper === "COMPLETED") {
          toast.success("Payment completed successfully!");
          isPollingRef.current = false;
          setModalStep("success");
          return;
        }

        if (statusUpper === "FAILED") {
          isPollingRef.current = false;
          setModalStep("error");
          return;
        }

        if (attempts < maxAttempts) {
          timeoutId = setTimeout(checkStatus, 2000);
        } else {
          isPollingRef.current = false;
          handleVerificationFallback(reference_number);
        }
      } catch (error) {
        console.error("🔴 Polling error:", error);

        if (attempts < maxAttempts) {
          timeoutId = setTimeout(checkStatus, 2000);
        } else {
          isPollingRef.current = false;
          toast.error(
            "Connection issue. Please check your balance to confirm payment.",
          );
          setModalStep("error");
        }
      }
    };

    const handleVerificationFallback = async (refNum) => {
      try {
        const verifyResponse = await fetchWithAuth(
          API_ENDPOINTS.PAYMENT_VERIFY(refNum),
        );
        const verifyData = await verifyResponse.json();

        if (verifyData.status?.toUpperCase() === "COMPLETED") {
          setModalStep("success");
        } else {
          toast.error(
            "Payment is taking longer than expected. Please check your balance.",
          );
          setModalStep("error");
        }
      } catch (verifyError) {
        console.error("🔴 Verification fallback error:", verifyError);
        setModalStep("error");
      } finally {
        setIsLoading(false);
      }
    };

    timeoutId = setTimeout(checkStatus, 1500);

    return () => {
      isPollingRef.current = false;
      clearTimeout(timeoutId);
    };
  };

  const getBonusAmount = (amount = selectedAmount) => {
    const package1 = topupPackages.find((pkg) => pkg.amount === amount);
    return package1?.bonus || 0;
  };

  const onHandleTopUp = async () => {
    try {
      const amount = selectedAmount;
      setIsLoading(true);
      const response = await fetchWithAuth(API_ENDPOINTS.INIT_PAYMENT, {
        method: "POST",
        body: JSON.stringify({
          amount,
          user,
        }),
      });

      const { id, url, reference_number } = await response.json();

      if (window.HitPay) {
        window.HitPay.init(
          url,
          {
            domain: "sandbox.hit-pay.com",
            apiDomain: "sandbox.hit-pay.com",
          },
          {
            onClose: () => {
              if (!isPollingRef.current) {
                setIsLoading(false);
                toast.error("Payment was cancelled.");
              }
            },
            onSuccess: () => {
              isPollingRef.current = true;
              setModalStep("loading");
              pollPaymentStatus(reference_number);
            },
            onError: () => {
              setIsLoading(false);
              toast.error("Payment failed. Please try again.");
            },
          },
        );

        window.HitPay.toggle({
          paymentRequest: id,
        });
      } else {
        throw new Error("HitPay not loaded");
      }
    } catch (error) {
      console.error("Error initializing HitPay:", error);
      toast.error("Failed to initiate payment. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const selectPackage = (amount) => {
    setSelectedAmount(amount);
    topUpForm.setFieldsValue({ amount: "" });
  };

  const formatValidityDate = (dateStr) => {
    if (!dateStr) return "Not set";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const renderForm = () => (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {/* Header */}
      <div className="modal-header-centered">
        <div className="modal-icon-wrapper info">
          <CreditCardOutlined />
        </div>
        <Title level={3} className="modal-title">
          Top Up Credits
        </Title>
        <Text className="modal-subtitle">
          Add credits to your account for class bookings
        </Text>
      </div>

      {/* Current Validity Info */}
      {creditBalance && creditBalance.validity_date && (
        <Alert
          message="Current Credit Status"
          description={
            <Space direction="vertical" size={4}>
              <div>
                <Text strong>Balance: </Text>
                <Text>{creditBalance.credit} credits</Text>
              </div>
              <div>
                <Text strong>Valid Until: </Text>
                <Text>{formatValidityDate(creditBalance.validity_date)}</Text>
                <Tag
                  color={creditBalance.days_remaining <= 30 ? "orange" : "green"}
                  style={{ marginLeft: 8 }}
                >
                  {creditBalance.days_remaining} days left
                </Tag>
              </div>
            </Space>
          }
          type="info"
          icon={<ClockCircleOutlined />}
          showIcon
          style={{ marginBottom: 8 }}
        />
      )}

      {/* Package Selection */}
      <div className="topup-packages">
        <Text strong className="topup-section-label">
          Choose Package
        </Text>
        <Row gutter={[12, 12]}>
          {topupPackages.map((pkg) => (
            <Col span={12} key={pkg.amount}>
              <Card
                hoverable
                className={`topup-package-card ${selectedAmount === pkg.amount ? "selected" : ""}`}
                onClick={() => selectPackage(pkg.amount)}
              >
                {pkg.popular && (
                  <div className="topup-popular-badge">POPULAR</div>
                )}
                <div className="topup-package-amount">${pkg.label}</div>
                <div className="topup-package-bonus">
                  {pkg.bonus > 0 ? (
                    <>
                      <Text type="success" strong>
                        + {pkg.bonus} bonus
                      </Text>
                      <br />
                      <Text type="secondary" className="topup-package-total">
                        Total: {pkg.amount + pkg.bonus} credits
                      </Text>
                    </>
                  ) : (
                    <Text type="secondary" className="topup-package-total">
                      {pkg.amount} credits
                    </Text>
                  )}
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      {/* Validity Preview */}
      {selectedAmount && topupPreview && (
        <Card className="topup-preview-card" bordered={false}>
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Text strong>After Top-up:</Text>
              <InfoCircleOutlined style={{ color: "#1890ff" }} />
            </div>

            <div className="preview-row">
              <Text type="secondary">New Balance:</Text>
              <Text strong style={{ fontSize: 16 }}>
                {topupPreview.new_credit} credits
              </Text>
            </div>

            <div className="preview-row highlight">
              <Space direction="vertical" size={4} style={{ width: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <Text strong>New Validity:</Text>
                  <Text strong style={{ color: "#52c41a" }}>
                    {formatValidityDate(topupPreview.new_validity)}
                  </Text>
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Extended by {topupPreview.days_added} days
                  {topupPreview.is_capped && " (at maximum 365-day limit)"}
                </Text>
              </Space>
            </div>

            <Divider style={{ margin: "8px 0" }} />

            <div className="preview-row">
              <Text strong style={{ fontSize: 16 }}>Amount to Pay:</Text>
              <Text strong style={{ fontSize: 20, color: "#1890ff" }}>
                ${selectedAmount}
              </Text>
            </div>
          </Space>
        </Card>
      )}

      {/* Action Buttons */}
      <Row gutter={12} className="modal-actions">
        <Col span={12}>
          <Button
            block
            size="large"
            className="modal-btn"
            onClick={handleCancel}
          >
            Cancel
          </Button>
        </Col>
        <Col span={12}>
          <Button
            block
            type="primary"
            size="large"
            loading={isLoading}
            className="modal-btn modal-btn-primary"
            onClick={onHandleTopUp}
            disabled={!selectedAmount}
          >
            Pay Now
          </Button>
        </Col>
      </Row>
    </Space>
  );

  const renderLoading = () => (
    <div className="modal-loading">
      <Spin size="large" />
      <Title level={4} className="modal-loading-title">
        Processing Payment...
      </Title>
      <Text className="modal-loading-text">
        Please wait while we confirm your payment.
        <br />
        Do not close this window.
      </Text>
    </div>
  );

  const renderSuccess = () => (
    <div className="modal-success">
      <CheckCircleOutlined />
      <Title level={3} className="modal-success-title">
        Top-up Successful!
      </Title>
      <Text className="modal-success-text">
        ${selectedAmount} has been added to your account.
        {getBonusAmount() > 0 && (
          <>
            <br />
            <Text type="success">
              Including {getBonusAmount()} bonus credits!
            </Text>
          </>
        )}
        {topupPreview && (
          <>
            <br />
            <br />
            <Text strong>
              Your credits are now valid until{" "}
              {formatValidityDate(topupPreview.new_validity)}
            </Text>
          </>
        )}
      </Text>
      <Button
        type="primary"
        size="large"
        className="modal-btn"
        onClick={handleSuccessContinue}
      >
        Continue
      </Button>
    </div>
  );

  const renderError = () => (
    <div className="modal-error">
      <CloseCircleOutlined />
      <Title level={3} className="modal-error-title">
        Payment Failed
      </Title>
      <Text className="modal-error-text">
        We couldn't process your payment.
        <br />
        Please try again or contact support.
      </Text>
      <Space size="middle">
        <Button size="large" className="modal-btn" onClick={handleCancel}>
          Close
        </Button>
        <Button
          type="primary"
          size="large"
          className="modal-btn"
          onClick={() => setModalStep("form")}
        >
          Try Again
        </Button>
      </Space>
    </div>
  );

  return (
    <Modal
      title={null}
      open={isTopUpModalOpen}
      onCancel={handleCancel}
      width={520}
      centered
      closable={modalStep !== "loading"}
      maskClosable={false}
      footer={null}
      className="topup-modal"
    >
      {modalStep === "form" && renderForm()}
      {modalStep === "loading" && renderLoading()}
      {modalStep === "success" && renderSuccess()}
      {modalStep === "error" && renderError()}
    </Modal>
  );
};

export default TopupModal;
