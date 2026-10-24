import { Card, Typography } from "antd";
import type { ReactNode } from "react";
import "./InfoCard.css";

const { Text, Title } = Typography;

type InfoCardProps = {
  icon: ReactNode;
  title: string;
  description: string;
  hovered: boolean;
  onHover: () => void;
  onLeave: () => void;
};

function InfoCard({
  icon,
  title,
  description,
  hovered,
  onHover,
  onLeave,
}: InfoCardProps) {
  return (
    <Card
      hoverable
      className={`info-card ${hovered ? 'info-card--hovered' : ''}`}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      bodyStyle={{}}
    >
      <div className="info-card__body">
        {/* Gradient overlay that appears on hover */}
        <div className="info-card__overlay" />

        {/* Icon with enhanced animation */}
        <div className="info-card__icon">
          {/* Icon glow effect */}
          <div className="info-card__icon-glow" />
          {icon}
        </div>

        <Title level={3} className="info-card__title">
          {title}
        </Title>

        <Text className="info-card__description">
          {description}
        </Text>
      </div>
    </Card>
  );
}

export default InfoCard;
