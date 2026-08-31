import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  DatePicker,
  Dropdown,
  Empty,
  Image,
  Input,
  List,
  Pagination,
  Segmented,
  Tag,
  TimePicker,
  Typography,
} from "antd";
import {
  CloseOutlined,
  DownOutlined,
  EnvironmentOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import Map, {
  GeolocateControl,
  Marker,
  NavigationControl,
  Popup,
} from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useNavigate } from "react-router-dom";
import dayjs from "../../utils/dayjs";
import isBetween from "dayjs/plugin/isBetween";
import toast from "react-hot-toast";

import { fetchWithAuth, API_ENDPOINTS } from "../../utils/api";
import useWindowDimensions from "../../hooks/useWindowDimensions.jsx";
import { WEEKDAYS } from "../../constants.jsx";
import { applyTimeToDate } from "../../utils/timeHelpers.jsx";
import {
  getListingPackageTypes,
  getPackageTypeLabel,
  normalisePackageType,
} from "../../utils/packageTypes.js";
import "./index.css";

dayjs.extend(isBetween);

const { Paragraph, Text, Title } = Typography;

const parseOutletAddress = (value) => {
  if (!value) return null;

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    const longitude = Number(parsed?.LONGITUDE);
    const latitude = Number(parsed?.LATITUDE);

    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      return null;
    }

    return {
      ...parsed,
      longitude,
      latitude,
    };
  } catch (error) {
    console.error("Unable to parse outlet address:", error);
    return null;
  }
};

