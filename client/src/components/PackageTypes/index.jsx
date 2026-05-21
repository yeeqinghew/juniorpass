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
      title: "Pay-As-You-Go",
      icon: <ThunderboltOutlined />,
      color: "#98BDD2",
      gradient: "linear-gradient(135deg, #98BDD2 0%, #6aa4c3 100%)",
      tagColor: "blue",
      description:
        "Perfect for trying out activities without long-term commitment. Pay only for the classes you attend.",
      features: [
        "No commitment required",
        "Book individual classes",
        "Flexible scheduling",
        "Try different activities easily",
        "Pay per session attended",
      ],
      bestFor: [
        "Parents exploring new activities for their child",
        "Trying out different classes before committing",
        "Irregular schedules or busy families",
        "One-off events or workshops",
      ],
      creditUsage: "4-6 credits per class (varies by partner)",
      example:
        "Book a single dance class this Saturday, a cooking workshop next week, and a swimming lesson whenever your schedule allows.",
    },
    {
      title: "Short-Term Package",
      icon: <CalendarOutlined />,
      color: "#f3a5c7",
      gradient: "linear-gradient(135deg, #f3a5c7 0%, #e88bb1 100%)",
      tagColor: "magenta",
      description:
        "Try a series of classes over 4-8 weeks. Love it? Upgrade to long-term within 24 hours after the last class and just pay the difference!",
      features: [
        "Fixed duration (4-8 weeks typically)",
        "Build consistency and routine",
        "24-hour upgrade window after last class ⏰",
        "Seamless upgrade - credits carry over",
      ],
      bestFor: [
        "Parents wanting to try before committing long-term",
        "Children exploring a new activity",
        "Building habits and routines",
        "Risk-free introduction to new skills",
      ],
      creditUsage: "Package deal - upgrade anytime",
      example:
        "Sign up for a 2-week basketball course. After 2 classes, get a 24-hour offer to upgrade to the 3-month package by just topping up the remaining credits.",
    },
    {
      title: "Long-Term Package",
      icon: <CrownOutlined />,
      color: "#d4af37",
      gradient: "linear-gradient(135deg, #d4af37 0%, #b8941f 100%)",
      tagColor: "gold",
      description:
        "Full commitment for a term or year. Maximum savings and priority access for serious learners building mastery. Upgrade from short-term anytime!",
      features: [
        "Extended duration (3+ months or full term)",
        "Maximum savings (30-50% vs pay-as-you-go)",
        "Deeper learning and mastery",
        "Upgrade from short-term - just pay the difference",
      ],
      bestFor: [
        "Serious skill development and mastery",
        "Children passionate about an activity",
        "Long-term commitment to a hobby or sport",
        "Families wanting maximum value and savings",
      ],
      creditUsage: "Bulk credit package - up to 50% savings",
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
            Select the package that fits your child's learning needs and your family's schedule.
            Start flexible, upgrade anytime!
          </Paragraph>
        </div>

        {/* Package Cards */}
        <div className="packages-container">
          <Row gutter={[32, 32]}>
            {packages.map((pkg, index) => (
              <Col xs={24} sm={24} md={24} lg={8} key={index}>
                <Card
                  className="package-card"
                >
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

                  <div className="package-credits">
                    <Space direction="vertical" size={4}>
                      <Text strong className="section-label">
                        <DollarOutlined /> Credit Usage
                      </Text>
                      <Text className="credit-info">{pkg.creditUsage}</Text>
                    </Space>
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
                  After attending any class, you'll get a 24-hour window to upgrade
                  to the long-term package by simply topping up the remaining credits.
                  Your existing credits carry over - no waste!
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
                  Start with pay-as-you-go if you're exploring different activities.
                  Choose short-term when you want to try an activity with minimal commitment
                  (you can always upgrade within 24 hours!). Go long-term when you're
                  committed to mastery and want maximum savings.
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
