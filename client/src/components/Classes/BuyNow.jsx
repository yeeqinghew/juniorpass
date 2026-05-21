import { useState } from "react";
import { Modal, Select, Space, Typography, Button, Row, Col } from "antd";
import {
  EnvironmentOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  DollarOutlined,
} from "@ant-design/icons";
import toast from "react-hot-toast";
import "./BuyNow.css";
import Map, { Marker } from "react-map-gl";
import { fetchWithAuth, API_ENDPOINTS } from "../../utils/api";

const { Text } = Typography;

const BuyNow = ({
  isBuyNowModalOpen,
  setIsBuyNowModalOpen,
  selected,
  listing,
  user,
  children,
  onBookingSuccess,
}) => {
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleCancel = () => {
    setIsBuyNowModalOpen(false);
    setSelectedChildId(null);
  };

  const handleBooking = async () => {
    // Validate child selection
    if (!selectedChildId) {
      toast.error("Please select a child for this class");
      return;
    }

    // Validate user has enough credits
    if (!user?.credit || user.credit < listing?.credit) {
      toast.error("Insufficient credits. Please top up your account.");
      return;
    }

    setIsLoading(true);

    try {
      // Construct proper timestamp from selected date and time
      const selectedDateStr = selected?.selectedDate || new Date().toISOString().split('T')[0];
      const startTime = selected?.location?.timeslot?.[0];
      const endTime = selected?.location?.timeslot?.[1];

      const start_date = `${selectedDateStr}T${startTime}:00`;
      const end_date = `${selectedDateStr}T${endTime}:00`;

      const response = await fetchWithAuth(API_ENDPOINTS.CREATE_BOOKING, {
        method: "POST",
        body: JSON.stringify({
          listing_id: listing?.listing_id,
          schedule_id: selected?.location?.schedule_id,
          start_date: start_date,
          end_date: end_date,
          child_id: selectedChildId,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(
          "Booking confirmed! Class has been added to your schedule."
        );
        setIsBuyNowModalOpen(false);
        setSelectedChildId(null);

        // Call parent callback to refresh data
        if (onBookingSuccess) {
          onBookingSuccess(data.updated_credit);
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

  return (
    <Modal
      title="Book Your Class"
      maskClosable={false}
      open={isBuyNowModalOpen}
      onCancel={handleCancel}
      centered
      className="buynow-modal"
      width={520}
      footer={null}
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        {/* Select child */}
        <div>
          <Text strong style={{ display: "block", marginBottom: "8px" }}>
            Select Child *
          </Text>
          <Select
            placeholder="Choose which child will attend this class"
            style={{ width: "100%" }}
            size="large"
            value={selectedChildId}
            onChange={(value) => setSelectedChildId(value)}
          >
            {children?.map((child) => (
              <Select.Option key={child?.child_id} value={child?.child_id}>
                {child.name}
              </Select.Option>
            ))}
          </Select>
        </div>

        {/* Map */}
        <div className="buynow-map-container" style={{ marginTop: 16, marginBottom: 16 }}>
          <Map
            mapStyle="mapbox://styles/mapbox/streets-v8"
            mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
            initialViewState={{
              longitude:
                selected &&
                JSON.parse(selected?.location?.outlet_address)?.LONGITUDE,
              latitude:
                selected &&
                JSON.parse(selected?.location?.outlet_address)?.LATITUDE,
              zoom: 15,
            }}
            style={{
              width: "100%",
              height: "200px",
            }}
            mapLib={import("mapbox-gl")}
            scrollZoom={false}
            dragPan={false}
          >
            <Marker
              longitude={
                selected &&
                JSON.parse(selected?.location?.outlet_address)?.LONGITUDE
              }
              latitude={
                selected &&
                JSON.parse(selected?.location?.outlet_address)?.LATITUDE
              }
              anchor="top"
            ></Marker>
          </Map>
        </div>

        {/* Class Information */}
        <div className="class-info-card">
          <div className="class-info-row">
            <EnvironmentOutlined className="info-icon" />
            <Text className="class-info-label">Location:</Text>
            <Text className="class-info-value">
              {selected &&
                JSON.parse(selected?.location?.outlet_address)?.SEARCHVAL}
            </Text>
          </div>

          <div className="class-info-row">
            <ClockCircleOutlined className="info-icon" />
            <Text className="class-info-label">Time:</Text>
            <Text className="class-info-value">{selected?.timeRange}</Text>
          </div>

          <div className="class-info-row">
            <CalendarOutlined className="info-icon" />
            <Text className="class-info-label">Duration:</Text>
            <Text className="class-info-value">{selected?.duration}</Text>
          </div>

          <div className="class-info-row">
            <DollarOutlined className="info-icon" />
            <Text className="class-info-label">Cost:</Text>
            <Text className="class-info-value" style={{ fontWeight: 600, color: "var(--primary-color)" }}>
              {listing?.credit} credits
            </Text>
          </div>
        </div>

        {/* Available Credit Display */}
        <div className="credit-display">
          <DollarOutlined className="info-icon" />
          <Text>Available Credits:</Text>
          <Text className="credit-amount">{user?.credit}</Text>
        </div>

        {/* Action Buttons */}
        <Row gutter={12} className="modal-actions" style={{ marginTop: 16 }}>
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
              disabled={!selectedChildId}
            >
              Confirm Booking
            </Button>
          </Col>
        </Row>
      </Space>
    </Modal>
  );
};

export default BuyNow;
