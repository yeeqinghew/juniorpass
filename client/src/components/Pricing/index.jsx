import { useEffect } from "react";
import { Typography, Col, Row, Button } from "antd";
import {
  CalendarOutlined,
  ClockCircleOutlined,
  CustomerServiceOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useUserContext } from "../UserContext";
import { CREDIT_PRICING_TIERS } from "../../utils/creditPricing";
import "./index.css";

const { Text, Title } = Typography;

const creditDestinationState = { activeTab: "credit", openTopUp: true };

const Pricing = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useUserContext();

  useEffect(() => window.scrollTo(0, 0), []);

  const openCreditTopUp = () => {
    if (isAuthenticated) {
      navigate("/profile", { state: creditDestinationState });
      return;
    }
    navigate("/login", {
      state: { from: "/profile", fromState: creditDestinationState },
    });
  };

  const benefits = [
    { icon: <ClockCircleOutlined />, title: "No Expiry", description: "Use your credits anytime, at your own pace" },
    { icon: <SafetyCertificateOutlined />, title: "Wide Selection", description: "Access classes from verified partner centres" },
    { icon: <CalendarOutlined />, title: "Easy Booking", description: "Schedule classes in just a few clicks" },
    { icon: <CustomerServiceOutlined />, title: "Secure Payment", description: "Safe transactions with instant confirmation" },
  ];

  return (
    <div className="pricing-container">
      <div className="pricing-header">
        <Title level={1} className="pricing-hero-title">Tiered Credit Pricing</Title>
        <Text className="pricing-hero-subtitle">
          Choose the number of credits you need. Your per-credit rate is based on the quantity purchased.
          <span className="highlight-text">The more credits you buy, the lower your rate.</span>
        </Text>
      </div>

      <section className="tier-pricing-panel">
        <div className="tier-pricing-heading">
          <span className="tier-heading-icon">★</span>
          <Text className="tier-eyebrow">Pick what works for your family</Text>
          <Title level={3}>More credits, more happy moments</Title>
          <Text className="tier-pricing-hint">Choose how many credits you would like and we will apply the best rate automatically.</Text>
        </div>

        <div className="tier-pricing-grid">
          {CREDIT_PRICING_TIERS.map((tier, index) => (
            <div className={`tier-pricing-item ${index === 3 ? "best-tier" : ""}`} key={tier.min}>
              <div className="tier-item-topline">
                <span className="tier-card-icon">{["○", "♡", "☆", "✦"][index]}</span>
                {index === 3 && <span className="tier-best-badge">Best value</span>}
              </div>
              <div className="tier-credit-range">{tier.label}</div>
              <div className="tier-rate">
                <span className="tier-currency">SGD</span>
                <strong>{tier.rate.toFixed(2)}</strong>
              </div>
              <Text className="tier-rate-caption">for each credit</Text>
              <Text className="tier-saving-label">
                {index === 0 ? "A lovely place to start" : `Save SGD ${(10 - tier.rate).toFixed(2)} on every credit`}
              </Text>
            </div>
          ))}
        </div>

        <div className="tier-pricing-action">
          <div>
            <Text strong>Ready for your next adventure?</Text>
            <Text>Credits never expire, so your family can enjoy them anytime.</Text>
          </div>
          <Button type="primary" size="large" className="choose-plan-btn pricing-main-cta" loading={authLoading} onClick={openCreditTopUp}>
            Buy Credits
          </Button>
        </div>
      </section>

      <div className="benefits-section">
        <Title level={4} className="benefits-title">Why Families Love Junior Pass</Title>
        <Row gutter={[16, 16]} justify="center" className="benefits-grid">
          {benefits.map((benefit) => (
            <Col xs={24} sm={12} md={6} key={benefit.title}>
              <div className="benefit-card">
                <span className="benefit-icon-large">{benefit.icon}</span>
                <Text className="benefit-title">{benefit.title}</Text>
                <Text className="benefit-description">{benefit.description}</Text>
              </div>
            </Col>
          ))}
        </Row>
      </div>
    </div>
  );
};

export default Pricing;
