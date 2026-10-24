import { useState, useEffect } from "react";
import {
  Modal,
  Select,
  Space,
  Typography,
  Button,
  Row,
  Col,
  Radio,
  Card,
  Tag,
  Alert,
  Spin,
  Divider,
  Statistic,
} from "antd";
import {
  EnvironmentOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import toast from "react-hot-toast";
import "./BuyNowPackages.css";
import Map, { Marker } from "react-map-gl";
import { fetchWithAuth } from "../../utils/api";
import type { UserProfile } from "../../types/user";

const { Text, Title } = Typography;

type Child = {
  child_id: string | number;
  name: string;
  age?: number | string;
};

type SelectedClass = {
  selectedDate?: string;
  timeRange?: string;
  location?: {
    schedule_id?: string | number;
    timeslot?: string[];
    outlet_address?: string;
  };
};

type PackagePricing = {
  totalPrice: number;
  totalClasses: number;
};

type PackageAvailability = {
  canBook: boolean;
  reason?: string;
};

type PackageEligibility = {
  eligibility: Record<string, PackageAvailability>;
  pricing: Record<string, PackagePricing>;
};

type OutletAddress = {
  SEARCHVAL?: string;
  LONGITUDE?: number;
  LATITUDE?: number;
};

type BuyNowWithPackagesProps = {
  isBuyNowModalOpen: boolean;
  setIsBuyNowModalOpen: (open: boolean) => void;
  selected?: SelectedClass | null;
  listing?: unknown;
  user?: UserProfile | null;
  children?: Child[];
  onBookingSuccess?: () => void;
};

const BuyNowWithPackages = ({
  isBuyNowModalOpen,
  setIsBuyNowModalOpen,
  selected,
  listing,
  user,
  children,
  onBookingSuccess,
}: BuyNowWithPackagesProps) => {
  void listing;
  const [selectedChildId, setSelectedChildId] = useState<string | number | null>(null);
  const [selectedPackageType, setSelectedPackageType] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingEligibility, setLoadingEligibility] = useState(false);
  const [packageEligibility, setPackageEligibility] =
    useState<PackageEligibility | null>(null);

  let outletAddress: OutletAddress = {};
  try {
    outletAddress = JSON.parse(
      selected?.location?.outlet_address || "{}",
    ) as OutletAddress;
  } catch {
    outletAddress = {};
  }

  // Fetch package eligibility when modal opens
  useEffect(() => {
    if (isBuyNowModalOpen && selected?.location?.schedule_id) {
      fetchPackageEligibility();
    }
  }, [isBuyNowModalOpen, selected?.location?.schedule_id]);

  const fetchPackageEligibility = async () => {
    const scheduleId = selected?.location?.schedule_id;
    if (!scheduleId) return;

    setLoadingEligibility(true);
    try {
      const response = await fetchWithAuth(
        `/packages/schedule/${scheduleId}/eligibility`,
      );

      if (response.ok) {
        const data = (await response.json()) as PackageEligibility;
        setPackageEligibility(data);

        // Auto-select first available package
        const availablePackages = Object.keys(data.eligibility).filter(
          (pkg) => data.eligibility[pkg].canBook,
        );
        if (availablePackages.length > 0) {
          setSelectedPackageType(availablePackages[0]);
        }
      } else {
        toast.error("Failed to load package options");
      }
    } catch (error) {
      console.error("Error fetching eligibility:", error);
      toast.error("Failed to load package options");
    } finally {
      setLoadingEligibility(false);
    }
  };

  const handleCancel = () => {
    setIsBuyNowModalOpen(false);
    setSelectedChildId(null);
    setSelectedPackageType(null);
    setPackageEligibility(null);
  };

  const handleBooking = async () => {
    // Validate selections
    if (!selectedChildId) {
      toast.error("Please select a child for this class");
      return;
    }

    if (!selectedPackageType) {
      toast.error("Please select a package type");
      return;
    }

    // Validate user has enough credits
    const packagePricing = packageEligibility?.pricing?.[selectedPackageType];
    if (!packagePricing) {
      toast.error("This package's credit cost is unavailable");
      return;
    }
    if (!user?.credit || user.credit < packagePricing.totalPrice) {
      toast.error("Insufficient credits. Please top up your account.");
      return;
    }

    setIsLoading(true);

    try {
      // Construct proper timestamp from selected date and time
      const selectedDateStr =
        selected?.selectedDate || new Date().toISOString().split("T")[0];
      const startTime = selected?.location?.timeslot?.[0];

      const start_date = `${selectedDateStr}T${startTime}:00`;

      const response = await fetchWithAuth("/packages/book", {
        method: "POST",
        body: JSON.stringify({
          schedule_id: selected?.location?.schedule_id,
          child_id: selectedChildId,
          package_type: selectedPackageType,
          start_date: start_date,
        }),
      });

      const data = (await response.json()) as { error?: string };

      if (response.ok) {
        toast.success(
          `Booking confirmed! ${
            selectedPackageType === "short-term"
              ? "Trial"
              : selectedPackageType === "full-term"
                ? "Package"
                : "Class"
          } has been added to your schedule.`,
        );
        setIsBuyNowModalOpen(false);
        setSelectedChildId(null);
        setSelectedPackageType(null);

        // Call parent callback to refresh data
        if (onBookingSuccess) {
          onBookingSuccess();
        }
      } else {
        toast.error(data.error || "Failed to create booking");
      }
    } catch (error) {
      console.error("Booking error:", error);
      toast.error("An error occurred while processing your booking");
    } finally {
      setIsLoading(false);
    }
  };

  const renderPackageOption = (
    packageType: string,
    packageData: {
      eligibility: PackageAvailability;
      pricing: PackagePricing;
    },
  ) => {
    const { canBook, reason } = packageData.eligibility;
    const pricing = packageData.pricing;

    if (!canBook) {
      return (
        <Card className="package-option-card disabled" key={packageType}>
          <div className="package-option-content">
            <Radio value={packageType} disabled>
              <Space direction="vertical" size={4}>
                <Text strong className="package-name">
                  {packageType === "full-term"
                    ? "Full-term Package"
                    : packageType === "short-term"
                      ? "Short-term Trial"
                      : "Pay-as-you-go"}
                </Text>
                <Text type="secondary" className="package-unavailable">
                  {reason}
                </Text>
              </Space>
            </Radio>
          </div>
        </Card>
      );
    }

    return (
      <Card
        className={`package-option-card ${
          selectedPackageType === packageType ? "selected" : ""
        }`}
        key={packageType}
        onClick={() => setSelectedPackageType(packageType)}
      >
        <div className="package-option-content">
          <Radio value={packageType}>
            <Space direction="vertical" size={8} className="package-full-width">
              <div className="package-header">
                <Text strong className="package-name">
                  {packageType === "full-term"
                    ? "Full-term Package"
                    : packageType === "short-term"
                      ? "Short-term Trial"
                      : "Pay-as-you-go"}
                </Text>
                {packageType === "full-term" && (
                  <Tag color="green" className="package-badge">
                    Best Value
                  </Tag>
                )}
                {packageType === "short-term" && (
                  <Tag color="blue" className="package-badge">
                    Try First
                  </Tag>
                )}
              </div>

              <div className="package-details">
                <Statistic
                  value={pricing.totalPrice}
                  suffix="credits"
                  className="package-price-statistic"
                />
                <Text type="secondary" className="package-classes">
                  {pricing.totalClasses}{" "}
                  {pricing.totalClasses === 1 ? "class" : "classes"}
                </Text>
              </div>

              {packageType === "short-term" && (
                <Alert
                  message="You can upgrade to full-term package anytime!"
                  type="info"
                  showIcon
                  icon={<ThunderboltOutlined />}
                  className="package-alert"
                />
              )}

              {packageType === "full-term" &&
                pricing.totalClasses > 1 &&
                pricing.totalPrice > 0 && (
                  <Text type="secondary" className="package-perclass">
                    {Math.round(pricing.totalPrice / pricing.totalClasses)}{" "}
                    credits per class
                  </Text>
                )}
            </Space>
          </Radio>
        </div>
      </Card>
    );
  };

  return (
    <Modal
      title={
        <Space>
          <CheckCircleOutlined className="package-title-icon" />
          <span>Book Your Class</span>
        </Space>
      }
      maskClosable={false}
      open={isBuyNowModalOpen}
      onCancel={handleCancel}
      centered
      className="buynow-packages-modal"
      width={680}
      footer={null}
    >
      <Space direction="vertical" size={20} className="package-full-width">
        {/* Select child */}
        <div className="form-section">
          <Text strong className="form-label">
            Select Child *
          </Text>
          <Select
            placeholder="Choose which child will attend this class"
            className="package-full-width"
            size="large"
            value={selectedChildId}
            onChange={(value) => setSelectedChildId(value)}
          >
            {children?.map((child) => (
              <Select.Option key={child?.child_id} value={child?.child_id}>
                {child.name} - Age {child.age}
              </Select.Option>
            ))}
          </Select>
        </div>

        <Divider className="package-section-divider" />

        {/* Package Type Selection */}
        <div className="form-section">
          <Text strong className="form-label">
            Choose Package Type *
          </Text>

          {loadingEligibility ? (
            <div className="package-loading">
              <Spin size="large" />
              <Text
                type="secondary"
                className="package-loading-text"
              >
                Loading package options...
              </Text>
            </div>
          ) : packageEligibility ? (
            <Radio.Group
              value={selectedPackageType}
              onChange={(e) => setSelectedPackageType(e.target.value)}
              className="package-full-width"
            >
              <Space direction="vertical" size={12} className="package-full-width">
                {Object.entries(packageEligibility.eligibility).map(
                  ([packageType, eligibilityData]) =>
                    renderPackageOption(packageType, {
                      eligibility: eligibilityData,
                      pricing: packageEligibility.pricing[packageType],
                    }),
                )}
              </Space>
            </Radio.Group>
          ) : (
            <Alert
              message="Unable to load package options"
              type="error"
              showIcon
            />
          )}
        </div>

        <Divider className="package-section-divider" />

        {/* Class Information */}
        <div className="class-info-section">
          <Title level={5} className="package-class-details-title">
            Class Details
          </Title>

          <div className="class-info-card">
            <div className="class-info-row">
              <EnvironmentOutlined className="info-icon" />
              <Text className="class-info-label">Location:</Text>
              <Text className="class-info-value">
                {outletAddress.SEARCHVAL || "N/A"}
              </Text>
            </div>

            <div className="class-info-row">
              <ClockCircleOutlined className="info-icon" />
              <Text className="class-info-label">Time:</Text>
              <Text className="class-info-value">{selected?.timeRange}</Text>
            </div>

            <div className="class-info-row">
              <CalendarOutlined className="info-icon" />
              <Text className="class-info-label">Date:</Text>
              <Text className="class-info-value">
                {selected?.selectedDate
                  ? new Date(selected.selectedDate).toLocaleDateString("en-GB")
                  : "N/A"}
              </Text>
            </div>
          </div>

          {/* Map */}
          <div className="buynow-map-container">
            <Map
              mapStyle="mapbox://styles/mapbox/streets-v8"
              mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
              initialViewState={{
                longitude: outletAddress.LONGITUDE ?? 103.8198,
                latitude: outletAddress.LATITUDE ?? 1.3521,
                zoom: 15,
              }}
              // react-map-gl requires calculated canvas dimensions via this prop.
              style={{
                width: "100%",
                height: "180px",
                borderRadius: "var(--radius-md)",
              }}
              mapLib={import("mapbox-gl")}
              scrollZoom={false}
              dragPan={false}
            >
              <Marker
                longitude={outletAddress.LONGITUDE ?? 103.8198}
                latitude={outletAddress.LATITUDE ?? 1.3521}
                anchor="top"
              ></Marker>
            </Map>
          </div>
        </div>

        {/* Available Credit Display */}
        <div className="credit-display">
          <DollarOutlined className="credit-icon" />
          <Space direction="vertical" size={4}>
            <Text type="secondary">Available Credits</Text>
            <Text className="credit-amount">{user?.credit || 0}</Text>
          </Space>
        </div>

        {/* Action Buttons */}
        <Row gutter={12} className="modal-actions">
          <Col span={12}>
            <Button
              block
              size="large"
              className="modal-btn"
              onClick={handleCancel}
            >
              Cancel
            </Button>
          </Col>
          <Col span={12}>
            <Button
              block
              type="primary"
              size="large"
              loading={isLoading}
              className="modal-btn modal-btn-primary"
              onClick={handleBooking}
              disabled={!selectedChildId || !selectedPackageType}
            >
              Confirm Booking
            </Button>
          </Col>
        </Row>
      </Space>
    </Modal>
  );
};

export default BuyNowWithPackages;
