import { useEffect, useState } from "react";
import {
  Modal,
  Select,
  Typography,
  Button,
  Radio,
  Checkbox,
  Alert,
} from "antd";
import {
  EnvironmentOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  SafetyCertificateOutlined,
  TagOutlined,
} from "@ant-design/icons";
import toast from "react-hot-toast";
import "./BuyNow.css";
import Map, { Marker } from "react-map-gl";
import { fetchWithAuth, API_ENDPOINTS } from "../../utils/api";
import { formatClassScheduleTime12Hour } from "../../utils/classScheduleTime";
import type { UserProfile } from "../../types/user";

const { Text } = Typography;

type PackageType = "pay-as-you-go" | "full-term" | "short-term";

type OutletAddress = {
  SEARCHVAL?: string;
  LONGITUDE?: number | string;
  LATITUDE?: number | string;
};

export type BookingLocation = {
  schedule_id?: string | number;
  package_types?: PackageType[];
  pricing_dollars_per_credit?: number | string;
  credit?: number | string;
  full_term_class_count?: number | string;
  short_term_class_count?: number | string;
  price_fullterm?: number | string;
  price_shortterm?: number | string;
  outlet_address?: string | OutletAddress;
  timeslot?: string[];
};

export type SelectedBooking = {
  selectedDate?: string;
  timeRange?: string;
  duration?: string;
  location?: BookingLocation;
};

export type BookingListing = {
  listing_id?: string | number;
  listing_title?: string;
  cancellation_notice_hours?: number | string;
  refund_before_deadline_percent?: number | string;
  refund_after_deadline_percent?: number | string;
  makeup_allowed?: boolean;
  makeup_notice_hours?: number | string;
  class_requirements?: string;
};

export type BookingChild = {
  child_id: string | number;
  name?: string;
  emergency_contact_name?: string;
  emergency_contact_relationship?: string;
  emergency_contact_phone?: string;
  authorized_pickups?: unknown[];
};

type Waiver = {
  version: string | number;
  title?: string;
  statements: string[];
};

type PromotionPricing = {
  effective_credits: number;
  standard_credits: number;
  promotion?: {
    promotion_id: string | number;
    remaining_redemptions: number;
  };
};

type Conflict = {
  listing_title?: string;
  start_at?: string;
  end_at?: string;
};

type BookingResponse = {
  code?: string;
  error?: string;
  updated_credit?: number;
  conflict?: Conflict;
  conflicts?: Conflict[];
};

type ConflictDisplay = {
  listingTitle?: string;
  time: string;
};

type BuyNowProps = {
  isBuyNowModalOpen: boolean;
  setIsBuyNowModalOpen: (open: boolean) => void;
  selected?: SelectedBooking | null;
  listing?: BookingListing | null;
  user?: UserProfile | null;
  children?: BookingChild[];
  onBookingSuccess?: (updatedCredit?: number) => void;
};

const toPositiveCredits = (dollarValue: unknown, dollarsPerCredit: unknown) => {
  const dollars = Number(dollarValue);
  const rate = Number(dollarsPerCredit);
  return Number.isFinite(dollars) && dollars > 0 && Number.isFinite(rate) && rate > 0
    ? Math.ceil(dollars / rate)
    : null;
};

const toPositiveClassCount = (value: unknown, fallback: number) => {
  const count = Number(value);
  return Number.isInteger(count) && count > 0 ? count : fallback;
};

const parseOutletAddress = (value: unknown): OutletAddress => {
  if (!value) return {};
  if (typeof value === "object") return value as OutletAddress;

  try {
    return JSON.parse(String(value)) as OutletAddress;
  } catch {
    return {};
  }
};

