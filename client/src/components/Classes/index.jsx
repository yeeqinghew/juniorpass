import { useEffect, useMemo, useState, useRef } from "react";
import {
  Space,
  Input,
  List,
  Rate,
  Image,
  Tag,
  Divider,
  Button,
  Dropdown,
  Checkbox,
  Menu,
  DatePicker,
  TimePicker,
} from "antd";
import {
  SearchOutlined,
  EnvironmentTwoTone,
  DownOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import Map, {
  Marker,
  Popup,
  NavigationControl,
  GeolocateControl,
} from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useNavigate } from "react-router-dom";
import getBaseURL from "../../utils/config.jsx";
import toast from "react-hot-toast";
import "./index.css";
import useWindowDimensions from "../../hooks/useWindowDimensions.jsx";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween.js";
import { WEEKDAYS } from "../../constants.jsx";
import { applyTimeToDate } from "../../utils/timeHelpers.jsx";
dayjs.extend(isBetween);

const Classes = () => {
  const baseURL = getBaseURL();
  const [popupInfo, setPopupInfo] = useState(null);
  const [listings, setListings] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ageGroups, setAgeGroups] = useState([]);
  const [packageTypes, setPackageTypes] = useState([]);
  const [filterInput, setFilterInput] = useState(null);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedAgeGroups, setSelectedAgeGroups] = useState([]);
  const [selectedPackageTypes, setSelectedPackageTypes] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedDateTime, setSelectedDateTime] = useState(null);
  const [useSpecificDate, setUseSpecificDate] = useState(false);
  const [tempDate, setTempDate] = useState(null);
  const [tempTime, setTempTime] = useState(null);
  const [view, setView] = useState("list"); // 'list' or 'map'
  const { isMobile, isTabletPortrait } = useWindowDimensions();
  const isMobileOrTabletPortrait = isMobile || isTabletPortrait;
  const navigate = useNavigate();
  const mapRef = useRef();

  const getListings = async () => {
    try {
      const response = await fetch(`${baseURL}/listings`, {
        method: "GET",
      });
      const jsonData = await response.json();
      setListings(jsonData);
    } catch (error) {
      console.error(error.message);
      toast.error(error.message);
    }
  };

  const getCategories = async () => {
    try {
      const response = await fetch(`${baseURL}/misc/getAllCategories`);
      const jsonData = await response.json();
      setCategories(jsonData);
    } catch (error) {
      console.error(error.message);
    }
  };

  const getAgeGroups = async () => {
    try {
      const response = await fetch(`${baseURL}/misc/getAllAgeGroups`);
      const jsonData = await response.json();
      setAgeGroups(jsonData);
    } catch (error) {
      console.error(error.message);
    }
  };

  const getAgeGroupLabel = (min_age, max_age) => {
    if (max_age === null) {
      return `above ${min_age} years old`;
    }
    return `${min_age}-${max_age} years old`;
  };

  const getPackageTypes = async () => {
    try {
      const response = await fetch(`${baseURL}/misc/getAllPackages`);
      const jsonData = await response.json();
      setPackageTypes(jsonData);
    } catch (error) {
      console.error(error.message);
    }
  };

  const pins = useMemo(() => {
    return listings?.map((listing) => {
      // Use a more visible color for map pins - bright coral/red stands out better on maps
      const color = "#ff4757"; // Bright coral red for maximum visibility

      return listing?.schedule_info.map((outlet, index) => {
        let parsedAddress = {};
        try {
          parsedAddress = JSON.parse(outlet?.outlet_address || "{}");
        } catch (e) {
          parsedAddress = {};
        }
        if (!parsedAddress.LONGITUDE || !parsedAddress.LATITUDE) {
          return null;
        }
        return (
          <Marker
            key={`${listing?.listing_id}-${index}`}
            longitude={parsedAddress.LONGITUDE}
            latitude={parsedAddress.LATITUDE}
            anchor="top"
            onClick={(e) => {
              // If we let the click event propagates to the map, it will immediately close the popup
              // with `closeOnClick: true`
              e.originalEvent.stopPropagation();
              setPopupInfo(listing);
            }}
          >
            <div
              style={{
                position: "relative",
                animation: "pulse 2s ease-in-out infinite",
              }}
            >
              <EnvironmentTwoTone
                twoToneColor={color}
                style={{
                  fontSize: "64px",
                  cursor: "pointer",
                  filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.5))",
                  transition: "transform 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
              />
            </div>
          </Marker>
        );
      });
    });
  }, [listings]);

  const handleCategoryChange = (category) => {
    setSelectedCategories((prevCategories) =>
      prevCategories.includes(category.name)
        ? prevCategories.filter((item) => item !== category.name)
        : [...prevCategories, category.name]
    );
  };

  const handleAgeGroupChange = (ageGroup) => {
    setSelectedAgeGroups((prevAgeGroups) =>
      prevAgeGroups.includes(ageGroup)
        ? prevAgeGroups.filter((item) => item !== ageGroup)
        : [...prevAgeGroups, ageGroup]
    );
  };

  const handlePackageTypeChange = (packageType) => {
    setSelectedPackageTypes((prevSelected) => {
      if (prevSelected.includes(packageType.package_type)) {
        return prevSelected.filter((type) => type !== packageType.package_type);
      } else {
        return [...prevSelected, packageType.package_type];
      }
    });
  };

  const applyFilters = (listings) => {
    return listings.filter((listing) => {
      // Categories
      const matchesCategory =
        selectedCategories.length === 0 ||
        listing?.partner_info?.categories.some((category) =>
          selectedCategories.includes(category)
        );

      // Age groups
      const ageGroups = listing.age_groups.replace(/[{}]/g, "").split(",");
      const matchesAgeGroup =
        selectedAgeGroups.length === 0 ||
        ageGroups.some((ageGroup) => selectedAgeGroups.includes(ageGroup));

      // Package types
      const packageTypes = listing.package_types
        .replace(/[{}]/g, "")
        .split(",");
      const matchesPackageType =
        selectedPackageTypes.length === 0 ||
        packageTypes.some((type) => selectedPackageTypes.includes(type));

      // Selected day
      const matchesSelectedDay =
        !selectedDay ||
        (Array.isArray(listing.schedule_info) &&
          listing.schedule_info.some(
            (schedule) =>
              schedule?.day?.toLowerCase() === selectedDay?.toLowerCase()
          ));

      // Specific date
      const matchesSpecificDateAndTime =
        !useSpecificDate || !selectedDateTime
          ? true
          : listing.schedule_info?.some((schedule) => {
              const selectedDate = dayjs(selectedDateTime);
              const selectedDayName = selectedDate.format("dddd");
              if (schedule.day?.toLowerCase() !== selectedDayName.toLowerCase())
                return false;

              const [startStr, endStr] = schedule.timeslot || [];
              if (!startStr || !endStr) return false;

              const { start, end } = applyTimeToDate(
                selectedDate,
                startStr,
                endStr
              );

              return selectedDate.isBetween(start, end, "minute", "[)");
            });

      const isMatch = useSpecificDate
        ? matchesCategory &&
          matchesAgeGroup &&
          matchesPackageType &&
          matchesSpecificDateAndTime
        : matchesCategory &&
          matchesAgeGroup &&
          matchesPackageType &&
          matchesSelectedDay;
      return isMatch;
    });
  };

  const onSearch = (e) => {
    const filteredData = listings.filter((item) => {
      return Object.keys(item).some((key) => {
        return String(item[key])
          .toLowerCase()
          .includes(e.target.value.toLowerCase());
      });
    });
    setFilterInput(applyFilters(filteredData));
  };

  useEffect(() => {
    getListings();
    getCategories();
    getAgeGroups();
    getPackageTypes();
  }, []);

  useEffect(() => {
    setFilterInput(applyFilters(listings));
  }, [
    listings,
    selectedCategories,
    selectedAgeGroups,
    selectedPackageTypes,
    selectedDay,
    selectedDateTime,
    useSpecificDate,
  ]);

  // Resize map when view changes (important for mobile)
  useEffect(() => {
    if (view === "map" && mapRef.current) {
      // Small delay to ensure DOM has updated
      setTimeout(() => {
        mapRef.current?.resize();
      }, 100);
    }
  }, [view]);

  const handleListHover = (listingId) => {
    // Find the listing with the matching listingId
    const listing = listings.find(
      (listing) => listing?.listing_id === listingId
    );
    if (listing) {
      // Set popupInfo to the details of the listing
      setPopupInfo(listing);
    }
  };

  const handleListLeave = () => {
    setPopupInfo(null); // Clear popupInfo when leaving the list item
  };

  // TODO: if listing is created less than 7 days, get a NEW tag
  return (
    <div className="classes">
      <Space direction="vertical" wrap>
        <div className="searchbar-container">
          <Input
            size="large"
            allowClear
            onChange={onSearch}
            className={"searchbar"}
            prefix={<SearchOutlined />}
            placeholder="Search by location, classes, category"
          />
          {isMobileOrTabletPortrait && (
            <Button
              type="primary"
              onClick={() => setView(view === "list" ? "map" : "list")}
              className={"listMapButton"}
            >
              {view === "list" ? "Map" : "List"}
            </Button>
          )}
        </div>
        <Space
          direction="horizontal"
          size={isMobileOrTabletPortrait ? "small" : "large"}
          className="filter-container"
          wrap
        >
          <Space direction="horizontal">
            {/* Categories Filter */}
            <Dropdown
              overlay={
                <Menu>
                  {categories.map((category) => (
                    <Menu.Item
                      key={category.id}
                      onClick={() => handleCategoryChange(category)}
                    >
                      <Checkbox
                        checked={selectedCategories.includes(category.name)}
                      >
                        {category.name}
                      </Checkbox>
                    </Menu.Item>
                  ))}
                </Menu>
              }
            >
              <Button>
                Categories <DownOutlined />
              </Button>
            </Dropdown>
          </Space>
          <Space direction="horizontal">
            <Dropdown
              overlay={
                <Menu>
                  {ageGroups.map((ageGroup) => (
                    <Menu.Item
                      key={ageGroup.id}
                      onClick={() => handleAgeGroupChange(ageGroup.name)}
                    >
                      <Checkbox
                        checked={selectedAgeGroups.includes(ageGroup.name)}
                      >
                        {getAgeGroupLabel(ageGroup.min_age, ageGroup.max_age)}
                      </Checkbox>
                    </Menu.Item>
                  ))}
                </Menu>
              }
            >
              <Button>
                Age groups <DownOutlined />
              </Button>
            </Dropdown>
          </Space>
          <Space direction="horizontal">
            {/* Package Types Filter */}
            <Dropdown
              overlay={
                <Menu>
                  {packageTypes.map((packageType) => (
                    <Menu.Item
                      key={packageType.id}
                      onClick={() => handlePackageTypeChange(packageType)}
                    >
                      <Checkbox
                        checked={selectedPackageTypes.includes(
                          packageType.package_type
                        )}
                      >
                        {packageType.name}
                      </Checkbox>
                    </Menu.Item>
                  ))}
                </Menu>
              }
            >
              <Button>
                Package types <DownOutlined />
              </Button>
            </Dropdown>

            {/* Toggle Between "Day of the Week" & "Specific Date" */}
            <Space direction="horizontal">
              <Button
                type={!useSpecificDate ? "primary" : "default"}
                onClick={() => {
                  setUseSpecificDate(false);
                  setSelectedDateTime(null); // Clear specific date filter if switching
                }}
              >
                Filter by Day
              </Button>

              <Button
                type={useSpecificDate ? "primary" : "default"}
                onClick={() => {
                  setUseSpecificDate(true);
                  setSelectedDay(null); // Clear day filter if switching
                }}
              >
                Filter by Specific Date
              </Button>
            </Space>

            {/* Show "Select Day" only if "Filter by Day" is selected */}
            {!useSpecificDate && (
              <Dropdown
                overlay={
                  <Menu>
                    {WEEKDAYS.map((day) => (
                      <Menu.Item key={day} onClick={() => setSelectedDay(day)}>
                        {day}
                      </Menu.Item>
                    ))}
                  </Menu>
                }
              >
                <Button>
                  {selectedDay ? `Day: ${selectedDay}` : "Select Day"}{" "}
                  <DownOutlined />
                </Button>
              </Dropdown>
            )}

            {/* Show "Select Date & Time" only if "Filter by Specific Date" is selected */}
            {useSpecificDate && (
              <Space direction="horizontal">
                <DatePicker
                  onChange={(date) => {
                    setTempDate(date);
                    // Update selectedDateTime immediately if time is already selected
                    if (date && tempTime) {
                      setSelectedDateTime(
                        dayjs(date)
                          .hour(tempTime.hour())
                          .minute(tempTime.minute())
                          .second(0)
                      );
                    }
                  }}
                  placeholder="Select Date"
                  allowClear
                />

                <TimePicker
                  format="HH:mm"
                  minuteStep={30}
                  onChange={(time) => {
                    setTempTime(time);
                    // Update selectedDateTime immediately if date is already selected
                    if (tempDate && time) {
                      setSelectedDateTime(
                        dayjs(tempDate)
                          .hour(time.hour())
                          .minute(time.minute())
                          .second(0)
                      );
                    }
                  }}
                  placeholder="Select Time"
                  allowClear
                />
              </Space>
            )}
          </Space>
        </Space>
        <Space className={"clearall-container"} direction="horizontal">
          <Button
            block
            onClick={() => {
              setSelectedCategories([]);
              setSelectedAgeGroups([]);
              setSelectedPackageTypes([]);
              setSelectedDay(null);
              setSelectedDateTime(null);
              setUseSpecificDate(false);
            }}
          >
            Clear All <CloseOutlined />
          </Button>
        </Space>
        <Divider />
        <Space className={"listingmap-container"}>
          {(view === "list" || !isMobileOrTabletPortrait) && (
            <div className={"listing-container"}>
              <List
                itemLayout="horizontal"
                dataSource={Array.isArray(filterInput) ? filterInput : listings}
                size="large"
                pagination={{
                  position: "bottom",
                  align: "end",
                  pageSize: 10,
                }}
                locale={{
                  emptyText: "No data available. Please check back later!",
                }}
                renderItem={(listing, index) => (
                  <List.Item
                    key={index}
                    onClick={() => {
                      navigate(`/class/${listing?.listing_id}`, {
                        state: {
                          listing,
                        },
                      });
                    }}
                    onMouseEnter={() => handleListHover(listing?.listing_id)}
                    onMouseLeave={handleListLeave}
                  >
                    <List.Item.Meta
                      style={{
                        display: "flex",
                        alignItems: "center",
                        cursor: "pointer",
                      }}
                      avatar={
                        <Image
                          src={listing?.images?.[0]}
                          alt={`Listing ${listing?.listing_title || ""}`}
                          width={240}
                          height={160}
                          style={{ objectFit: "cover" }}
                          preview={false}
                        />
                      }
                      title={
                        <Space direction="vertical">
                          <Space direction="horizontal">
                            {listing?.partner_info?.categories.map(
                              (category, index) => {
                                return <Tag key={index}>{category}</Tag>;
                              }
                            )}
                          </Space>
                          <a href={listing?.partner_info?.website}>
                            {listing?.listing_title}
                          </a>
                        </Space>
                      }
                      description={
                        <Space direction="vertical">
                          <div
                            style={{
                              display: "-webkit-box",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              maxHeight: "5em",
                              lineClamp: 3,
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: "vertical",
                            }}
                          >
                            {listing?.description}
                          </div>

                          <Space>
                            <Image
                              src={"../../images/graduation-hat.png"}
                              width={24}
                              height={24}
                              preview={false}
                            />
                            {listing?.age_groups
                              .replace(/[{}]/g, "")
                              .split(",")
                              .join(", ")}
                          </Space>

                          {listing?.partner_info?.rating !== 0 && (
                            <Rate
                              disabled
                              defaultValue={listing?.reviews}
                            ></Rate>
                          )}
                        </Space>
                      }
                    ></List.Item.Meta>
                  </List.Item>
                )}
              ></List>
            </div>
          )}
          {(view === "map" || !isMobileOrTabletPortrait) && (
            <Map
              ref={mapRef}
              className={"map"}
              initialViewState={{
                longitude: 103.8189,
                latitude: 1.3069,
                zoom: 11,
              }}
              mapStyle="mapbox://styles/mapbox/streets-v8"
              mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
              style={{
                width: isMobileOrTabletPortrait ? "100%" : "calc(40vw - 48px)",
                height: "70vh",
              }}
              mapLib={import("mapbox-gl")}
            >
              <GeolocateControl position="top-left" />
              <NavigationControl position="top-left" />
              {pins}

              {/* Display popups for popupInfo */}
              {popupInfo &&
                popupInfo?.schedule_info.map((schedule, index) => (
                  <Popup
                    key={`${popupInfo?.listing_id}-${index}`}
                    longitude={JSON.parse(schedule?.outlet_address).LONGITUDE}
                    latitude={JSON.parse(schedule?.outlet_address).LATITUDE}
                    onClose={() => setPopupInfo(null)}
                  >
                    <Space direction="vertical">
                      {popupInfo?.listing_title}
                      {JSON.parse(schedule?.outlet_address).SEARCHVAL}
                      <img width="100%" src={popupInfo.images[0]} />
                    </Space>
                  </Popup>
                ))}
            </Map>
          )}
        </Space>
      </Space>
    </div>
  );
};

export default Classes;
