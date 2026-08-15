import { useState } from "react";
import {
  Modal,
  Select,
  Typography,
  Button,
  Radio,
} from "antd";
import {
  EnvironmentOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  TagOutlined,
} from "@ant-design/icons";
import toast from "react-hot-toast";
import "./BuyNow.css";
import Map, { Marker } from "react-map-gl";
import { fetchWithAuth, API_ENDPOINTS } from "../../utils/api";

const { Text } = Typography;

const toPositiveCredits = (value) => {
  const credits = Number(value);
  return Number.isFinite(credits) && credits > 0 ? Math.ceil(credits) : null;
};

const toPositiveClassCount = (value, fallback) => {
  const count = Number(value);
  return Number.isInteger(count) && count > 0 ? count : fallback;
};

const parseOutletAddress = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const formatBookingDate = (value) => {
  if (!value) return "Date unavailable";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat("en-SG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
};

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
  const [selectedPackageType, setSelectedPackageType] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleCancel = () => {
    setIsBuyNowModalOpen(false);
    setSelectedChildId(null);
    setSelectedPackageType(null);
  };

  // Get pricing and details for selected package type
  const getPackageDetails = (packageType) => {
    if (!packageType || !selected?.location) return null;

    const location = selected.location;
    const paygCredits = toPositiveCredits(location.credit);
    const fullTermClasses = toPositiveClassCount(
      location.full_term_class_count,
      10,
    );
    const shortTermClasses = toPositiveClassCount(
      location.short_term_class_count,
      Math.ceil(fullTermClasses * 0.25),
    );
    const fullTermCredits =
      toPositiveCredits(location.price_fullterm) ||
      (paygCredits ? paygCredits * fullTermClasses : null);
    const shortTermCredits =
      toPositiveCredits(location.price_shortterm) ||
      (fullTermCredits
        ? Math.ceil(
            (fullTermCredits / fullTermClasses) * 1.15 * shortTermClasses,
          )
        : null);

    switch (packageType) {
      case "pay-as-you-go":
        return {
          label: "Pay-as-you-go",
          price: paygCredits,
          description: "Single class",
        };
      case "full-term":
        return {
          label: "Full Term",
          price: fullTermCredits,
          description: `${fullTermClasses} classes`,
        };
      case "short-term":
        return {
          label: "Short Term",
          price: shortTermCredits,
          description: `${shortTermClasses} classes`,
        };
      default:
        return null;
    }
  };

  const packageTypes = selected?.location?.package_types || [];
  const effectivePackageType =
    selectedPackageType || (packageTypes.length === 1 ? packageTypes[0] : null);
  const currentPackage = getPackageDetails(effectivePackageType);
  const displayPrice = currentPackage?.price ?? null;
  const availableCredits = Number(user?.credit ?? 0);
  const hasValidPackagePrice =
    Number.isFinite(Number(displayPrice)) && Number(displayPrice) > 0;
  const hasSufficientCredits =
    hasValidPackagePrice && availableCredits >= Number(displayPrice);
  const creditsAfterBooking = hasSufficientCredits
    ? availableCredits - Number(displayPrice)
    : null;
  const creditsNeeded = hasValidPackagePrice
    ? Math.max(Number(displayPrice) - availableCredits, 0)
    : null;
  const outletAddress = parseOutletAddress(
    selected?.location?.outlet_address,
  );
  const longitude = Number(outletAddress.LONGITUDE);
  const latitude = Number(outletAddress.LATITUDE);
  const hasMapCoordinates =
    Number.isFinite(longitude) && Number.isFinite(latitude);
  const bookingDate = formatBookingDate(selected?.selectedDate);
  const confirmButtonLabel =
    !selectedChildId || !effectivePackageType
      ? "Confirm Booking"
      : !hasValidPackagePrice
        ? "Credits unavailable"
        : !hasSufficientCredits
          ? "Insufficient credits"
          : "Confirm Booking";

  const handleBooking = async () => {
    // Validate child selection
    if (!selectedChildId) {
      toast.error("Please select a child for this class");
      return;
    }

    // Validate package type selection
    if (!effectivePackageType) {
      toast.error("Please select a package type");
      return;
    }

    if (!hasValidPackagePrice) {
      toast.error("This package's credit cost is unavailable.");
      return;
    }

    // Validate user has enough credits
    if (!hasSufficientCredits) {
      toast.error("Insufficient credits. Please top up your account.");
      return;
    }

    setIsLoading(true);

    try {
      // Construct proper timestamp from selected date and time
      const selectedDateStr =
        selected?.selectedDate || new Date().toISOString().split("T")[0];
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
          package_type: effectivePackageType,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(
          "Booking confirmed! Class has been added to your schedule.",
        );
        setIsBuyNowModalOpen(false);
        setSelectedChildId(null);
        setSelectedPackageType(null);

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
      title={
        <div className="buynow-heading">
          <span className="buynow-heading-title">Book your class</span>
          {listing?.listing_title && (
            <span className="buynow-heading-context">
              {listing.listing_title}
            </span>
          )}
        </div>
      }
      maskClosable={false}
      open={isBuyNowModalOpen}
      onCancel={handleCancel}
      centered
      className="buynow-modal"
      width={780}
      footer={
        <div className="buynow-footer">
          <div className="buynow-footer-total">
            <span>Booking total</span>
            <strong>
              {hasValidPackagePrice ? `${displayPrice} credits` : "—"}
            </strong>
          </div>
          <div className="buynow-footer-actions">
            <Button
              size="large"
              className="buynow-cancel-button"
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button
              type="primary"
              size="large"
              loading={isLoading}
              className="buynow-confirm-button"
              onClick={handleBooking}
              disabled={
                !selectedChildId ||
                !effectivePackageType ||
                !hasSufficientCredits
              }
            >
              {confirmButtonLabel}
            </Button>
          </div>
        </div>
      }
    >
      <div className="buynow-layout">
        <div className="buynow-form-column">
          <section className="buynow-section">
            <div className="buynow-section-heading">
              <span className="buynow-step">1</span>
              <div>
                <h3>Choose a package</h3>
                <p>Select how you would like to book this class.</p>
              </div>
            </div>

            {packageTypes.length > 0 ? (
              <Radio.Group
                className="buynow-package-grid"
                value={effectivePackageType}
                onChange={(event) =>
                  setSelectedPackageType(event.target.value)
                }
              >
                {packageTypes.map((packageType) => {
                  const details = getPackageDetails(packageType);
                  const isSelected = effectivePackageType === packageType;
                  const isUnavailable = !details?.price;

                  return (
                    <Radio
                      className={`buynow-package-card${
                        isSelected ? " is-selected" : ""
                      }${isUnavailable ? " is-unavailable" : ""}`}
                      disabled={isUnavailable}
                      key={packageType}
                      value={packageType}
                    >
                      <span className="buynow-package-copy">
                        <span className="buynow-package-name">
                          {details?.label}
                        </span>
                        <span className="buynow-package-meta">
                          {details?.description}
                        </span>
                      </span>
                      <strong className="buynow-package-price">
                        {details?.price
                          ? `${details.price} credits`
                          : "Unavailable"}
                      </strong>
                    </Radio>
                  );
                })}
              </Radio.Group>
            ) : (
              <div className="buynow-empty-state">
                Package options are currently unavailable.
              </div>
            )}
          </section>

          <section className="buynow-section">
            <div className="buynow-section-heading">
              <span className="buynow-step">2</span>
              <div>
                <h3>Who is attending?</h3>
                <p>Choose the child you are booking for.</p>
              </div>
            </div>

            <label className="buynow-field-label" htmlFor="buynow-child">
              Child
            </label>
            <Select
              id="buynow-child"
              className="buynow-child-select"
              placeholder="Select a child"
              size="large"
              value={selectedChildId}
              onChange={(value) => setSelectedChildId(value)}
              options={children?.map((child) => ({
                value: child?.child_id,
                label: child?.name,
              }))}
            />
          </section>

          <div
            className={`buynow-wallet${
              effectivePackageType && !hasSufficientCredits ? " is-low" : ""
            }`}
          >
            <span className="buynow-wallet-icon">
              <TagOutlined />
            </span>
            <div className="buynow-wallet-copy">
              <span>Your balance</span>
              <strong>{availableCredits} credits</strong>
            </div>
            <span className="buynow-wallet-status">
              {creditsAfterBooking !== null
                ? `${creditsAfterBooking} credits after booking`
                : creditsNeeded > 0
                  ? `Need ${creditsNeeded} more credits`
                  : "Select a package"}
            </span>
          </div>
        </div>

        <aside className="buynow-summary-column">
          <div className="buynow-summary-heading">
            <h3>Class details</h3>
            <span>{bookingDate}</span>
          </div>

          {hasMapCoordinates ? (
            <div className="buynow-map-container">
              <Map
                key={`${longitude}-${latitude}`}
                mapStyle="mapbox://styles/mapbox/streets-v8"
                mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
                initialViewState={{
                  longitude,
                  latitude,
                  zoom: 15,
                }}
                style={{ width: "100%", height: "100%" }}
                mapLib={import("mapbox-gl")}
                scrollZoom={false}
                dragPan={false}
              >
                <Marker
                  longitude={longitude}
                  latitude={latitude}
                  anchor="bottom"
                />
              </Map>
            </div>
          ) : (
            <div className="buynow-map-placeholder">
              Map location unavailable
            </div>
          )}

          <div className="buynow-class-details">
            <div className="buynow-detail-row">
              <EnvironmentOutlined />
              <div>
                <span>Location</span>
                <strong>
                  {outletAddress.SEARCHVAL || "Location unavailable"}
                </strong>
              </div>
            </div>
            <div className="buynow-detail-row">
              <ClockCircleOutlined />
              <div>
                <span>Time</span>
                <strong>{selected?.timeRange || "Time unavailable"}</strong>
              </div>
            </div>
            <div className="buynow-detail-row">
              <CalendarOutlined />
              <div>
                <span>Duration</span>
                <strong>{selected?.duration || "Duration unavailable"}</strong>
              </div>
            </div>
            <div className="buynow-detail-row">
              <TagOutlined />
              <div>
                <span>Selected package</span>
                <strong>
                  {currentPackage
                    ? `${currentPackage.label} · ${currentPackage.description}`
                    : "Choose a package"}
                </strong>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </Modal>
  );
};

export default BuyNow;
