import { useState, useEffect } from "react";
import {
  Button,
  Card,
  Col,
  Empty,
  Row,
  Spin,
  Tag,
  Typography,
  Modal,
  Input,
  Form,
  Divider,
} from "antd";
import {
  GiftOutlined,
  LinkOutlined,
  UserAddOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  MailOutlined,
  StarOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useUserContext } from "../UserContext";
import toast from "react-hot-toast";
import getBaseURL from "../../utils/config";
import "./Referrals.css";

const { Text, Title } = Typography;

const Referrals = () => {
  const { user } = useUserContext();
  const baseURL = getBaseURL();
  const [referralData, setReferralData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [form] = Form.useForm();

  const fetchReferralData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${baseURL}/referrals/my-referral`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        setReferralData(data);
      } else {
        toast.error("Failed to fetch referral data");
      }
    } catch (error) {
      console.error("Error fetching referral data:", error);
      toast.error("Error fetching referral data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchReferralData();
  }, [user]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(referralData?.referral_code);
      setCopied(true);
      toast.success("Referral code copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy code");
    }
  };

  const handleShareEmail = async (values) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${baseURL}/referrals/share-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: values.email,
          recipient_name: values.recipient_name,
        }),
      });
      if (response.ok) {
        toast.success("Invitation sent successfully!");
        setShareModalOpen(false);
        form.resetFields();
      } else {
        toast.error("Failed to send invitation");
      }
    } catch (error) {
      console.error("Error sharing via email:", error);
      toast.error("Error sending invitation");
    }
  };

  const getReferralLink = () =>
    `${window.location.origin}/register?referral_code=${referralData?.referral_code}`;

  const rewardAmount = referralData?.reward_amount || 50;

  const stats = referralData?.stats || {};

  const statItems = [
    {
      key: "total",
      icon: <UserAddOutlined />,
      value: stats.total_referrals || 0,
      label: "Total Invited",
      className: "total",
    },
    {
      key: "completed",
      icon: <CheckCircleOutlined />,
      value: stats.completed_referrals || 0,
      label: "Completed",
      className: "completed",
    },
    {
      key: "pending",
      icon: <ClockCircleOutlined />,
      value: stats.pending_referrals || 0,
      label: "Pending",
      className: "pending",
    },
    {
      key: "earned",
      icon: <GiftOutlined />,
      value: stats.total_credits_earned || 0,
      label: "Credits Earned",
      className: "earned",
    },
  ];

  return (
    <div className="referrals-page">
      {/* ── HEADER ── */}
      <div className="referrals-header">
        <div className="header-content">
          <div className="header-badge">
            <StarOutlined style={{ fontSize: 10 }} />
            Referral Program
          </div>
          <Title level={3} className="page-title">
            Earn Credits, Share the Love 🎁
          </Title>
          <Text className="page-subtitle">
            Invite friends to Junior Pass — both of you get rewarded
          </Text>
        </div>
      </div>

      <Spin spinning={loading}>
        {referralData && (
          <>
            {/* ── REFERRAL CODE + INVITE ── */}
            <Card className="referral-stats-card" bordered={false}>
              <Row gutter={[32, 28]} align="middle">
                <Col xs={24} md={13}>
                  <div className="referral-code-section">
                    <div className="code-label">
                      <LinkOutlined />
                      Your Referral Code
                    </div>
                    <div className="code-display" onClick={handleCopyCode}>
                      <span className="code-value">
                        {referralData.referral_code}
                      </span>
                      <Button
                        type="text"
                        icon={
                          copied ? (
                            <CheckCircleOutlined
                              style={{ fontSize: 17, color: "#0ecb81" }}
                            />
                          ) : (
                            <CopyOutlined style={{ fontSize: 17 }} />
                          )
                        }
                        className="copy-button"
                        title="Copy code"
                      />
                    </div>
                    <Text className="code-hint">
                      ✦ Click the code to copy &amp; share with friends
                    </Text>
                  </div>
                </Col>

                <Col xs={24} md={11}>
                  <div className="referral-actions">
                    <Button
                      className="invite-button"
                      icon={
                        <MailOutlined
                          style={{ marginRight: 6, fontSize: 16 }}
                        />
                      }
                      size="large"
                      onClick={() => setShareModalOpen(true)}
                      block
                    >
                      Invite Friends via Email
                    </Button>
                    <div className="invite-note">
                      <ThunderboltOutlined
                        style={{ color: "#f7b731", fontSize: 13 }}
                      />
                      Both you &amp; your friend earn {rewardAmount} credits
                    </div>
                  </div>
                </Col>
              </Row>
            </Card>

            {/* ── STATS ── */}
            <Row gutter={[14, 14]} className="stats-row">
              {statItems.map((s) => (
                <Col xs={12} sm={12} md={6} key={s.key}>
                  <Card className="stat-card referral-stat" bordered={false}>
                    <div className={`stat-icon ${s.className}`}>{s.icon}</div>
                    <div className="stat-content">
                      <div className="stat-value">{s.value}</div>
                      <div className="stat-label">{s.label}</div>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>

            {/* ── REFERRAL LIST ── */}
            <Card className="referrals-list-card" bordered={false}>
              <div className="list-header">
                <Title level={5} className="section-title">
                  <span className="section-title-icon">
                    <UserAddOutlined />
                  </span>
                  Recent Referrals
                </Title>
                {referralData.recent_referrals?.length > 0 && (
                  <Tag
                    color="blue"
                    style={{ borderRadius: 100, fontWeight: 600 }}
                  >
                    {referralData.recent_referrals.length} total
                  </Tag>
                )}
              </div>

              {!referralData.recent_referrals ||
              referralData.recent_referrals.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🤝</div>
                  <Text
                    style={{
                      fontWeight: 600,
                      fontSize: 15,
                      color: "#1a2744",
                    }}
                  >
                    No referrals yet
                  </Text>
                  <Text style={{ color: "#aab2c0", fontSize: 13 }}>
                    Share your code to start earning rewards!
                  </Text>
                  <Button
                    style={{
                      marginTop: 8,
                      borderRadius: 10,
                      fontWeight: 600,
                      borderColor: "#2d3f7a",
                      color: "#2d3f7a",
                    }}
                    onClick={() => setShareModalOpen(true)}
                  >
                    Send First Invite
                  </Button>
                </div>
              ) : (
                <div className="referrals-list">
                  {referralData.recent_referrals.map((referral) => (
                    <div className="referral-item" key={referral.id}>
                      <div className="referral-info">
                        <div className="referral-header">
                          <span>{referral.referee_name}</span>
                          <Tag
                            color={
                              referral.status === "completed"
                                ? "success"
                                : "warning"
                            }
                            icon={
                              referral.status === "completed" ? (
                                <CheckCircleOutlined />
                              ) : (
                                <ClockCircleOutlined />
                              )
                            }
                            style={{ textTransform: "capitalize" }}
                          >
                            {referral.status}
                          </Tag>
                        </div>
                        <div className="referral-email">
                          {referral.referee_email}
                        </div>
                      </div>
                      <div className="referral-reward">
                        <div className="reward-amount">
                          <GiftOutlined />+{rewardAmount} credits
                        </div>
                        <div className="reward-date">
                          {new Date(referral.created_at).toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric", year: "numeric" },
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* ── HOW IT WORKS ── */}
            {/* How it Works */}
            <Card className="how-it-works-card" bordered={false}>
              {/* Header row */}
              <div className="hiw-header">
                <Title level={4} className="hiw-title">
                  <GiftOutlined style={{ fontSize: 22 }} />
                  How It Works
                </Title>
                <span className="hiw-reward-pill">
                  🎁 {rewardAmount} credits each
                </span>
              </div>

              {/* Timeline grid */}
              <div className="steps-timeline">
                <div className="step">
                  <div className="step-icon-wrap">
                    <div className="step-emoji-icon">🔗</div>
                    <div className="step-number-badge">1</div>
                  </div>
                  <div className="step-content">
                    <span>Share Your Code</span>
                    <span>Copy your referral code or send an email invite</span>
                  </div>
                </div>

                <div className="step-connector">›</div>

                <div className="step">
                  <div className="step-icon-wrap">
                    <div className="step-emoji-icon">✍️</div>
                    <div className="step-number-badge">2</div>
                  </div>
                  <div className="step-content">
                    <span>Friend Signs Up</span>
                    <span>They use your code during registration</span>
                  </div>
                </div>

                <div className="step-connector">›</div>

                <div className="step">
                  <div className="step-icon-wrap">
                    <div className="step-emoji-icon">💳</div>
                    <div className="step-number-badge">3</div>
                  </div>
                  <div className="step-content">
                    <span>First Top-Up</span>
                    <span>Your friend completes their first payment</span>
                  </div>
                </div>

                <div className="step-connector">›</div>

                <div className="step">
                  <div className="step-icon-wrap">
                    <div className="step-emoji-icon">🏆</div>
                    <div className="step-number-badge">4</div>
                  </div>
                  <div className="step-content">
                    <span>Both Earn Credits</span>
                    <span>You and your friend each get 100 bonus credits</span>
                  </div>
                </div>
              </div>
            </Card>
          </>
        )}
      </Spin>

      {/* ── INVITE MODAL ── */}
      <Modal
        title={
          <span
            style={{
              fontFamily: "'Sora', sans-serif",
              fontWeight: 700,
              fontSize: 17,
              color: "#1a2744",
            }}
          >
            Invite a Friend 🎁
          </span>
        }
        open={shareModalOpen}
        onCancel={() => {
          setShareModalOpen(false);
          form.resetFields();
        }}
        footer={null}
        centered
        styles={{
          content: { borderRadius: 18, overflow: "hidden" },
          header: { paddingBottom: 0 },
        }}
      >
        <p
          style={{
            fontSize: 13,
            color: "#8892a4",
            marginTop: 4,
            marginBottom: 20,
          }}
        >
          We'll send them a personalised invite with your referral code.
        </p>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleShareEmail}
          className="share-form"
        >
          <Form.Item
            label="Friend's Name"
            name="recipient_name"
            rules={[
              { required: true, message: "Please enter your friend's name" },
            ]}
          >
            <Input placeholder="Jane Doe" size="large" />
          </Form.Item>

          <Form.Item
            label="Friend's Email"
            name="email"
            rules={[
              { required: true, message: "Please enter an email address" },
              { type: "email", message: "Please enter a valid email" },
            ]}
          >
            <Input placeholder="jane@example.com" size="large" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              className="modal-submit-btn"
            >
              Send Invitation
            </Button>
          </Form.Item>
        </Form>

        <Divider style={{ margin: "20px 0" }}>
          <Text style={{ fontSize: 11, color: "#aab2c0", fontWeight: 600 }}>
            OR SHARE A LINK
          </Text>
        </Divider>

        <div className="share-link-section">
          <Text style={{ fontSize: 12, fontWeight: 600, color: "#8892a4" }}>
            Referral link:
          </Text>
          <div className="share-link">
            <Input value={getReferralLink()} readOnly size="small" />
            <Button
              icon={<CopyOutlined />}
              style={{ borderRadius: 10, flexShrink: 0 }}
              onClick={() => {
                navigator.clipboard.writeText(getReferralLink());
                toast.success("Link copied!");
              }}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Referrals;
