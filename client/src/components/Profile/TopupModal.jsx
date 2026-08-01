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
} from "antd";
import {
  CreditCardOutlined,
  DollarOutlined,
  GiftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";
import toast from "react-hot-toast";
import { fetchWithAuth, API_ENDPOINTS } from "../../utils/api";
import { useUserContext } from "../UserContext";
import "./TopupModal.css";

const { Title, Text } = Typography;

const TopupModal = ({ isTopUpModalOpen, setIsTopUpModalOpen, onSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [_modalStep, _setModalStep] = useState("form");
  const [topUpForm] = Form.useForm();
  const [selectedAmount, setSelectedAmount] = useState(null);
  const { user, reauthenticate } = useUserContext();
  const isPollingRef = useRef(false);

  // Wrapper to log all modalStep changes
  const setModalStep = (newStep) => {
    console.trace(); // Show call stack
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

  const handleCancel = async () => {
    if (modalStep === "loading") return;
    await reauthenticate();
    setIsTopUpModalOpen(false);
    setSelectedAmount(null);
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
      // Guard check: stop executing if polling flag was turned off elsewhere
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

        // If we haven't reached max attempts, schedule the next check in 2 seconds
        if (attempts < maxAttempts) {
          timeoutId = setTimeout(checkStatus, 2000);
        } else {
          // Max attempts reached: execute final fallback verification
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

    // Helper logic for final verification step to keep code tidy
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

    // Start the first check after 1.5 seconds
    timeoutId = setTimeout(checkStatus, 1500);

    // Clean up function in case modal unmounts while polling
    return () => {
      isPollingRef.current = false;
      clearTimeout(timeoutId);
    };
  };

  const getBonusAmount = () => {
    const package1 = topupPackages.find((pkg) => pkg.amount === selectedAmount);
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
                setModalStep("loading");
                pollPaymentStatus(reference_number);
              }
            },
            onSuccess: () => {
              setModalStep("loading");
              if (!isPollingRef.current) {
                pollPaymentStatus(reference_number);
              }
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
                <div className="topup-package-amount">{pkg.label}</div>
                <div className="topup-package-bonus">
                  {pkg.bonus > 0 ? (
                    <>
                      <Text type="success" strong>
                        + {pkg.bonus} credits
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

      {/* Summary Card */}
      {selectedAmount && (
        <Card className="topup-summary-card" bordered={false}>
          <div className="topup-summary-content">
            <div>
              <Text strong>Amount to pay:</Text>
              <br />
              <Text className="topup-summary-amount">${selectedAmount}</Text>
              {getBonusAmount() > 0 && (
                <Text className="topup-summary-bonus">
                  (+ {getBonusAmount()} credits bonus)
                </Text>
              )}
            </div>
            <GiftOutlined className="topup-summary-icon" />
          </div>
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
      <Space direction="vertical" size={24} style={{ width: "100%" }}>
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
                Including ${getBonusAmount()} bonus credit!
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
      </Space>
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
