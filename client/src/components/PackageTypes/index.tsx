import { useEffect } from "react";
import { Typography, Row, Col, Tag, Layout } from "antd";
import {
  CalendarOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  CrownOutlined,
  InfoCircleOutlined,
  BulbOutlined,
} from "@ant-design/icons";
import "./PackageTypes.css";

const { Content } = Layout;
const { Title, Text, Paragraph } = Typography;

function PackageTypes() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const packages = [
    {
      title: "Pay as you go",
      icon: <ThunderboltOutlined />,
      colorClass: "pkg-blue",
      description:
        "Discover new activities without committing to long-term packages. Book only the classes your child attends, whenever it fits your schedule.",
      features: [
        "No long-term commitment",
        "Flexible class booking",
        "Explore different enrichment programs easily",
        "Pay only for what you use",
      ],
      bestFor: [
        "Trying new activities before committing",
        "Exploring your child's interests",
        "Families with changing schedules",
      ],
      example:
        "Try a dance class this weekend, book a coding workshop during holidays, or schedule a swimming lesson whenever convenient.",
    },
    {
      title: "Short-Term",
      icon: <CalendarOutlined />,
      colorClass: "pkg-pink",
      description:
        "A flexible way for your child to experience a program over several weeks before deciding on a long-term commitment.",
      features: [
        "Shorter commitment with structured learning",
        "25% of a full-term program",
        "Ideal for exploring new interests with less pressure",
        "Option to upgrade to full-term — no extra cost",
      ],
      bestFor: [
        "Parents who prefer flexibility before committing long-term",
        "Building confidence and interest gradually",
        "Families looking for lower-commitment options",
      ],
      example:
        "Sign up for a 2-week basketball course. After 2 classes, get a 24-hour offer to upgrade to the 3-month package by topping up the remaining credits.",
    },
    {
      title: "Full-Term",
      icon: <CrownOutlined />,
      colorClass: "pkg-gold",
      badge: "Best Value",
      description:
        "Designed for children ready to deepen their skills and build long-term confidence through consistent learning and practice.",
      features: [
        "Lower per-class pricing with greater savings",
        "Structured progression for deeper learning",
        "Consistent routines that support long-term development",
      ],
      bestFor: [
        "Children passionate about a specific activity",
        "Families seeking the best value per class",
        "Building strong learning habits and consistency",
      ],
      example:
        "Enroll in a full-year piano program, a semester of competitive swimming, or a 6-month coding bootcamp. Or upgrade from your 2-week trial!",
    },
  ];

  const faqs = [
    {
      question: "Can I upgrade my package?",
      answer:
        "Absolutely! Start with a short-term package to try it out. After attending any class, you'll get a 24-hour window to upgrade to the full-term package by simply topping up the remaining credits. Your existing credits carry over — no waste!",
    },
    {
      question: "Do credits expire?",
      answer:
        "Credits share one rolling expiry. Each top-up extends all credits by 90 days, capped at 365 days from that top-up.",
    },
    {
      question: "Which package should I choose?",
      answer:
        "Start with pay-as-you-go if you're exploring different activities. Choose short-term when you want to try an activity with minimal commitment (you can always upgrade within 24 hours!). Go full-term when you're committed to mastery and want maximum savings.",
    },
    {
      question: "What if I need to cancel?",
      answer:
        "Cancellation policies vary by package type and partner. Check the specific terms when booking. Generally, pay-as-you-go offers the most flexibility.",
    },
  ];

  return (
    <div className="package-types-layout">
      <div className="package-types-content">
        {/* Hero */}
        <div className="package-hero">
          <Title className="package-hero-title">
            Choose how your child learns.
            <br />
            Start flexible, grow at their pace.
          </Title>
          <Paragraph className="package-hero-subtitle">
            Three package types designed around your family's needs — explore
            freely, commit when ready, and upgrade anytime.
          </Paragraph>
        </div>

        {/* Package Cards */}
        <div className="packages-container">
          <Row gutter={[32, 32]}>
            {packages.map((pkg, index) => (
              <Col xs={24} lg={8} key={index}>
                <div className={`package-card ${pkg.colorClass}`}>
                  {pkg.badge && (
                    <div className="package-best-badge">{pkg.badge}</div>
                  )}
                  <div className="package-card-header">
                    <div className="package-icon">{pkg.icon}</div>
                    <Title level={2} className="package-card-title">
                      {pkg.title}
                    </Title>
                    <Text className="package-description">
                      {pkg.description}
                    </Text>
                  </div>

                  <div className="package-section">
                    <Text className="pkg-section-label">
                      <CheckCircleOutlined /> Key Features
                    </Text>
                    <ul className="pkg-list">
                      {pkg.features.map((f, i) => (
                        <li key={i}>
                          <CheckCircleOutlined className="pkg-check" />
                          <Text>{f}</Text>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="package-section">
                    <Text className="pkg-section-label">
                      <InfoCircleOutlined /> Best For
                    </Text>
                    <ul className="pkg-list pkg-list-dot">
                      {pkg.bestFor.map((b, i) => (
                        <li key={i}>
                          <Text>{b}</Text>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="package-example">
                    <BulbOutlined className="example-icon" />
                    <Text className="example-text">{pkg.example}</Text>
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        </div>

        {/* FAQ */}
        <div className="package-faq-section">
          <Title level={2} className="faq-title">
            Common Questions
          </Title>
          <Row gutter={[24, 24]}>
            {faqs.map((faq, i) => (
              <Col xs={24} md={12} key={i}>
                <div className="faq-card">
                  <Text strong className="faq-question">
                    {faq.question}
                  </Text>
                  <Text className="faq-answer">{faq.answer}</Text>
                </div>
              </Col>
            ))}
          </Row>
        </div>
      </div>
    </div>
  );
}

export default PackageTypes;
