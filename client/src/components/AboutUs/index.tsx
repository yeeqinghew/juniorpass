import { Col, Row, Typography, Avatar, Space } from "antd";
import { CheckCircleOutlined } from "@ant-design/icons";
import "./index.css";

const { Text, Title } = Typography;

const AboutUs = () => {
  const values = [
    {
      icon: "🎯",
      title: "Parent-Centric",
      description: "Every feature designed with parents' needs in mind",
    },
    {
      icon: "⭐",
      title: "Quality First",
      description: "Only trusted, verified enrichment partners",
    },
    {
      icon: "💚",
      title: "Community Driven",
      description: "Building connections between families and partners",
    },
  ];

  const team = [
    {
      name: "Xavier",
      initial: "X",
      role: "Founder",
      avatarClass: "avatar-blue",
      quote:
        "Every child deserves access to amazing learning opportunities. We're here to make that happen.",
    },
    {
      name: "Abednego",
      initial: "A",
      role: "Co-Founder",
      avatarClass: "avatar-pink",
      quote:
        "Building meaningful connections between families and enrichment opportunities.",
    },
    {
      name: "Qing",
      initial: "Q",
      role: "Developer",
      avatarClass: "avatar-green",
      quote:
        "Technology should simplify life, not complicate it. Building Junior Pass with care and dedication.",
    },
  ];

  const bullets = [
    "Curated classes across categories and age groups",
    "Simple, secure booking with flexible credits",
    "Trusted partners and transparent reviews",
    "Designed for parents, with care and dedication",
  ];

  return (
    <div className="about-container">
      {/* Hero */}
      <div className="about-hero">
        <Title className="about-hero-title">
          We believe every child deserves the chance to discover what they love.
        </Title>
        <Text className="about-hero-subtitle">
          Junior Pass connects Singapore families with trusted enrichment
          classes — making it simple, joyful, and accessible for every parent.
        </Text>
      </div>

      {/* Story */}
      <div className="about-story">
        <div className="about-story-inner">
          <Title level={2} className="about-section-title">
            Our Story
          </Title>
          <Text className="about-lead">
            At <strong>Junior Pass</strong>, we started with one question: why
            is it so hard for parents to find and book good enrichment classes?
            So we built the solution — an all-in-one platform connecting
            families with verified partners across Singapore.
          </Text>
          <Text className="about-lead">
            By curating a diverse range of activities, we empower parents to
            find the best opportunities that suit their children's unique
            interests and needs — while simplifying schedules and fostering
            meaningful connections.
          </Text>
          <div className="about-bullets">
            {bullets.map((b, i) => (
              <div key={i} className="about-bullet-item">
                <CheckCircleOutlined className="bullet-check" />
                <Text>{b}</Text>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Team */}
      <div className="about-team">
        <div className="about-team-inner">
          <Title level={2} className="about-section-title team-title">
            The people behind Junior Pass
          </Title>
          <Text className="about-team-subtitle">
            Passionate founders and developer committed to empowering families
          </Text>
          <Row gutter={[32, 32]} justify="center" className="team-row">
            {team.map((member, i) => (
              <Col key={i} xs={24} sm={12} md={8}>
                <div className="team-card">
                  <Avatar size={96} className={`team-avatar ${member.avatarClass}`}>
                    {member.initial}
                  </Avatar>
                  <Title level={4} className="team-name">
                    {member.name}
                  </Title>
                  <Text className="team-role">{member.role}</Text>
                  <Text className="team-quote">"{member.quote}"</Text>
                </div>
              </Col>
            ))}
          </Row>
        </div>
      </div>

      {/* Values */}
      <div className="about-values">
        <div className="about-values-inner">
          <Row gutter={[32, 32]} justify="center">
            {values.map((value, i) => (
              <Col key={i} xs={24} sm={8}>
                <div className="value-tile">
                  <div className="value-icon">{value.icon}</div>
                  <Text strong className="value-title">
                    {value.title}
                  </Text>
                  <Text type="secondary" className="value-description">
                    {value.description}
                  </Text>
                </div>
              </Col>
            ))}
          </Row>
        </div>
      </div>
    </div>
  );
};

export default AboutUs;
