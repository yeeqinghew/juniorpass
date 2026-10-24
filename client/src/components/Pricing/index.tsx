import { useEffect, useState } from "react";
import { Typography, Col, Row, Button, InputNumber, Slider } from "antd";
import {
  CalendarOutlined,
  CustomerServiceOutlined,
  SafetyCertificateOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useUserContext } from "../UserContext";
import {
  calculateCreditPrice,
  CREDIT_PRICING_TIERS,
  getCreditPricingTier,
} from "../../utils/creditPricing";
import "./index.css";

const { Text, Title } = Typography;

const creditDestinationState = { activeTab: "credit", openTopUp: true };

const Pricing = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useUserContext();
  const [calculatorCredits, setCalculatorCredits] = useState(1);
  const calculatorTier = getCreditPricingTier(calculatorCredits);
  const calculatorTotal = calculateCreditPrice(calculatorCredits);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const openCreditTopUp = () => {
    if (isAuthenticated) {
      navigate("/profile", { state: creditDestinationState });
      return;
    }
    navigate("/login", {
      state: { from: "/profile", fromState: creditDestinationState },
    });
  };

  const updateCalculatorCredits = (value: number | null): void => {
    if (value === null) return;
    setCalculatorCredits(Math.min(100, Math.max(1, Math.round(value))));
  };

  const benefits = [
    {
      icon: <WalletOutlined />,
      title: "Flexible Top-ups",
      description: "Choose the number of credits that suits your plans",
    },
    {
      icon: <SafetyCertificateOutlined />,
      title: "Wide Selection",
      description: "Access classes from verified partner centres",
    },
    {
      icon: <CalendarOutlined />,
      title: "Easy Booking",
      description: "Schedule classes in just a few clicks",
    },
    {
      icon: <CustomerServiceOutlined />,
      title: "Secure Payment",
      description: "Safe transactions with instant confirmation",
    },
  ];

  return (
    <div className="pricing-container">
      <div className="pricing-header">
        <Title level={1} className="pricing-hero-title">
          Tiered Credit Pricing
        </Title>
        <Text className="pricing-hero-subtitle">
          Choose the number of credits you need. Your per-credit rate is based
          on the quantity purchased.
          <span className="highlight-text">
            The more credits you buy, the lower your rate.
          </span>
        </Text>
      </div>

      <section className="tier-pricing-panel">
        <div className="tier-pricing-heading">
          <span className="tier-heading-icon">★</span>
          <Text className="tier-eyebrow">Pick what works for your family</Text>
          <Text className="tier-pricing-hint">
            Choose how many credits you would like and we will apply the best
            rate automatically.
          </Text>
        </div>

        <div className="tier-pricing-grid">
          {CREDIT_PRICING_TIERS.map((tier, index) => (
            <div
              className={`tier-pricing-item ${
                tier.recommended ? "recommended-tier" : ""
              } ${index === 3 ? "best-tier" : ""}`}
              key={tier.min}
            >
              <div className="tier-item-topline">
                <span className="tier-card-icon">
                  {["○", "♡", "☆", "✦"][index]}
                </span>
                {index === 3 && (
                  <span className="tier-best-badge">Best value</span>
                )}
                {tier.recommended && (
                  <span className="tier-recommended-badge">Recommended</span>
                )}
              </div>
              <div className="tier-credit-range">{tier.label}</div>
              <div className="tier-rate">
                <span className="tier-currency">S$</span>
                <strong>{tier.rate.toFixed(2)}</strong>
              </div>
              <Text className="tier-rate-caption">for each credit</Text>
              <Text className="tier-saving-label">
                {index === 0
                  ? "A lovely place to start"
                  : `Save S$ ${(CREDIT_PRICING_TIERS[0].rate - tier.rate).toFixed(2)}/credit`}
              </Text>
            </div>
          ))}
        </div>

        <div className="tier-pricing-action">
          <div>
            <Text strong>Ready for your next adventure?</Text>
            <Text>
              Each top-up extends all credits by 90 days, capped at 365 days.
            </Text>
          </div>
          <Button
            type="primary"
            size="large"
            className="choose-plan-btn pricing-main-cta"
            loading={authLoading}
            onClick={openCreditTopUp}
          >
            Buy Credits
          </Button>
        </div>
      </section>

      <section
        className="credit-explainer"
        aria-labelledby="credit-explainer-title"
      >
        <div className="credit-explainer-heading">
          <Text className="credit-explainer-eyebrow">
            Simple and transparent
          </Text>
          <Title level={2} id="credit-explainer-title">
            See how Junior Pass credits work
          </Title>
          <Text>
            Choose an amount to see the applicable rate and estimated purchase
            total before proceeding to checkout.
          </Text>
        </div>

        <div className="credit-explainer-grid">
          <div className="credit-calculator-card">
            <div className="credit-calculator-control-heading">
              <div>
                <label htmlFor="credit-calculator-input">
                  Credits to purchase
                </label>
                <Text className="credit-slider-instruction">
                  Drag the slider or enter an amount
                </Text>
              </div>
              <InputNumber
                id="credit-calculator-input"
                min={1}
                max={100}
                precision={0}
                value={calculatorCredits}
                onChange={updateCalculatorCredits}
                aria-label="Credits to purchase"
              />
            </div>
            <Slider
              min={1}
              max={100}
              value={calculatorCredits}
              marks={{ 1: "1", 30: "30", 60: "60", 100: "100" }}
              tooltip={{ formatter: (value) => `${value} credits` }}
              onChange={updateCalculatorCredits}
              aria-label="Select number of credits"
            />

            <div className="credit-calculator-results" aria-live="polite">
              <div>
                <Text>Price per credit</Text>
                <strong>S${calculatorTier?.rate.toFixed(2) ?? "—"}</strong>
              </div>
              <div>
                <Text>Total purchase cost</Text>
                <strong>S${calculatorTotal.toFixed(2)}</strong>
              </div>
            </div>
            <Text className="credit-calculator-note">
              The applicable tier rate is applied to every credit in this
              estimate. Your checkout total is shown for confirmation before
              payment.
            </Text>
          </div>

          <aside
            className="credit-example-card"
            aria-label="Credit cost example"
          >
            <span className="credit-example-badge">Illustrative example</span>
            <Title level={3}>What could a class cost?</Title>
            <div className="credit-example-equation">
              <div>
                <strong>2</strong>
                <Text>credits for one class</Text>
              </div>
              <span aria-hidden="true">×</span>
              <div>
                <strong>S$10.00</strong>
                <Text>entry-tier rate</Text>
              </div>
              <span aria-hidden="true">=</span>
              <div className="credit-example-total">
                <strong>S$20.00</strong>
                <Text>example class cost</Text>
              </div>
            </div>
            <Text className="credit-example-disclaimer">
              The 2-credit class is an example only. Each class displays its
              actual credit cost before you book.
            </Text>
            <div className="credit-expiry-callout">
              <CalendarOutlined />
              <Text>
                Credits share one rolling expiry. Each top-up extends all
                credits by 90 days, capped at 365 days from that top-up.
              </Text>
            </div>
          </aside>
        </div>
      </section>

      <div className="benefits-section">
        <Title level={4} className="benefits-title">
          Why Families Love Junior Pass
        </Title>
        <Row gutter={[16, 16]} justify="center" className="benefits-grid">
          {benefits.map((benefit) => (
            <Col xs={24} sm={12} md={6} key={benefit.title}>
              <div className="benefit-card">
                <span className="benefit-icon-large">{benefit.icon}</span>
                <Text className="benefit-title">{benefit.title}</Text>
                <Text className="benefit-description">
                  {benefit.description}
                </Text>
              </div>
            </Col>
          ))}
        </Row>
      </div>
    </div>
  );
};

export default Pricing;