const normaliseArrayValue = (value) => {
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    return value
      .replace(/[{}]/g, "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const Classes = () => {
  const [popupInfo, setPopupInfo] = useState(null);
  const [listings, setListings] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ageGroups, setAgeGroups] = useState([]);
  const [packageTypes, setPackageTypes] = useState([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedAgeGroups, setSelectedAgeGroups] = useState([]);
  const [selectedPackageTypes, setSelectedPackageTypes] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedDateTime, setSelectedDateTime] = useState(null);
  const [useSpecificDate, setUseSpecificDate] = useState(false);
  const [tempDate, setTempDate] = useState(null);
  const [tempTime, setTempTime] = useState(null);

  const [view, setView] = useState("list");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  const { isMobile, isTabletPortrait } = useWindowDimensions();
  const isMobileOrTabletPortrait = isMobile || isTabletPortrait;

  const navigate = useNavigate();
  const mapRef = useRef(null);

  useEffect(() => {
    const loadPageData = async () => {
      try {
        const [
          listingResponse,
          categoryResponse,
          ageResponse,
          packageResponse,
        ] = await Promise.all([
          fetchWithAuth(API_ENDPOINTS.GET_ALL_LISTINGS),
          fetchWithAuth(API_ENDPOINTS.GET_ALL_CATEGORIES),
          fetchWithAuth(API_ENDPOINTS.GET_ALL_AGE_GROUPS),
          fetchWithAuth(API_ENDPOINTS.GET_ALL_PACKAGES),
        ]);

        if (!listingResponse.ok) {
          throw new Error("Failed to load classes");
        }

        const listingData = await listingResponse.json();
        setListings(Array.isArray(listingData) ? listingData : []);

        if (categoryResponse.ok) {
          const categoryData = await categoryResponse.json();
          setCategories(Array.isArray(categoryData) ? categoryData : []);
        }

        if (ageResponse.ok) {
          const ageData = await ageResponse.json();
          setAgeGroups(Array.isArray(ageData) ? ageData : []);
        }

        if (packageResponse.ok) {
          const packageData = await packageResponse.json();
          setPackageTypes(Array.isArray(packageData) ? packageData : []);
        }
      } catch (error) {
        console.error(error);
        toast.error(error.message || "Failed to load classes");
      }
    };

    loadPageData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    selectedCategories,
    selectedAgeGroups,
    selectedPackageTypes,
    selectedDay,
    selectedDateTime,
    useSpecificDate,
  ]);

  useEffect(() => {
    if (view !== "map" || !mapRef.current) return undefined;

    const timeoutId = window.setTimeout(() => {
      mapRef.current?.resize();
    }, 100);

    return () => window.clearTimeout(timeoutId);
  }, [view]);

  const getAgeGroupLabel = (ageGroup) => {
    if (ageGroup.max_age === null) {
      return `${ageGroup.min_age}+ years`;
    }

    return `${ageGroup.min_age}-${ageGroup.max_age} years`;
  };

  const filteredListings = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return listings.filter((listing) => {
      const categoriesForListing =
        listing?.categories || listing?.partner_info?.categories || [];
      const agesForListing = normaliseArrayValue(listing?.age_groups);
      const packagesForListing = getListingPackageTypes(listing);

      const outletSearchValues = Array.isArray(listing?.outlets_info)
        ? listing.outlets_info
            .map(
              (outlet) => parseOutletAddress(outlet?.outlet_address)?.SEARCHVAL,
            )
            .filter(Boolean)
            .join(" ")
        : "";

      const searchableText = [
        listing?.listing_title,
        listing?.description,
        listing?.partner_name,
        categoriesForListing.join(" "),
        packagesForListing.join(" "),
        outletSearchValues,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !term || searchableText.includes(term);

      const matchesCategory =
        selectedCategories.length === 0 ||
        categoriesForListing.some((category) =>
          selectedCategories.includes(category),
        );

      const matchesAgeGroup =
        selectedAgeGroups.length === 0 ||
        agesForListing.some((ageGroup) => selectedAgeGroups.includes(ageGroup));

      const matchesPackage =
        selectedPackageTypes.length === 0 ||
        packagesForListing.some((packageType) =>
          selectedPackageTypes.includes(packageType),
        );

      const matchesSelectedDay =
        !selectedDay ||
        (Array.isArray(listing?.outlets_info) &&
          listing.outlets_info.some((outlet) =>
            outlet?.schedule_groups?.some((group) =>
              group?.time_slots?.some(
                (slot) =>
                  slot?.day?.toLowerCase() === selectedDay.toLowerCase(),
              ),
            ),
          ));

      const matchesSpecificDateAndTime =
        !useSpecificDate || !selectedDateTime
          ? true
          : Array.isArray(listing?.outlets_info) &&
            listing.outlets_info.some((outlet) =>
              outlet?.schedule_groups?.some((group) =>
                group?.time_slots?.some((slot) => {
                  const selectedDate = dayjs(selectedDateTime);
                  const selectedDayName = selectedDate.format("dddd");

                  if (
                    slot?.day?.toLowerCase() !== selectedDayName.toLowerCase()
                  ) {
                    return false;
                  }

                  if (!slot?.start_time || !slot?.end_time) {
                    return false;
                  }

                  const { start, end } = applyTimeToDate(
                    selectedDate,
                    slot.start_time,
                    slot.end_time,
                  );

                  return selectedDate.isBetween(start, end, "minute", "[)");
                }),
              ),
            );

      return (
        matchesSearch &&
        matchesCategory &&
        matchesAgeGroup &&
        matchesPackage &&
        (useSpecificDate ? matchesSpecificDateAndTime : matchesSelectedDay)
      );
    });
  }, [
    listings,
    searchTerm,
    selectedCategories,
    selectedAgeGroups,
    selectedPackageTypes,
    selectedDay,
    selectedDateTime,
    useSpecificDate,
  ]);

  const paginatedListings = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredListings.slice(startIndex, startIndex + pageSize);
  }, [filteredListings, currentPage]);

  const pins = useMemo(
    () =>
      filteredListings.flatMap((listing) => {
        if (!Array.isArray(listing?.outlets_info)) return [];

        return listing.outlets_info.flatMap((outlet, index) => {
          const parsedAddress = parseOutletAddress(outlet?.outlet_address);
          if (!parsedAddress) return [];

          return [
            <Marker
              key={`${listing.listing_id}-${index}`}
              longitude={parsedAddress.longitude}
              latitude={parsedAddress.latitude}
              anchor="bottom"
              onClick={(event) => {
                event.originalEvent.stopPropagation();
                setPopupInfo({
                  listing,
                  outlet,
                  address: parsedAddress,
                });
              }}
            >
              <button
                type="button"
                className="class-map-marker"
                aria-label={`View ${listing.listing_title}`}
              >
                <EnvironmentOutlined />
              </button>
            </Marker>,
          ];
        });
      }),
    [filteredListings],
  );

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedCategories([]);
    setSelectedAgeGroups([]);
    setSelectedPackageTypes([]);
    setSelectedDay(null);
    setSelectedDateTime(null);
    setTempDate(null);
    setTempTime(null);
    setUseSpecificDate(false);
  };

  const hasActiveFilters =
    Boolean(searchTerm) ||
    selectedCategories.length > 0 ||
    selectedAgeGroups.length > 0 ||
    selectedPackageTypes.length > 0 ||
    Boolean(selectedDay) ||
    Boolean(selectedDateTime);

  const toggleValue = (setter, value) => {
    setter((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  const categoryMenuItems = categories.map((category) => ({
    key: category.id || category.name,
    label: (
      <Checkbox
        checked={selectedCategories.includes(category.name)}
        onClick={(event) => event.stopPropagation()}
        onChange={() => toggleValue(setSelectedCategories, category.name)}
      >
        {category.name}
      </Checkbox>
    ),
  }));

  const ageMenuItems = ageGroups.map((ageGroup) => ({
    key: ageGroup.id || ageGroup.name,
    label: (
      <Checkbox
        checked={selectedAgeGroups.includes(ageGroup.name)}
        onClick={(event) => event.stopPropagation()}
        onChange={() => toggleValue(setSelectedAgeGroups, ageGroup.name)}
      >
        {getAgeGroupLabel(ageGroup)}
      </Checkbox>
    ),
  }));

  const packageOptions = useMemo(() => {
    const configuredLabels = new globalThis.Map(
      packageTypes.map((packageType) => {
        const value = normalisePackageType(
          packageType.package_type || packageType.name,
        );

        return [value, packageType.name || getPackageTypeLabel(value)];
      }),
    );

    const counts = new globalThis.Map();
    listings.forEach((listing) => {
      getListingPackageTypes(listing).forEach((packageType) => {
        counts.set(packageType, (counts.get(packageType) || 0) + 1);
      });
    });

    const preferredOrder = [
      "trial",
      "pay-as-you-go",
      "short-term",
      "full-term",
    ];

    return [...counts.entries()]
      .sort(([typeA], [typeB]) => {
        const indexA = preferredOrder.indexOf(typeA);
        const indexB = preferredOrder.indexOf(typeB);

        if (indexA === -1 && indexB === -1) {
          return typeA.localeCompare(typeB);
        }

        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      })
      .map(([value, count]) => {
        const standardLabel = getPackageTypeLabel(value);

        return {
          value,
          count,
          label:
            standardLabel === value
              ? configuredLabels.get(value) || value
              : standardLabel,
        };
      });
  }, [listings, packageTypes]);

  const packageMenuItems = packageOptions.map((packageType) => {
    const { value } = packageType;

    return {
      key: value,
      label: (
        <Checkbox
          checked={selectedPackageTypes.includes(value)}
          onClick={(event) => event.stopPropagation()}
          onChange={() => toggleValue(setSelectedPackageTypes, value)}
        >
          {packageType.label}
        </Checkbox>
      ),
    };
  });

  const dayMenuItems = WEEKDAYS.map((day) => ({
    key: day,
    label: day,
    onClick: () => setSelectedDay(day),
  }));

  const focusListingOnMap = (listing) => {
    if (!Array.isArray(listing?.outlets_info)) return;

    const firstOutlet = listing.outlets_info.find((outlet) =>
      parseOutletAddress(outlet?.outlet_address),
    );
    const address = parseOutletAddress(firstOutlet?.outlet_address);

    if (!firstOutlet || !address) return;

    setPopupInfo({
      listing,
      outlet: firstOutlet,
      address,
    });

    const map = mapRef.current?.getMap?.() || mapRef.current;
    map?.flyTo?.({
      center: [address.longitude, address.latitude],
      zoom: 14,
      duration: 700,
      essential: true,
    });
  };

  const openClass = (listing) => {
    navigate(`/class/${listing.listing_id}`, {
      state: { listing },
    });
  };

  return (
    <main className="classes">
      <div className="classes-inner">
        <header className="classes-header">
          <div>
            <Title level={2} className="classes-title">
              Explore Classes
            </Title>
            <Text className="classes-subtitle">
              Find enrichment classes that match your child&apos;s interests.
            </Text>
          </div>

          <Text className="classes-result-count">
            {filteredListings.length}{" "}
            {filteredListings.length === 1 ? "class" : "classes"}
          </Text>
        </header>

        <section className="classes-search-row">
          <Input
            size="large"
            allowClear
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="searchbar"
            prefix={<SearchOutlined />}
            placeholder="Search classes, partners, categories or locations"
          />

          {isMobileOrTabletPortrait && (
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { label: "List", value: "list" },
                { label: "Map", value: "map" },
              ]}
              className="classes-view-switch"
            />
          )}
        </section>

        <section className="classes-filter-card">
          <div className="classes-filter-toolbar">
            <Dropdown menu={{ items: categoryMenuItems }} trigger={["click"]}>
              <Button>
                Categories
                <DownOutlined />
              </Button>
            </Dropdown>

            <Dropdown menu={{ items: ageMenuItems }} trigger={["click"]}>
              <Button>
                Age groups
                <DownOutlined />
              </Button>
            </Dropdown>

            {packageMenuItems.length > 0 && (
              <Dropdown menu={{ items: packageMenuItems }} trigger={["click"]}>
                <Button>
                  Package types
                  <DownOutlined />
                </Button>
              </Dropdown>
            )}

            <Segmented
              value={useSpecificDate ? "specific" : "day"}
              onChange={(value) => {
                const specific = value === "specific";
                setUseSpecificDate(specific);

                if (specific) {
                  setSelectedDay(null);
                } else {
                  setSelectedDateTime(null);
                  setTempDate(null);
                  setTempTime(null);
                }
              }}
              options={[
                { label: "Day of week", value: "day" },
                { label: "Specific time", value: "specific" },
              ]}
              className="classes-date-mode"
            />

            {!useSpecificDate ? (
              <Dropdown menu={{ items: dayMenuItems }} trigger={["click"]}>
                <Button>
                  {selectedDay || "Select day"} <DownOutlined />
                </Button>
              </Dropdown>
            ) : (
              <div className="classes-specific-date">
                <DatePicker
                  value={tempDate}
                  onChange={(date) => {
                    setTempDate(date);

                    if (!date) {
                      setSelectedDateTime(null);
                    } else if (tempTime) {
                      setSelectedDateTime(
                        dayjs(date)
                          .hour(tempTime.hour())
                          .minute(tempTime.minute())
                          .second(0),
                      );
                    }
                  }}
                  placeholder="Select date"
                  allowClear
                />

                <TimePicker
                  value={tempTime}
                  format="HH:mm"
                  minuteStep={30}
                  onChange={(time) => {
                    setTempTime(time);

                    if (!time) {
                      setSelectedDateTime(null);
                    } else if (tempDate) {
                      setSelectedDateTime(
                        dayjs(tempDate)
                          .hour(time.hour())
                          .minute(time.minute())
                          .second(0),
                      );
                    }
                  }}
                  placeholder="Select time"
                  allowClear
                />
              </div>
            )}

            {hasActiveFilters && (
              <Button
                type="text"
                icon={<CloseOutlined />}
                onClick={clearFilters}
                className="classes-clear-btn"
              >
                Clear
              </Button>
            )}
          </div>

          {(selectedCategories.length > 0 ||
            selectedAgeGroups.length > 0 ||
            selectedPackageTypes.length > 0 ||
            selectedDay ||
            selectedDateTime) && (
            <div className="classes-active-filters">
              {selectedCategories.map((category) => (
                <Tag
                  key={category}
                  closable
                  onClose={() =>
                    setSelectedCategories((current) =>
                      current.filter((item) => item !== category),
                    )
                  }
                >
                  {category}
                </Tag>
              ))}

              {selectedAgeGroups.map((ageGroup) => (
                <Tag
                  key={ageGroup}
                  closable
                  onClose={() =>
                    setSelectedAgeGroups((current) =>
                      current.filter((item) => item !== ageGroup),
                    )
                  }
                >
                  {ageGroup}
                </Tag>
              ))}

              {selectedPackageTypes.map((packageType) => (
                <Tag
                  key={packageType}
                  closable
                  onClose={() =>
                    setSelectedPackageTypes((current) =>
                      current.filter((item) => item !== packageType),
                    )
                  }
                >
                  {getPackageTypeLabel(packageType)}
                </Tag>
              ))}

              {selectedDay && (
                <Tag closable onClose={() => setSelectedDay(null)}>
                  {selectedDay}
                </Tag>
              )}

              {selectedDateTime && (
                <Tag
                  closable
                  onClose={() => {
                    setSelectedDateTime(null);
                    setTempDate(null);
                    setTempTime(null);
                  }}
                >
                  {dayjs(selectedDateTime).format("D MMM, HH:mm")}
                </Tag>
              )}
            </div>
          )}
        </section>

        <section className="listingmap-container">
          {(view === "list" || !isMobileOrTabletPortrait) && (
            <div className="listing-container">
              {filteredListings.length === 0 ? (
                <Empty
                  description="No classes match your filters"
                  className="classes-empty"
                >
                  {hasActiveFilters && (
                    <Button onClick={clearFilters}>Clear filters</Button>
                  )}
                </Empty>
              ) : (
                <>
                  <List
                    dataSource={paginatedListings}
                    split={false}
                    renderItem={(listing) => (
                      <List.Item
                        key={listing.listing_id}
                        className="class-listing-item"
                        onClick={() => openClass(listing)}
                        onMouseEnter={() => focusListingOnMap(listing)}
                        onMouseLeave={() => setPopupInfo(null)}
                      >
                        <div className="class-listing-card">
                          <Image
                            src={listing?.images?.[0]}
                            alt={listing?.listing_title || "Class"}
                            preview={false}
                            className="class-listing-image"
                            fallback="/placeholder-class.png"
                          />

                          <div className="class-listing-content">
                            <div className="class-listing-tags">
                              {listing?.partner_info?.categories
                                ?.slice(0, 3)
                                .map((category) => (
                                  <Tag key={category}>{category}</Tag>
                                ))}
                            </div>

                            <Text strong className="class-listing-title">
                              {listing?.listing_title}
                            </Text>

                            <Text className="class-listing-partner">
                              By{" "}
                              {listing?.partner_info?.partner_name || "Partner"}
                            </Text>

                            <Paragraph
                              ellipsis={{ rows: 2 }}
                              className="class-listing-description"
                            >
                              {listing?.description}
                            </Paragraph>

                            <div className="class-listing-footer">
                              <span>
                                Ages{" "}
                                {normaliseArrayValue(listing?.age_groups).join(
                                  ", ",
                                ) || "All ages"}
                              </span>

                              <strong>
                                From {listing?.credit ?? "—"} credits
                              </strong>
                            </div>
                          </div>
                        </div>
                      </List.Item>
                    )}
                  />

                  {filteredListings.length > pageSize && (
                    <div className="classes-pagination">
                      <Pagination
                        current={currentPage}
                        pageSize={pageSize}
                        total={filteredListings.length}
                        onChange={setCurrentPage}
                        showSizeChanger={false}
                        showLessItems
                        responsive
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {(view === "map" || !isMobileOrTabletPortrait) && (
            <Map
              ref={mapRef}
              className="map"
              initialViewState={{
                longitude: 103.8189,
                latitude: 1.3069,
                zoom: 11,
              }}
              mapStyle="mapbox://styles/mapbox/streets-v12"
              mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
              style={{
                width: "100%",
                height: "70vh",
              }}
              mapLib={import("mapbox-gl")}
              onClick={() => setPopupInfo(null)}
            >
              <GeolocateControl position="top-left" />
              <NavigationControl position="top-left" />
              {pins}

              {popupInfo && (
                <Popup
                  longitude={popupInfo.address.longitude}
                  latitude={popupInfo.address.latitude}
                  anchor="bottom"
                  offset={22}
                  closeOnClick={false}
                  onClose={() => setPopupInfo(null)}
                  className="class-map-popup"
                >
                  <button
                    type="button"
                    className="class-popup-card"
                    onClick={() => openClass(popupInfo.listing)}
                  >
                    <img
                      src={popupInfo.listing?.images?.[0]}
                      alt={popupInfo.listing?.listing_title || "Class"}
                      className="class-popup-image"
                    />

                    <div className="class-popup-content">
                      <strong>{popupInfo.listing?.listing_title}</strong>
                      <span>
                        {popupInfo.address?.SEARCHVAL || "Location unavailable"}
                      </span>
                      <span className="class-popup-link">View class →</span>
                    </div>
                  </button>
                </Popup>
              )}
            </Map>
          )}
        </section>
      </div>
    </main>
  );
};

export default Classes;
