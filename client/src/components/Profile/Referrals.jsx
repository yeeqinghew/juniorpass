import { useEffect, useState } from "react";
import {
  Button,
  Divider,
  Form,
  Input,
  Modal,
  Spin,
  Tag,
  Typography,
} from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  GiftOutlined,
  LinkOutlined,
  MailOutlined,
  StarOutlined,
  ThunderboltOutlined,
  UserAddOutlined,
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

  const copyToClipboard = async (text, message) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(message);
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
      } else {
        toast.error("Failed to send invitation");
      }
    } catch {
      toast.error("Error sending invitation");
    }
  };

  const closeShareModal = () => {
    setShareModalOpen(false);
    form.resetFields();
  };

  const rewardAmount = referralData?.reward_amount || 50;
  const stats = referralData?.stats || {};
  const referralLink = `${window.location.origin}/register?referral_code=${referralData?.referral_code || ""}`;

  const statItems = [
    {
      key: "total",
      icon: <UserAddOutlined />,
      value: stats.total_referrals || 0,
      label: "Friends invited",
      color: "primary",
    },
    {
      key: "completed",
      icon: <CheckCircleOutlined />,
      value: stats.completed_referrals || 0,
      label: "Rewards unlocked",
      color: "success",
    },
    {
      key: "pending",
      icon: <ClockCircleOutlined />,
      value: stats.pending_referrals || 0,
      label: "Awaiting top-up",
      color: "warning",
    },
    {
      key: "earned",
      icon: <GiftOutlined />,
      value: stats.total_credits_earned || 0,
      label: "Credits earned",
      color: "reward",
    },
  ];

  const steps = [
    {
      icon: <LinkOutlined />,
      name: "Share your invite",
      desc: "Send your code or referral link to a friend.",
    },
    {
      icon: <UserAddOutlined />,
      name: "Your friend joins",
      desc: "They register for JuniorPASS using your code.",
    },
    {
      icon: <ThunderboltOutlined />,
      name: "They make a top-up",
      desc: "The reward unlocks after their first completed payment.",
    },
    {
      icon: <GiftOutlined />,
      name: "You both earn credits",
      desc: `${rewardAmount} credits are added to each account.`,
    },
  ];

  return (
    <div className="rf-page fade-in">
      <div className="rf-page-header">
        <div>
          <Title level={3} className="rf-page-title">
            <StarOutlined /> Referrals
          </Title>
          <Text className="rf-page-sub">
            Invite friends to JuniorPASS and earn credits together.
          </Text>
        </div>
        <span className="rf-reward-chip">
          <GiftOutlined /> {rewardAmount} credits each
        </span>
      </div>

      <Spin spinning={loading}>
        {referralData && (
          <>
            <section className="rf-hero">
              <div className="rf-hero-copy">
                <span className="rf-hero-kicker">
                  <ThunderboltOutlined /> Refer and earn
                </span>
                <h3>Give {rewardAmount}. Get {rewardAmount}.</h3>
                <p>
                  Your friend receives {rewardAmount} credits after their first
                  top-up, and the same reward is added to your wallet.
                </p>

                <div className="rf-benefits">
                  <span>
                    <CheckCircleOutlined /> No limit on invitations
                  </span>
                  <span>
                    <CheckCircleOutlined /> Rewards are added automatically
                  </span>
                </div>
              </div>

              <div className="rf-share-panel">
                <div className="rf-share-label">Your referral code</div>
                <button
                  type="button"
                  className={`rf-code-button ${copied ? "copied" : ""}`}
                  onClick={() =>
                    copyToClipboard(referralData.referral_code, "Code copied!")
                  }
                >
                  <span className="rf-code-value">
                    {referralData.referral_code}
                  </span>
                  <span className="rf-code-copy">
                    {copied ? <CheckCircleOutlined /> : <CopyOutlined />}
                    {copied ? "Copied" : "Copy"}
                  </span>
                </button>

                <Button
                  type="primary"
                  icon={<MailOutlined />}
                  onClick={() => setShareModalOpen(true)}
                  className="profile-action-btn rf-invite-btn"
                  block
                >
                  Invite friends via email
                </Button>

                <button
                  type="button"
                  className="rf-copy-link-btn"
                  onClick={() =>
                    copyToClipboard(referralLink, "Referral link copied!")
                  }
                >
                  <LinkOutlined /> Copy referral link
                </button>
              </div>
            </section>

            <div className="rf-stats-grid">
              {statItems.map((item) => (
                <div className="rf-stat-card" key={item.key}>
                  <div className={`rf-stat-icon ${item.color}`}>
                    {item.icon}
                  </div>
                  <div>
                    <span className="rf-stat-value">{item.value}</span>
                    <span className="rf-stat-label">{item.label}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="rf-content-grid">
              <section className="rf-panel rf-referrals-panel">
                <div className="rf-panel-header">
                  <div>
                    <span className="rf-panel-eyebrow">Activity</span>
                    <h4>Recent referrals</h4>
                  </div>
                  {referralData.recent_referrals?.length > 0 && (
                    <span className="rf-count-pill">
                      {referralData.recent_referrals.length} total
                    </span>
                  )}
                </div>

                {!referralData.recent_referrals?.length ? (
                  <div className="rf-empty">
                    <span className="rf-empty-icon">
                      <UserAddOutlined />
                    </span>
                    <h5>Your first reward starts here</h5>
                    <p>Invite a friend and track their progress in this space.</p>
                    <Button
                      type="primary"
                      icon={<MailOutlined />}
                      className="profile-action-btn rf-empty-action"
                      onClick={() => setShareModalOpen(true)}
                    >
                      Send first invite
                    </Button>
                  </div>
                ) : (
                  <div className="rf-list-body">
                    {referralData.recent_referrals.map((referral) => (
                      <div
                        className="rf-referral-item"
                        key={referral.id || referral.referee_email}
                      >
                        <span className="rf-referral-avatar">
                          {referral.referee_name?.charAt(0)?.toUpperCase() || "?"}
                        </span>
                        <div className="rf-referral-info">
                          <div className="rf-referral-row">
                            <span className="rf-referral-name">
                              {referral.referee_name}
                            </span>
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
                              className="rf-status-tag"
                            >
                              {referral.status}
                            </Tag>
                          </div>
                          <span className="rf-referral-email">
                            {referral.referee_email}
                          </span>
                        </div>
                        <div className="rf-referral-reward">
                          <strong
                            className={
                              referral.status === "completed" ? "" : "pending"
                            }
                          >
                            {referral.status === "completed" ? (
                              <>
                                <GiftOutlined /> +{rewardAmount}
                              </>
                            ) : (
                              <>
                                <ClockCircleOutlined /> Awaiting top-up
                              </>
                            )}
                          </strong>
                          <span>
                            {new Date(referral.created_at).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              },
                            )}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <aside className="rf-panel rf-how-panel">
                <div className="rf-panel-header">
                  <div>
                    <span className="rf-panel-eyebrow">Four simple steps</span>
                    <h4>How it works</h4>
                  </div>
                </div>

                <div className="rf-timeline">
                  {steps.map((step, index) => (
                    <div className="rf-step" key={step.name}>
                      <div className="rf-step-marker">
                        <span>{step.icon}</span>
                        <small>{index + 1}</small>
                      </div>
                      <div>
                        <h5>{step.name}</h5>
                        <p>{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          </>
        )}
      </Spin>

      <Modal
        title={null}
        open={shareModalOpen}
        onCancel={closeShareModal}
        footer={null}
        width={480}
        centered
        className="rf-modal"
      >
        <div className="rf-modal-heading">
          <span className="rf-modal-icon">
            <MailOutlined />
          </span>
          <div>
            <h3>Invite a friend</h3>
            <p>We’ll email them your personal JuniorPASS invitation.</p>
          </div>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleShareEmail}
          className="rf-share-form"
        >
          <Form.Item
            label="Friend’s name"
            name="recipient_name"
            rules={[{ required: true, message: "Name required" }]}
          >
            <Input placeholder="Jane Doe" size="large" />
          </Form.Item>
          <Form.Item
            label="Friend’s email"
            name="email"
            rules={[
              { required: true, message: "Email required" },
              { type: "email", message: "Invalid email" },
            ]}
          >
            <Input placeholder="jane@example.com" size="large" />
          </Form.Item>
          <Form.Item className="rf-modal-submit-item">
            <Button
              type="primary"
              htmlType="submit"
              block
              className="rf-modal-submit"
            >
              Send invitation
            </Button>
          </Form.Item>
        </Form>

        <Divider className="rf-modal-divider">Or share a link</Divider>

        <div className="rf-share-link-block">
          <span>Referral link</span>
          <div className="rf-share-link-row">
            <Input value={referralLink} readOnly />
            <Button
              icon={<CopyOutlined />}
              aria-label="Copy referral link"
              onClick={() =>
                copyToClipboard(referralLink, "Referral link copied!")
              }
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Referrals;