const formatBookingDate = (value?: string) => {
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

const formatConflictTime = formatClassScheduleTime12Hour;

const getBookingPolicy = (listing?: BookingListing | null) => ({
  version: 1,
  cancellation_notice_hours: Number(
    listing?.cancellation_notice_hours ?? 24,
  ),
  refund_before_deadline_percent: Number(
    listing?.refund_before_deadline_percent ?? 100,
  ),
  refund_after_deadline_percent: Number(
    listing?.refund_after_deadline_percent ?? 0,
  ),
  makeup_allowed: listing?.makeup_allowed === true,
  makeup_notice_hours: Number(listing?.makeup_notice_hours ?? 24),
  class_requirements: listing?.class_requirements || "",
});

const formatCancellationDeadline = (
  date: string | undefined,
  startTime: string | undefined,
  noticeHours: number,
) => {
  if (!date || !startTime) return "the stated cancellation deadline";
  const classStart = new Date(`${date}T${startTime}:00+08:00`);
  if (Number.isNaN(classStart.getTime())) {
    return "the stated cancellation deadline";
  }
  const deadline = new Date(classStart.getTime() - noticeHours * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(deadline);
};

const BuyNow = ({
  isBuyNowModalOpen,
  setIsBuyNowModalOpen,
  selected,
  listing,
  user,
  children,
  onBookingSuccess,
}: BuyNowProps) => {
  const [selectedChildId, setSelectedChildId] = useState<string | number | null>(null);
  const [selectedPackageType, setSelectedPackageType] = useState<PackageType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sameDayConflict, setSameDayConflict] = useState<ConflictDisplay | null>(null);
  const [overlapConflict, setOverlapConflict] = useState<ConflictDisplay | null>(null);
  const [waiver, setWaiver] = useState<Waiver | null>(null);
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [waiverError, setWaiverError] = useState(false);
  const [promotionPricing, setPromotionPricing] = useState<PromotionPricing | null>(null);

  useEffect(() => {
    if (!isBuyNowModalOpen) return;

    let active = true;
    const loadWaiver = async () => {
      setWaiver(null);
      setWaiverAccepted(false);
      setWaiverError(false);
      try {
        const response = await fetchWithAuth(API_ENDPOINTS.GET_BOOKING_WAIVER, {
          method: "GET",
        });
        const data = (await response.json()) as { waiver?: Waiver };
        if (!active) return;
        if (!response.ok || !data.waiver) {
          setWaiverError(true);
          return;
        }
        setWaiver(data.waiver);
      } catch {
        if (active) setWaiverError(true);
      }
    };

    loadWaiver();
    return () => {
      active = false;
    };
  }, [isBuyNowModalOpen]);

  const handleCancel = () => {
    setIsBuyNowModalOpen(false);
    setSelectedChildId(null);
    setSelectedPackageType(null);
    setSameDayConflict(null);
    setOverlapConflict(null);
    setWaiverAccepted(false);
    setPromotionPricing(null);
  };

  // Get pricing and details for selected package type
  const getPackageDetails = (packageType: PackageType | null) => {
    if (!packageType || !selected?.location) return null;

    const location = selected.location;
    const dollarsPerCredit = Number(location.pricing_dollars_per_credit);
    const paygCredits = toPositiveCredits(location.credit, dollarsPerCredit);
    const fullTermClasses = toPositiveClassCount(
      location.full_term_class_count,
      10,
    );
    const shortTermClasses = toPositiveClassCount(
      location.short_term_class_count,
      Math.ceil(fullTermClasses * 0.25),
    );
    const fullTermCredits =
      toPositiveCredits(location.price_fullterm, dollarsPerCredit) ||
      (paygCredits ? paygCredits * fullTermClasses : null);
    const shortTermCredits =
      toPositiveCredits(location.price_shortterm, dollarsPerCredit) ||
      (Number(location.price_fullterm) > 0
        ? toPositiveCredits(
            (Number(location.price_fullterm) / fullTermClasses) *
              1.15 *
              shortTermClasses,
            dollarsPerCredit,
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

  useEffect(() => {
    const scheduleId = selected?.location?.schedule_id;
    if (!isBuyNowModalOpen || !scheduleId || !effectivePackageType) {
      setPromotionPricing(null);
      return;
    }

    let active = true;
    setPromotionPricing(null);
    const loadPromotion = async () => {
      try {
        const response = await fetchWithAuth(
          API_ENDPOINTS.GET_ELIGIBLE_PROMOTION(scheduleId, effectivePackageType),
        );
        const data = (await response.json()) as PromotionPricing;
        if (active && response.ok) setPromotionPricing(data);
      } catch {
        if (active) setPromotionPricing(null);
      }
    };
    loadPromotion();
    return () => {
      active = false;
    };
  }, [effectivePackageType, isBuyNowModalOpen, selected?.location?.schedule_id]);
  const selectedChild = children?.find(
    (child) => child?.child_id === selectedChildId,
  );
  const hasCompleteSafetyProfile = Boolean(
    selectedChild?.emergency_contact_name &&
      selectedChild?.emergency_contact_relationship &&
      selectedChild?.emergency_contact_phone &&
      Array.isArray(selectedChild?.authorized_pickups) &&
      selectedChild.authorized_pickups.length > 0,
  );
  const displayPrice = promotionPricing?.effective_credits ?? currentPackage?.price ?? null;
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
  const bookingPolicy = getBookingPolicy(listing);
  const cancellationDeadline = formatCancellationDeadline(
    selected?.selectedDate,
    selected?.location?.timeslot?.[0],
    bookingPolicy.cancellation_notice_hours,
  );
  const beforeDeadlineRefund = hasValidPackagePrice
    ? Math.floor(
        (Number(displayPrice) *
          bookingPolicy.refund_before_deadline_percent) /
          100,
      )
    : null;
  const afterDeadlineRefund = hasValidPackagePrice
    ? Math.floor(
        (Number(displayPrice) * bookingPolicy.refund_after_deadline_percent) /
          100,
      )
    : null;
  const confirmButtonLabel =
    !selectedChildId || !effectivePackageType
      ? "Confirm Booking"
      : !hasValidPackagePrice
        ? "Credits unavailable"
        : selectedChildId && !hasCompleteSafetyProfile
          ? "Complete safety details"
          : !waiverAccepted
            ? "Accept safety acknowledgement"
            : !hasSufficientCredits
              ? "Insufficient credits"
              : "Confirm Booking";

  const submitBooking = async (acknowledgeSameDayBooking = false) => {
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

    if (!hasCompleteSafetyProfile) {
      toast.error(
        "Complete this child's emergency contact and authorised pickup details from your profile before booking.",
      );
      return;
    }

    if (!waiver || !waiverAccepted) {
      toast.error("Please review and accept the child safety acknowledgement.");
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
          acknowledge_same_day_booking: acknowledgeSameDayBooking,
          acknowledged_policy: bookingPolicy,
          waiver_accepted: true,
          waiver_version: waiver.version,
          promotion_id: promotionPricing?.promotion?.promotion_id || null,
        }),
      });

      const data = (await response.json()) as BookingResponse;

      if (
        response.status === 409 &&
        data.code === "SAME_DAY_BOOKING_WARNING"
      ) {
        const conflict = data.conflicts?.[0];
        const conflictTime = conflict
          ? `${formatConflictTime(conflict.start_at)}–${formatConflictTime(conflict.end_at)}`
          : "another time";

        setSameDayConflict({
          listingTitle: conflict?.listing_title,
          time: conflictTime,
        });
      } else if (
        response.status === 409 &&
        data.code === "BOOKING_TIME_CONFLICT"
      ) {
        const conflict = data.conflict;
        setOverlapConflict({
          listingTitle: conflict?.listing_title,
          time: conflict
            ? `${formatConflictTime(conflict.start_at)}–${formatConflictTime(conflict.end_at)}`
            : "the selected time",
        });
      } else if (
        response.status === 409 &&
        data.code === "PROMOTION_UNAVAILABLE"
      ) {
        setPromotionPricing(null);
        toast.error(data.error || "The promotional price is no longer available.");
      } else if (response.ok) {
        toast.success(
          "Booking confirmed! Class has been added to your schedule.",
        );
        setIsBuyNowModalOpen(false);
        setSelectedChildId(null);
        setSelectedPackageType(null);
        setSameDayConflict(null);
        setOverlapConflict(null);
        setWaiverAccepted(false);

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

  const handleBooking = () => submitBooking(false);

  return (
    <>
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
                !hasCompleteSafetyProfile ||
                !waiver ||
                !waiverAccepted ||
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
                          ? `${
                              isSelected && promotionPricing?.promotion
                                ? promotionPricing.effective_credits
                                : details.price
                            } credits`
                          : "Unavailable"}
                      </strong>
                      {isSelected && promotionPricing?.promotion ? (
                        <span className="buynow-promotion-label">
                          Limited offer · usually {promotionPricing.standard_credits} credits
                        </span>
                      ) : null}
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
              onChange={(value) => {
                setSelectedChildId(value);
                setWaiverAccepted(false);
              }}
              options={children?.map((child) => ({
                value: child?.child_id,
                label: child?.name,
              }))}
            />
            {selectedChildId && !hasCompleteSafetyProfile && (
              <Alert
                className="buynow-safety-alert"
                type="warning"
                showIcon
                message="Safety information required"
                description="Add an emergency contact and at least one authorised pickup person under Profile → Children & Classes before booking."
              />
            )}
          </section>

          <section className="buynow-section buynow-waiver-section">
            <div className="buynow-section-heading">
              <span className="buynow-step">3</span>
              <div>
                <h3>{waiver?.title || "Child safety acknowledgement"}</h3>
                <p>Your acceptance is saved with this booking.</p>
              </div>
            </div>

            {waiverError ? (
              <Alert
                type="error"
                showIcon
                message="Safety acknowledgement could not be loaded"
                description="Please close this window and try again."
              />
            ) : waiver ? (
              <>
                <ul className="buynow-waiver-statements">
                  {waiver.statements.map((statement) => (
                    <li key={statement}>{statement}</li>
                  ))}
                </ul>
                <Checkbox
                  className="buynow-waiver-checkbox"
                  checked={waiverAccepted}
                  onChange={(event) => setWaiverAccepted(event.target.checked)}
                >
                  I have reviewed and agree to this acknowledgement.
                </Checkbox>
              </>
            ) : (
              <div className="buynow-waiver-loading" aria-live="polite">
                Loading safety acknowledgement…
              </div>
            )}
          </section>

          <section className="buynow-section buynow-policy-section">
            <div className="buynow-section-heading">
              <span className="buynow-step">4</span>
              <div>
                <h3>Review booking policy</h3>
                <p>These terms are saved with your booking.</p>
              </div>
            </div>

            <div className="buynow-policy-list">
              <div className="buynow-policy-item">
                <SafetyCertificateOutlined />
                <div>
                  <strong>Cancellation and refund</strong>
                  <span>
                    Cancel by {cancellationDeadline} to receive{" "}
                    {beforeDeadlineRefund ?? "the applicable"} credits back.
                    After the deadline, {afterDeadlineRefund ?? 0} credits will
                    be refunded.
                  </span>
                </div>
              </div>
              <div className="buynow-policy-item">
                <CalendarOutlined />
                <div>
                  <strong>Make-up policy</strong>
                  <span>
                    {bookingPolicy.makeup_allowed
                      ? `Make-up requests are allowed with at least ${bookingPolicy.makeup_notice_hours} hours’ notice, subject to availability.`
                      : "Make-up requests are not available for this class."}
                  </span>
                </div>
              </div>
              <div className="buynow-policy-item">
                <CheckCircleOutlined />
                <div>
                  <strong>Class requirements</strong>
                  <span>
                    {bookingPolicy.class_requirements ||
                      "No additional class requirements were provided."}
                  </span>
                </div>
              </div>
            </div>
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
                : creditsNeeded !== null && creditsNeeded > 0
                  ? `Need ${creditsNeeded} more credits`
                  : "Select a package"}
            </span>
          </div>
          {promotionPricing?.promotion ? (
            <Alert
              className="buynow-promotion-alert"
              type="success"
              showIcon
              message="Promotional price applied"
              description={`You save ${promotionPricing.standard_credits - promotionPricing.effective_credits} credits. ${promotionPricing.promotion.remaining_redemptions} redemptions remain.`}
            />
          ) : null}
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
                // react-map-gl requires its canvas dimensions through this API.
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
      <Modal
        title="Another class is booked on the same day"
        open={Boolean(sameDayConflict)}
        okText="Continue booking"
        cancelText="Go back"
        confirmLoading={isLoading}
        onOk={() => submitBooking(true)}
        onCancel={() => setSameDayConflict(null)}
        centered
      >
        <Text>
          This child already has
          {sameDayConflict?.listingTitle
            ? ` ${sameDayConflict.listingTitle}`
            : " another class"}{" "}
          from {sameDayConflict?.time}. Are you sure you want to continue?
        </Text>
      </Modal>
      <Modal
        title="This time overlaps another class"
        open={Boolean(overlapConflict)}
        footer={
          <Button
            type="primary"
            onClick={() => setOverlapConflict(null)}
          >
            Choose another time
          </Button>
        }
        onCancel={() => setOverlapConflict(null)}
        centered
      >
        <Text>
          This child already has
          {overlapConflict?.listingTitle
            ? ` ${overlapConflict.listingTitle}`
            : " another class"}{" "}
          from {overlapConflict?.time}. Please choose a class that does not
          overlap.
        </Text>
      </Modal>
    </>
  );
};

export default BuyNow;
