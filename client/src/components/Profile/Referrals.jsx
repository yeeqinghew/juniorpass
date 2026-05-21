import { useState, useEffect } from "react";
import {
  Button,
  Card,
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
import { fetchWithAuth, API_ENDPOINTS } from "../../utils/api";
import "./Referrals.css";

const { Text, Title } = Typography;

const Referrals = () => {
  const { user } = useUserContext();
  const [referralData, setReferralData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [form] = Form.useForm();

  const fetchReferralData = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(API_ENDPOINTS.MY_REFERRAL);
      if (res.ok) setReferralData(await res.json());
      else toast.error("Failed to fetch referral data");
    } catch {
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
      toast.success("Code copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleShareEmail = async (values) => {
    try {
      const res = await fetchWithAuth(API_ENDPOINTS.SHARE_REFERRAL_EMAIL, {
        method: "POST",
        body: JSON.stringify({
          email: values.email,
          recipient_name: values.recipient_name,
        }),
      });
      if (res.ok) {
        toast.success("Invitation sent!");
        setShareModalOpen(false);
        form.resetFields();
      } else toast.error("Failed to send invitation");
    } catch {
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
      color: "primary",
    },
    {
      key: "completed",
      icon: <CheckCircleOutlined />,
      value: stats.completed_referrals || 0,
      label: "Completed",
      color: "success",
    },
    {
      key: "pending",
      icon: <ClockCircleOutlined />,
      value: stats.pending_referrals || 0,
      label: "Pending",
      color: "warning",
    },
    {
      key: "earned",
      icon: <GiftOutlined />,
      value: stats.total_credits_earned || 0,
      label: "Credits Earned",
      color: "purple",
    },
  ];

  const steps = [
    {
      emoji: "🔗",
      num: 1,
      name: "Share Your Code",
      desc: "Copy your code or send an email invite",
    },
    {
      emoji: "✍️",
      num: 2,
      name: "Friend Signs Up",
      desc: "They use your code during registration",
    },
    {
      emoji: "💳",
      num: 3,
      name: "First Top-Up",
      desc: "Your friend completes their first payment",
    },
    {
      emoji: "🏆",
      num: 4,
      name: "Both Earn Credits",
      desc: `You and your friend each get ${rewardAmount} credits`,
    },
  ];

  return (
    <div className="rf-page fade-in">
      {/* Header */}
      <div className="rf-header">
        <div className="rf-header-badge">
          <StarOutlined style={{ fontSize: 10 }} /> Referral Program
        </div>
        <h2 className="rf-page-title">Earn Credits, Share the Love 🎁</h2>
        <p className="rf-page-sub">
          Invite friends to Junior Pass — both of you get rewarded
        </p>
      </div>

      <Spin spinning={loading}>
        {referralData && (
          <>
            {/* ── Referral code card — plain flex, NO Row/Col ── */}
            <Card className="rf-code-card" bordered={false}>
              <div className="rf-code-inner">
                <div className="rf-code-left">
                  <div className="rf-code-label">
                    <LinkOutlined /> Your Referral Code
                  </div>
                  <div className="rf-code-display" onClick={handleCopyCode}>
                    <span className="rf-code-value">
                      {referralData.referral_code}
                    </span>
                    <Button
                      type="text"
                      icon={
                        copied ? (
                          <CheckCircleOutlined
                            style={{
                              fontSize: 16,
                              color: "var(--success-color)",
                            }}
                          />
                        ) : (
                          <CopyOutlined style={{ fontSize: 16 }} />
                        )
                      }
                      className="rf-copy-btn"
                      title="Copy code"
                    />
                  </div>
                  <span className="rf-code-hint">
                    ✦ Click the code to copy &amp; share with friends
                  </span>
                </div>

                <div className="rf-code-right">
                  <Button
                    type="primary"
                    icon={<MailOutlined />}
                    size="large"
                    onClick={() => setShareModalOpen(true)}
                    className="rf-invite-btn"
                    block
                  >
                    Invite Friends via Email
                  </Button>
                  <div className="rf-invite-note">
                    <ThunderboltOutlined
                      style={{ color: "var(--warning-color)", fontSize: 13 }}
                    />
                    Both you &amp; your friend earn {rewardAmount} credits
                  </div>
                </div>
              </div>
            </Card>

            {/* ── Stats — CSS grid, NO Row/Col ── */}
            <div className="rf-stats-grid">
              {statItems.map((s) => (
                <div className="rf-stat-card" key={s.key}>
                  <div className={`rf-stat-icon ${s.color}`}>{s.icon}</div>
                  <div>
                    <span className="rf-stat-value">{s.value}</span>
                    <span className="rf-stat-label">{s.label}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Referral list ── */}
            <Card className="rf-list-card" bordered={false}>
              <div className="rf-list-head">
                <Title level={5} className="rf-list-title">
                  <span className="rf-list-title-icon">
                    <UserAddOutlined />
                  </span>{" "}
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

              {!referralData.recent_referrals?.length ? (
                <div className="rf-empty">
                  <div className="rf-empty-icon">🤝</div>
                  <Text
                    style={{
                      fontWeight: 600,
                      fontSize: 15,
                      color: "var(--text-primary)",
                    }}
                  >
                    No referrals yet
                  </Text>
                  <Text
                    style={{ color: "var(--text-secondary)", fontSize: 13 }}
                  >
                    Share your code to start earning!
                  </Text>
                  <Button
                    style={{
                      marginTop: 8,
                      borderRadius: "var(--border-radius)",
                    }}
                    onClick={() => setShareModalOpen(true)}
                  >
                    Send First Invite
                  </Button>
                </div>
              ) : (
                <div className="rf-list-body">
                  {referralData.recent_referrals.map((r) => (
                    <div className="rf-referral-item" key={r.id}>
                      <div className="rf-referral-info">
                        <div className="rf-referral-row">
                          <span className="rf-referral-name">
                            {r.referee_name}
                          </span>
                          <Tag
                            color={
                              r.status === "completed" ? "success" : "warning"
                            }
                            icon={
                              r.status === "completed" ? (
                                <CheckCircleOutlined />
                              ) : (
                                <ClockCircleOutlined />
                              )
                            }
                            style={{
                              borderRadius: 100,
                              fontSize: 11,
                              fontWeight: 600,
                              textTransform: "capitalize",
                            }}
                          >
                            {r.status}
                          </Tag>
                        </div>
                        <span className="rf-referral-email">
                          {r.referee_email}
                        </span>
                      </div>
                      <div className="rf-referral-reward">
                        <div className="rf-reward-amount">
                          <GiftOutlined />+{rewardAmount} credits
                        </div>
                        <div className="rf-reward-date">
                          {new Date(r.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* ── How it works ── */}
            <Card className="rf-hiw-card" bordered={false}>
              <div className="rf-hiw-head">
                <Title level={4} className="rf-hiw-title">
                  <GiftOutlined /> How It Works
                </Title>
                <span className="rf-hiw-pill">
                  🎁 {rewardAmount} credits each
                </span>
              </div>

              {/* Steps — CSS grid, NO Row/Col */}
              <div className="rf-steps">
                {steps.map((step, i) => (
                  <>
                    <div className="rf-step" key={step.num}>
                      <div className="rf-step-icon-wrap">
                        <div className="rf-step-icon">{step.emoji}</div>
                        <div className="rf-step-num">{step.num}</div>
                      </div>
                      <div>
                        <div className="rf-step-name">{step.name}</div>
                        <div className="rf-step-desc">{step.desc}</div>
                      </div>
                    </div>
                    {i < 3 && (
                      <div className="rf-step-arrow" key={`a${i}`}>
                        ›
                      </div>
                    )}
                  </>
                ))}
              </div>
            </Card>
          </>
        )}
      </Spin>

      {/* ── Invite modal ── */}
      <Modal
        title={
          <span
            style={{
              fontWeight: 700,
              fontSize: 17,
              color: "var(--text-primary)",
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
        className="rf-modal"
        styles={{
          content: {
            borderRadius: "var(--border-radius-lg)",
            overflow: "hidden",
          },
        }}
      >
        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
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
          className="rf-share-form"
        >
          <Form.Item
            label="Friend's Name"
            name="recipient_name"
            rules={[{ required: true, message: "Name required" }]}
          >
            <Input placeholder="Jane Doe" size="large" />
          </Form.Item>
          <Form.Item
            label="Friend's Email"
            name="email"
            rules={[
              { required: true, message: "Email required" },
              { type: "email", message: "Invalid email" },
            ]}
          >
            <Input placeholder="jane@example.com" size="large" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              style={{
                height: 44,
                borderRadius: "var(--border-radius)",
                fontWeight: 600,
              }}
            >
              Send Invitation
            </Button>
          </Form.Item>
        </Form>

        <Divider style={{ margin: "20px 0" }}>
          <Text
            style={{
              fontSize: 11,
              color: "var(--text-secondary)",
              fontWeight: 600,
            }}
          >
            OR SHARE A LINK
          </Text>
        </Divider>

        <div className="rf-share-link-block">
          <Text
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-secondary)",
            }}
          >
            Referral link:
          </Text>
          <div className="rf-share-link-row">
            <Input value={getReferralLink()} readOnly size="small" />
            <Button
              icon={<CopyOutlined />}
              style={{ borderRadius: "var(--border-radius)", flexShrink: 0 }}
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
