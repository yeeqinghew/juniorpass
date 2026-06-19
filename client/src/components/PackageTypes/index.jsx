import { useEffect } from "react";
import { Layout, Typography, Card, Row, Col, Tag, Space, Divider } from "antd";
import {
  CalendarOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  ThunderboltOutlined,
  CrownOutlined,
  InfoCircleOutlined,
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
      color: "#98BDD2",
      gradient: "linear-gradient(135deg, #98BDD2 0%, #6aa4c3 100%)",
      tagColor: "blue",
      description:
        "Discover new activities without committing to full-term packages. Book only the classes your child attends, whenever it fits your schedule.",
      features: [
        "No long-term commitment",
        "Flexible class booking",
        "Explore different enrichment programs easily",
        "Pay only for what you use session attended",
      ],
      bestFor: [
        "Trying new activities before committing",
        "Explore your child's interests",
        "Families with changing schedules",
      ],
      example:
        "Try a dance class this weekend, book a coding workshop during holidays, or schedule a swimming lesson whenever convenient.",
    },
    {
      title: "Short-Term",
      icon: <CalendarOutlined />,
      color: "#f3a5c7",
      gradient: "linear-gradient(135deg, #f3a5c7 0%, #e88bb1 100%)",
      tagColor: "magenta",
      description:
        "A flexible way for your child to experience a program over several weeks before deciding on a long-term commitment.",
      features: [
        "Shorter commitment with structured learning",
        "25% of a full-term program",
        "Ideal for exploring new interests with less pressure",
        "Option to upgrade to a full-term package",
        "No additional cost incurred when upgrading later",
      ],
      bestFor: [
        "Parents who prefer flexibility before committing long-term",
        "Building confidence and interest gradually",
        "Families looking for lower-commitment options",
      ],
      example:
        "Sign up for a 2-week basketball course. After 2 classes, get a 24-hour offer to upgrade to the 3-month package by just topping up the remaining credits.",
    },
    {
      title: "Full-Term",
      icon: <CrownOutlined />,
      color: "#d4af37",
      gradient: "linear-gradient(135deg, #d4af37 0%, #b8941f 100%)",
      tagColor: "gold",
      description:
        "Designed for children who are ready to deepen their skills and build long-term confidence through consistent learning and practice.",
      features: [
        "Lower per-class pricing with greater overall savings",
        "Structured progression for deeper learning and mastery",
        "Consistent routines that support long-term development",
      ],
      bestFor: [
        "Children passionate about a specific activity",
        "Families seeking the best valueper class",
        "Building strong learning habits and consistency",
      ],
      example:
        "Enroll in a full-year piano program, a semester of competitive swimming, or a 6-month coding bootcamp. Or upgrade from your 2-week trial!",
    },
  ];

  return (
    <Layout className="package-types-layout">
      <Content className="package-types-content">
        {/* Hero Section */}
        <div className="package-hero">
          <Title level={1} className="package-hero-title">
            Package Types
          </Title>
          <Paragraph className="package-hero-subtitle">
            Select the package that fits your child's learning needs and your
            family's schedule. Start flexible, upgrade anytime!
          </Paragraph>
        </div>

        {/* Package Cards */}
        <div className="packages-container">
          <Row gutter={[32, 32]}>
            {packages.map((pkg, index) => (
              <Col xs={24} sm={24} md={24} lg={8} key={index}>
                <Card className="package-card">
                  <div className="package-card-header">
                    <div
                      className="package-icon"
                      style={{ background: pkg.gradient }}
                    >
                      {pkg.icon}
                    </div>
                    <Title level={2} className="package-card-title">
                      {pkg.title}
                    </Title>
                  </div>

                  <Paragraph className="package-description">
                    {pkg.description}
                  </Paragraph>

                  <Divider />

                  <div className="package-features">
                    <Text strong className="section-label">
                      <CheckCircleOutlined /> Key Features
                    </Text>
                    <ul className="feature-list">
                      {pkg.features.map((feature, idx) => (
                        <li key={idx}>
                          <CheckCircleOutlined
                            style={{ color: pkg.color, marginRight: 8 }}
                          />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Divider />

                  <div className="package-best-for">
                    <Text strong className="section-label">
                      <InfoCircleOutlined /> Best For
                    </Text>
                    <ul className="best-for-list">
                      {pkg.bestFor.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <Divider />

                  <div className="package-example">
                    <Text strong className="section-label">
                      Example
                    </Text>
                    <Paragraph className="example-text">
                      {pkg.example}
                    </Paragraph>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </div>

        {/* FAQ Section */}
        <div className="package-faq-section">
          <Title level={2} className="section-title">
            Common Questions
          </Title>
          <Row gutter={[24, 24]}>
            <Col xs={24} md={12}>
              <Card className="faq-card">
                <Title level={4}>Can I upgrade my package?</Title>
                <Paragraph>
                  Absolutely! Start with a short-term package to try it out.
                  After attending any class, you'll get a 24-hour window to
                  upgrade to the full-term package by simply topping up the
                  remaining credits. Your existing credits carry over - no
                  waste!
                </Paragraph>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card className="faq-card">
                <Title level={4}>Do credits expire?</Title>
                <Paragraph>
                  No! Your credits never expire and can be used for any package
                  type. Top up anytime and use them at your own pace.
                </Paragraph>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card className="faq-card">
                <Title level={4}>Which package should I choose?</Title>
                <Paragraph>
                  Start with pay-as-you-go if you're exploring different
                  activities. Choose short-term when you want to try an activity
                  with minimal commitment (you can always upgrade within 24
                  hours!). Go full-term when you're committed to mastery and
                  want maximum savings.
                </Paragraph>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card className="faq-card">
                <Title level={4}>What if I need to cancel?</Title>
                <Paragraph>
                  Cancellation policies vary by package type and partner. Check
                  the specific terms when booking. Generally, pay-as-you-go
                  offers the most flexibility.
                </Paragraph>
              </Card>
            </Col>
          </Row>
        </div>
      </Content>
    </Layout>
  );
}

export default PackageTypes;
