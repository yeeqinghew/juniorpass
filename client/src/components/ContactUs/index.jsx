import { Form, Input, Typography, Button, Card, Row, Col, Tag } from "antd";
import {
  SendOutlined,
  UserOutlined,
  MailOutlined,
  BankOutlined,
  RocketOutlined,
  TeamOutlined,
  TrophyOutlined,
  CheckCircleOutlined,
  StarFilled,
  HeartFilled,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { fetchWithAuth, API_ENDPOINTS } from "../../utils/api";
import toast from "react-hot-toast";
import "./index.css";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const ContactUs = () => {
  const [contactUsForm] = Form.useForm();

  const handleContactUs = async (values) => {
    try {
      const response = await fetchWithAuth(API_ENDPOINTS.PARTNER_FORM, {
        method: "POST",
        body: JSON.stringify(values),
      });
      const parseRes = await response.json();

      if (response.ok && parseRes.message) {
        toast.success(parseRes.message);
        contactUsForm.resetFields();
      }
    } catch (error) {
      console.error(error.message);
      toast.error(error.message);
    }
  };

  const benefits = [
    {
      icon: <TeamOutlined className="benefit-icon" />,
      title: "Reach More Families",
      description:
        "Connect with thousands of parents actively searching for quality enrichment classes",
      colorClass: "benefit-icon-primary",
    },
    {
      icon: <RocketOutlined className="benefit-icon" />,
      title: "Grow Your Business",
      description:
        "Increase bookings, fill empty slots, and expand your customer base effortlessly",
      colorClass: "benefit-icon-success",
    },
    {
      icon: <TrophyOutlined className="benefit-icon" />,
      title: "Build Your Brand",
      description:
        "Showcase your classes with beautiful listings and collect verified reviews",
      colorClass: "benefit-icon-gold",
    },
  ];

  const stats = [
    {
      number: "100+",
      label: "Partner Centers",
      icon: <SafetyCertificateOutlined />,
    },
    { number: "10K+", label: "Happy Families", icon: <HeartFilled /> },
    { number: "4.9", label: "Average Rating", icon: <StarFilled /> },
  ];

  return (
    <div className="contact-page">
      {/* Decorative elements */}
      <div className="contact-decoration contact-decoration-1"></div>
      <div className="contact-decoration contact-decoration-2"></div>

      <div className="contact-container">
        <Row gutter={[48, 32]} align="stretch">
          {/* Left Side - Info */}
          <Col xs={24} lg={12}>
            <div className="contact-info-section">
              <Tag color="gold" className="partner-badge">
                <StarFilled /> Become a Partner
              </Tag>

              <Title level={1} className="contact-title">
                Grow Your Business With{" "}
                <span className="highlight-text">Junior Pass</span>
              </Title>

              <Paragraph className="contact-subtitle">
                Join Singapore's fastest-growing platform for children's
                enrichment classes. We help you reach more families and fill
                your classes.
              </Paragraph>

              {/* Stats Row */}
              <div className="stats-row">
                {stats.map((stat, index) => (
                  <div key={index} className="stat-item">
                    <div className="stat-icon">{stat.icon}</div>
                    <div className="stat-number">{stat.number}</div>
                    <div className="stat-label">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Benefits */}
              <div className="benefits-list">
                {benefits.map((benefit, index) => (
                  <div key={index} className="benefit-item">
                    <div
                      className={`benefit-icon-wrapper ${benefit.colorClass}`}
                    >
                      {benefit.icon}
                    </div>
                    <div className="benefit-content">
                      <Text strong className="benefit-title">
                        {benefit.title}
                      </Text>
                      <Text className="benefit-description">
                        {benefit.description}
                      </Text>
                    </div>
                  </div>
                ))}
              </div>

              {/* Trust badges */}
              <div className="trust-badges">
                <div className="trust-badge">
                  <CheckCircleOutlined className="trust-check" />
                  <span>Free to Join</span>
                </div>
                <div className="trust-badge">
                  <CheckCircleOutlined className="trust-check" />
                  <span>No Hidden Fees</span>
                </div>
                <div className="trust-badge">
                  <CheckCircleOutlined className="trust-check" />
                  <span>12/7 Support</span>
                </div>
              </div>
            </div>
          </Col>

          {/* Right Side - Form */}
          <Col xs={24} lg={12}>
            <Card className="contact-form-card" bordered={false}>
              <div className="form-header">
                <div className="form-icon-wrapper">
                  <SendOutlined className="form-icon" />
                </div>
                <Title level={3} className="form-title">
                  Get Started Today
                </Title>
                <Text className="form-subtitle">
                  Fill out the form and our team will reach out within 24 hours
                </Text>
              </div>

              <Form
                form={contactUsForm}
                layout="vertical"
                className="contact-form"
                onFinish={handleContactUs}
              >
                <Form.Item
                  name="companyName"
                  label={<Text strong>Company Name</Text>}
                  rules={[
                    {
                      required: true,
                      message: "Please enter your company name",
                    },
                  ]}
                >
                  <Input
                    prefix={<BankOutlined className="input-icon" />}
                    placeholder="Your company name"
                    size="large"
                    className="contact-input"
                  />
                </Form.Item>

                <Form.Item
                  name="companyPersonName"
                  label={<Text strong>Contact Person</Text>}
                  rules={[
                    { required: true, message: "Please enter a contact name" },
                  ]}
                >
                  <Input
                    prefix={<UserOutlined className="input-icon" />}
                    placeholder="Your name"
                    size="large"
                    className="contact-input"
                  />
                </Form.Item>

                <Form.Item
                  name="email"
                  label={<Text strong>Email Address</Text>}
                  rules={[
                    { required: true, message: "Please enter your email" },
                    { type: "email", message: "Please enter a valid email" },
                  ]}
                >
                  <Input
                    prefix={<MailOutlined className="input-icon" />}
                    placeholder="your@email.com"
                    size="large"
                    className="contact-input"
                  />
                </Form.Item>

                <Form.Item
                  name="message"
                  label={<Text strong>Message</Text>}
                  rules={[
                    { required: true, message: "Please enter your message" },
                  ]}
                >
                  <TextArea
                    rows={5}
                    placeholder="Tell us about your business, what classes you offer, and how we can help..."
                    className="contact-textarea"
                  />
                </Form.Item>

                <Form.Item className="submit-wrapper">
                  <Button
                    type="primary"
                    size="large"
                    htmlType="submit"
                    className="contact-submit-btn"
                    icon={<SendOutlined />}
                  >
                    Send Message
                  </Button>
                </Form.Item>

                <div className="form-footer">
                  <Text type="secondary" className="form-footer-text">
                    🔒 Your information is secure and will never be shared
                  </Text>
                </div>
              </Form>
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
};

export default ContactUs;
