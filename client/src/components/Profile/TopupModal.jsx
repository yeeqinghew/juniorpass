import { useEffect, useState, useRef } from "react";
import { Button, InputNumber, Modal, Spin, Typography } from "antd";
import {
  CreditCardOutlined,
  WalletOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CheckOutlined,
  LockOutlined,
} from "@ant-design/icons";
import toast from "react-hot-toast";
import { fetchWithAuth, API_ENDPOINTS } from "../../utils/api";
import { useUserContext } from "../UserContext";
import {
  calculateCreditPrice,
  CREDIT_PRICING_TIERS,
  getCreditPricingTier,
} from "../../utils/creditPricing";
import "./TopupModal.css";

const { Title, Text } = Typography;

const TopupModal = ({ isTopUpModalOpen, setIsTopUpModalOpen, onSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [modalStep, setModalStep] = useState("form");
  const [selectedCredits, setSelectedCredits] = useState(null);
  const { user, reauthenticate } = useUserContext();
  const isPollingRef = useRef(false);

  const selectedTier = getCreditPricingTier(selectedCredits);
  const paymentAmount = calculateCreditPrice(selectedCredits);

  const closeModal = () => {
    setIsTopUpModalOpen(false);
    setSelectedCredits(null);
    setModalStep("form");
    setIsLoading(false);
  };

  const handleCancel = () => {
    if (modalStep === "loading") return;
    closeModal();
  };

  const handleSuccessContinue = async () => {
    closeModal();
    if (onSuccess) await onSuccess();
    await reauthenticate();
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

  const onHandleTopUp = async () => {
    try {
      if (!selectedTier) return;
      setIsLoading(true);
      const response = await fetchWithAuth(API_ENDPOINTS.INIT_PAYMENT, {
        method: "POST",
        body: JSON.stringify({ credits: selectedCredits }),
      });

      const payment = await response.json();
      if (!response.ok) {
        throw new Error(payment.error || "Unable to initialise payment");
      }
      const { id, url, reference_number } = payment;

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
                setModalStep("form");
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

  const renderForm = () => (
    <div className="topup-modal-shell">
      <header className="topup-modal-header">
        <div className="topup-header-icon">
          <WalletOutlined />
        </div>
        <div className="topup-header-copy">
          <Text className="topup-eyebrow">Wallet</Text>
          <Title level={3}>Top up your credits</Title>
          <Text>
            Pick an amount and we will automatically apply the best rate.
          </Text>
        </div>
        <div className="topup-current-balance">
          <span>Current balance</span>
          <div>
            <strong>{user?.credit ?? 0}</strong>
            <small>credits</small>
          </div>
        </div>
      </header>

      <div className="topup-modal-body">
        <section className="topup-selection-panel">
          <div className="topup-section-heading">
            <span className="topup-step-number">1</span>
            <div>
              <Text strong>Choose your amount</Text>
              <Text>Enter any whole number of credits.</Text>
            </div>
          </div>

          <label className="topup-input-label" htmlFor="topup-credit-amount">
            Number of credits
          </label>
          <InputNumber
            id="topup-credit-amount"
            min={1}
            precision={0}
            value={selectedCredits}
            onChange={setSelectedCredits}
            placeholder="e.g. 20"
            addonAfter="credits"
            size="large"
            className="topup-credit-input"
          />

          <Text className="topup-tier-helper">
            Or start from a pricing tier
          </Text>
          <div className="topup-tier-list">
            {CREDIT_PRICING_TIERS.map((tier) => {
              const isSelected = selectedTier?.min === tier.min;

              return (
                <button
                  type="button"
                  key={tier.min}
                  className={`topup-tier-option ${isSelected ? "selected" : ""}`}
                  onClick={() => setSelectedCredits(tier.min)}
                  aria-pressed={isSelected}
                >
                  <span className="topup-tier-range">{tier.label}</span>
                  <span className="topup-tier-price">
                    <strong>SGD {tier.rate.toFixed(2)}</strong>
                    <small>per credit</small>
                  </span>
                  {tier.max === null && (
                    <span className="topup-best-rate">Best rate</span>
                  )}
                  <CheckOutlined className="topup-tier-check" />
                </button>
              );
            })}
          </div>
        </section>

        <aside className={`topup-order-card ${selectedTier ? "ready" : ""}`}>
          <div className="topup-order-heading">
            <div>
              <Text className="topup-order-eyebrow">Your purchase</Text>
              <Title level={5}>Order summary</Title>
            </div>
            <WalletOutlined />
          </div>

          <div className="topup-order-details">
            <div>
              <span>Credits</span>
              <strong>{selectedCredits || "—"}</strong>
            </div>
            <div>
              <span>Rate</span>
              <strong>
                {selectedTier ? `SGD ${selectedTier.rate.toFixed(2)}` : "—"}
              </strong>
            </div>
          </div>

          <div className="topup-order-total">
            <span>Total</span>
            <strong>
              {selectedTier ? `SGD ${paymentAmount.toFixed(2)}` : "SGD —"}
            </strong>
          </div>

          <Text className="topup-order-note">
            {selectedTier
              ? "Your tier rate has been applied automatically."
              : "Choose an amount to see your total."}
          </Text>
        </aside>
      </div>

      <footer className="topup-modal-footer">
        <div className="topup-secure-note">
          <LockOutlined />
          <span>Secure checkout via HitPay</span>
        </div>
        <div className="topup-modal-actions">
          <Button
            size="large"
            className="topup-cancel-btn"
            onClick={handleCancel}
          >
            Cancel
          </Button>
          <Button
            type="primary"
            size="large"
            icon={<CreditCardOutlined />}
            loading={isLoading}
            className="topup-pay-btn"
            onClick={onHandleTopUp}
            disabled={!selectedTier}
          >
            {selectedTier
              ? `Pay SGD ${paymentAmount.toFixed(2)}`
              : "Choose credits"}
          </Button>
        </div>
      </footer>
    </div>
  );

  const renderLoading = () => (
    <div className="topup-status-screen processing">
      <header className="topup-status-header">
        <span className="topup-status-brand-icon">
          <WalletOutlined />
        </span>
        <div>
          <Text className="topup-status-eyebrow">JuniorPASS wallet</Text>
          <Text className="topup-status-header-copy">Secure credit top-up</Text>
        </div>
      </header>

      <div className="topup-status-body">
        <div className="topup-status-icon">
          <Spin size="large" />
        </div>
        <Text className="topup-status-label">Payment processing</Text>
        <Title level={3}>Confirming your payment</Title>
        <Text className="topup-status-description">
          We are waiting for the payment confirmation. This usually takes only a
          few seconds.
        </Text>

        <div className="topup-status-progress">
          <span className="topup-status-pulse" />
          Waiting for confirmation
        </div>

        <div className="topup-status-note">
          <LockOutlined />
          <span>Keep this window open while we finish securely.</span>
        </div>
      </div>
    </div>
  );

  const renderSuccess = () => (
    <div className="topup-status-screen success">
      <header className="topup-status-header">
        <span className="topup-status-brand-icon">
          <WalletOutlined />
        </span>
        <div>
          <Text className="topup-status-eyebrow">JuniorPASS wallet</Text>
          <Text className="topup-status-header-copy">Secure credit top-up</Text>
        </div>
      </header>

      <div className="topup-status-body">
        <div className="topup-status-icon">
          <CheckCircleOutlined />
        </div>
        <Text className="topup-status-label">Payment confirmed</Text>
        <Title level={3}>Top-up complete</Title>
        <Text className="topup-status-description">
          Your credits are ready to use for your next JuniorPASS booking.
        </Text>

        <div className="topup-status-credit-result">
          <span>Credits added</span>
          <div>
            <strong>+{selectedCredits ?? 0}</strong>
            <small>credits</small>
          </div>
        </div>

        <Button
          type="primary"
          size="large"
          className="topup-status-primary-btn"
          onClick={handleSuccessContinue}
        >
          Continue to my credits
        </Button>
      </div>
    </div>
  );

  const renderError = () => (
    <div className="topup-status-screen error">
      <header className="topup-status-header">
        <span className="topup-status-brand-icon">
          <WalletOutlined />
        </span>
        <div>
          <Text className="topup-status-eyebrow">JuniorPASS wallet</Text>
          <Text className="topup-status-header-copy">Secure credit top-up</Text>
        </div>
      </header>

      <div className="topup-status-body">
        <div className="topup-status-icon">
          <CloseCircleOutlined />
        </div>
        <Text className="topup-status-label">Payment not completed</Text>
        <Title level={3}>We couldn&apos;t confirm the payment</Title>
        <Text className="topup-status-description">
          No credits were added. You can safely try again or return to your
          wallet.
        </Text>

        <div className="topup-status-actions">
          <Button size="large" onClick={handleCancel}>
            Close
          </Button>
          <Button
            type="primary"
            size="large"
            onClick={() => setModalStep("form")}
          >
            Try again
          </Button>
        </div>

        <Text className="topup-status-support">
          Still having trouble? Contact JuniorPASS support.
        </Text>
      </div>
    </div>
  );

  return (
    <Modal
      title={null}
      open={isTopUpModalOpen}
      onCancel={handleCancel}
      width={modalStep === "form" ? 680 : 520}
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
