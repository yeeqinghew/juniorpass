import { Button, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import "./index.css";

const { Title, Text } = Typography;

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="nf-page">
      {/* Decorative background orbs */}
      <div className="nf-orb nf-orb--blue" />
      <div className="nf-orb nf-orb--pink" />
      <div className="nf-orb nf-orb--blue-sm" />

      {/* Floating stars */}
      <div className="nf-stars" aria-hidden="true">
        {[...Array(6)].map((_, i) => (
          <span key={i} className={`nf-star nf-star--${i + 1}`}>✦</span>
        ))}
      </div>

      <div className="nf-content">
        {/* Giant 404 number — purely decorative behind content */}
        <div className="nf-giant" aria-hidden="true">404</div>

        <div className="nf-card">
          <div className="nf-emoji">🗺️</div>

          <Title className="nf-title">
            Lost in space?
          </Title>

          <div className="nf-divider">
            <span className="nf-divider-line" />
            <span className="nf-divider-dot">✦</span>
            <span className="nf-divider-line" />
          </div>

          <Text className="nf-subtitle">
            The page you're looking for has wandered off the map.
            Don't worry — we'll get you back to safety.
          </Text>

          <div className="nf-actions">
            <Button
              type="primary"
              size="large"
              className="nf-btn-primary"
              onClick={() => navigate("/")}
            >
              🏠 Back to Home
            </Button>
            <Button
              size="large"
              className="nf-btn-ghost"
              onClick={() => navigate(-1)}
            >
              ← Go Back
            </Button>
          </div>

          <Text className="nf-hint">
            Error code <strong>404</strong> · Page not found
          </Text>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
