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
  const [modalStep, setModalStep] = useState("form");
  const [topUpForm] = Form.useForm();
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [customAmount, setCustomAmount] = useState("");
  const { user, refreshUser } = useUserContext();
  const isPollingRef = useRef(false);

  // Predefined top-up packages
  const topupPackages = [
    { amount: 20, label: "20", bonus: 0, popular: false },
    { amount: 50, label: "50", bonus: 5, popular: true },
    { amount: 100, label: "100", bonus: 15, popular: false },
    { amount: 200, label: "200", bonus: 40, popular: false },
  ];

  const handleCancel = () => {
    if (modalStep === "loading") return;
    setIsTopUpModalOpen(false);
    setSelectedAmount(null);
    setCustomAmount("");
    topUpForm.resetFields();
    setModalStep("form");
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
    const maxAttempts = 12;

    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetchWithAuth(
          API_ENDPOINTS.PAYMENT_STATUS(reference_number)
        );
        const data = await res.json();

        if (data.status === "COMPLETED") {
          clearInterval(interval);
          isPollingRef.current = false;
          await refreshUser();
          if (onSuccess) onSuccess();
          setModalStep("success");
          return;
        } else if (data.status === "FAILED") {
          clearInterval(interval);
          isPollingRef.current = false;
          setModalStep("error");
        }

        if (attempts >= maxAttempts) {
          const response = await fetchWithAuth(
            API_ENDPOINTS.PAYMENT_VERIFY(reference_number)
          );
          const verifyData = await response.json();

          clearInterval(interval);
          isPollingRef.current = false;

          if (verifyData.status === "COMPLETED") {
            await refreshUser();
            if (onSuccess) onSuccess();
            setModalStep("success");
          } else {
            toast.error("Payment verification failed. Please contact support.");
            setModalStep("error");
          }
        }
      } catch (error) {
        clearInterval(interval);
        isPollingRef.current = false;
        toast.error("Failed to check payment status. Please try again later.");
        setModalStep("error");
      }
    }, 5000);
  };

  const getFinalAmount = () => {
    if (selectedAmount) {
      return selectedAmount;
    }
    return parseFloat(customAmount) || 0;
  };

  const getBonusAmount = () => {
    const package1 = topupPackages.find((pkg) => pkg.amount === selectedAmount);
    return package1?.bonus || 0;
  };

  const onHandleTopUp = async () => {
    try {
      const amount = getFinalAmount();

      if (!amount || amount < 5) {
        toast.error("Minimum top-up amount is $5.");
        return;
      }

      if (amount > 1000) {
        toast.error("Maximum top-up amount is $1000.");
        return;
      }

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
          }
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
      setIsLoading(false);
    }
  };

  const selectPackage = (amount) => {
    setSelectedAmount(amount);
    setCustomAmount("");
    topUpForm.setFieldsValue({ amount: "" });
  };

  const onCustomAmountChange = (e) => {
    const value = e.target.value;
    setCustomAmount(value);
    setSelectedAmount(null);
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

      {/* <Divider style={{ margin: "12px 0" }}>OR</Divider> */}

      {/* Custom Amount */}
      {/* <Form form={topUpForm} layout="vertical" className="modal-form">
        <Form.Item label={<Text strong>Custom Amount</Text>} style={{ marginBottom: 12 }}>
          <Input
            placeholder="Enter amount (min $5)"
            value={customAmount}
            onChange={onCustomAmountChange}
            type="number"
            min={5}
            max={1000}
            size="large"
            prefix={<DollarOutlined />}
            className={customAmount ? "input-selected" : ""}
          />
        </Form.Item>
      </Form> */}

      {/* Summary Card */}
      {(selectedAmount || customAmount) && (
        <Card className="topup-summary-card" bordered={false}>
          <div className="topup-summary-content">
            <div>
              <Text strong>Amount to pay:</Text>
              <br />
              <Text className="topup-summary-amount">
                ${getFinalAmount()}
              </Text>
              {getBonusAmount() > 0 && (
                <Text className="topup-summary-bonus">
                  (+${getBonusAmount()} bonus)
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
            disabled={!getFinalAmount() || getFinalAmount() < 5}
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
        ${getFinalAmount()} has been added to your account.
        {getBonusAmount() > 0 && (
          <>
            <br />
            <Text type="success">
              Including ${getBonusAmount()} bonus credit!
            </Text>
          </>
        )}
      </Text>
      <Button type="primary" size="large" className="modal-btn" onClick={handleCancel}>
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