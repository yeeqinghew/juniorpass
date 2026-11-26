import { useEffect, useRef, useState } from "react";
import {
  Layout,
  Menu,
  ConfigProvider,
  Typography,
  Image,
  Button,
  Row,
  Col,
  Card,
  Drawer,
} from "antd";
import { Outlet, Link } from "react-router-dom";
import { Splide, SplideSlide } from "@splidejs/react-splide";
import { Grid } from "@splidejs/splide-extension-grid";
import "@splidejs/react-splide/css";
import AOS from "aos";
import "aos/dist/aos.css";
import Footer from "../../layouts/Footer";
import FAQ from "../FAQ";
import {
  SmileOutlined,
  BookOutlined,
  CheckCircleOutlined,
  MenuOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ThunderboltOutlined,
  SafetyCertificateOutlined,
  GiftOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import InfoCard from "../../utils/InfoCard";
import "./index.css";
import useWindowDimensions from "../../hooks/useWindowDimensions";
import logo from "../../images/logopngResize.png";
import homepageVideo from "../../videos/homepage.mp4";
import heroPoster from "../../images/juniorPASS.png";
import { BRAND_PRIMARY, BRAND_BG } from "../../theme";

const { Header, Content } = Layout;
const { Text, Title } = Typography;

function HomePage() {
  const isProduction = import.meta.env.VITE_NODE_ENV === "production";
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const { isMobile } = useWindowDimensions();
  const [scrolled, setScrolled] = useState(false);
  const [videoPaused, setVideoPaused] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleMouseEnter = (index: number): void => {
    setHoveredIndex(index);
  };

  const handleMouseLeave = () => {
    setHoveredIndex(-1);
  };

  const toggleVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setVideoPaused(false);
    } else {
      video.pause();
      setVideoPaused(true);
    }
  };

  const images = import.meta.glob(
    "../../images/partners/*.{png,jpg,jpeg,svg}",
    {
      eager: true, // Load immediately instead of lazy
    },
  );
  const imageList = Object.values(images).map(
    (mod) => (mod as { default: string }).default,
  );

  const showDrawer = () => {
    setDrawerVisible(true);
  };

  const closeDrawer = () => {
    setDrawerVisible(false);
  };

  const cardsData = [
    {
      title: "Register",
      icon: <SmileOutlined className="homepage-icon" />,
      description:
        "Create your account to join a vibrant community of parents and learners. Enjoy easy access to our platform, personalized recommendations, and exclusive benefits.",
    },
    {
      title: "Find a Class",
      icon: <BookOutlined className="homepage-icon" />,
      description:
        "Explore a wide variety of classes tailored to your child's interests and needs. From art to science, browse through our curated options and discover their next favorite class.",
    },
    {
      title: "Book it!",
      icon: <CheckCircleOutlined className="homepage-icon" />,
      description:
        "Secure your spot in just a few clicks! Enjoy a seamless booking process and get your child started on their learning adventure right away.",
    },
  ];

  const valuePropData = [
    {
      icon: <ThunderboltOutlined />,
      title: "100+ Classes",
      subtitle: "Browse a curated library of enrichment activities across arts, sports, music, coding, and more.",
    },
    {
      icon: <SafetyCertificateOutlined />,
      title: "Trusted Partners",
      subtitle: "Every provider is verified. We only list Singapore's best-reviewed enrichment centres.",
    },
    {
      icon: <GiftOutlined />,
      title: "Flexible Credits",
      subtitle: "Buy a credit bundle once, then use it across any class — no subscriptions, no lock-in.",
    },
  ];


  useEffect(() => {
    // Initialize AOS
    AOS.init({
      duration: 1000,
      once: true,
      offset: 80,
      easing: "ease-out-cubic",
      delay: 100,
    });

    const handleScroll = () => {
      if (isMobile) {
        let threshold = 300;
        setScrolled(window.scrollY > threshold);
        return;
      }
      setScrolled(window.scrollY > window.innerHeight);
    };

    window.addEventListener("scroll", handleScroll);

    // Smooth scroll polyfill for older browsers
    document.documentElement.style.scrollBehavior = "smooth";

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [isMobile]);

  return (
    <ConfigProvider
      theme={{
        token: {
          // Seed Token
          borderRadius: 2,
          colorPrimary: BRAND_PRIMARY,
          colorPrimaryActive: BRAND_PRIMARY,

          // Alias Token
          colorBgContainer: BRAND_BG,
          fontSize: 14,
          colorLink: "black",
          fontFamily: "Poppins, sans-serif",
        },
        components: {
          Layout: {
            headerBg: BRAND_BG,
            bodyBg: BRAND_BG,
            headerHeight: 84,
          },
          Menu: {
            horizontalItemSelectedColor: BRAND_PRIMARY,
          },
          Tabs: {
            itemActiveColor: BRAND_PRIMARY,
            itemHoverColor: BRAND_PRIMARY,
            itemSelectedColor: BRAND_PRIMARY,
            inkBarColor: BRAND_PRIMARY,
          },
          Typography: {
            fontFamily: "Poppins, sans-serif",
          },
        },
      }}
    >
      <Layout className="homepage-layout">
        <Header
          id={"header-homepage"}
          className={`homepage-header ${scrolled ? "homepage-header--scrolled" : ""}`}
        >
          {/* Logo */}
          <Link to="/">
            <Image
              className="logo-homepage"
              alt="logo"
              src={logo}
              preview={false}
            />
          </Link>

          {/* Hamburger menu (visible on mobile) */}
          <div className="hamburger-menu" onClick={showDrawer}>
            <MenuOutlined
              className={`hamburger-icon ${scrolled ? "hamburger-icon--scrolled" : ""}`}
            />
          </div>

          {/* Drawer (Hamburger menu for mobile) */}
          <Drawer
            placement="right"
            onClose={closeDrawer}
            open={drawerVisible}
            width="100%"
            className="homepage-drawer"
            zIndex={1050}
            styles={{
              mask: { zIndex: 1040 },
              wrapper: { zIndex: 1050 },
            }}
          >
            <Menu
              mode="vertical"
              onClick={closeDrawer}
              className="homepage-drawer__menu"
            >
              {!isProduction && (
                <Menu.Item key="classes">
                  <Link to="/classes" className="homepage-drawer__menu-item">
                    Browse Classes
                  </Link>
                </Menu.Item>
              )}
              <Menu.Item key="package-types">
                <Link
                  to="/package-types"
                  className="homepage-drawer__menu-item"
                >
                  Package Types
                </Link>
              </Menu.Item>
              <Menu.Item key="plan">
                <Link to="/pricing" className="homepage-drawer__menu-item">
                  Credits
                </Link>
              </Menu.Item>
              {!isProduction && (
                <Menu.Item key="login">
                  <Link to="/login" className="homepage-drawer__menu-item">
                    Login/Register
                  </Link>
                </Menu.Item>
              )}
            </Menu>
          </Drawer>

          <Menu mode="horizontal">
            {!isProduction && (
              <Menu.Item key="classes">
                <Link
                  to="/classes"
                  className={`homepage-menu__link ${scrolled ? "homepage-menu__link--scrolled" : ""}`}
                >
                  Browse Classes
                </Link>
              </Menu.Item>
            )}
            <Menu.Item key="package-types">
              <Link
                to="/package-types"
                className={`homepage-menu__link ${scrolled ? "homepage-menu__link--scrolled" : ""}`}
              >
                Package Types
              </Link>
            </Menu.Item>
            <Menu.Item key="plan">
              <Link
                to="/pricing"
                className={`homepage-menu__link ${scrolled ? "homepage-menu__link--scrolled" : ""}`}
              >
                Credits
              </Link>
            </Menu.Item>
            {!isProduction && (
              <Menu.Item key="login">
                <Link
                  to="/login"
                  className={`homepage-menu__link ${scrolled ? "homepage-menu__link--scrolled" : ""}`}
                >
                  Login/Register
                </Link>
              </Menu.Item>
            )}
          </Menu>
        </Header>
        <Content className="homepage-content">
          {/* Hero Section */}
          <div>
            <Outlet />
            <div className="headline-div">
              {/* Background Video */}
              <video
                ref={videoRef}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                className="video-src"
                poster={heroPoster}
                aria-hidden="true"
              >
                <source src={homepageVideo} type="video/mp4" />
                Your browser does not support the video tag.
              </video>

              {/* Video pause/play accessibility control */}
              <button
                className="video-pause-btn"
                onClick={toggleVideo}
                aria-label={videoPaused ? "Play background video" : "Pause background video"}
                title={videoPaused ? "Play video" : "Pause video"}
              >
                {videoPaused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
              </button>

              {/* Overlay Content */}
              <div className="overlay-homepage">
                <div className="headline-content-wrapper">
                  <span className="headline-title-wrapper">
                    <p className="hero-eyebrow">Singapore's #1 Enrichment Platform</p>
                    <Title level={1} className="title headline-title">
                      Help your kids find their spark.
                    </Title>
                    <p className="hero-subheadline">
                      Browse and book top enrichment classes — all in one place.
                    </p>
                  </span>
                </div>
              </div>
              <div className="headline-cta">
                {isProduction ? (
                  <Button
                    type="primary"
                    className="headline-button"
                    size="large"
                    disabled
                  >
                    Try it now (Coming Soon)
                  </Button>
                ) : (
                  <Link to="/register">
                    <Button
                      type="primary"
                      className="headline-button"
                      size="large"
                    >
                      Start Your Journey
                    </Button>
                  </Link>
                )}
                <Link to="/about-us">
                  <Button className="headline-button" size="large">
                    Learn More
                  </Button>
                </Link>
              </div>
            </div>

            {/* Value Props Section */}
            <div className="value-props-div">
              <Row gutter={[32, 32]} justify="center">
                {valuePropData.map((item, index) => (
                  <Col xs={24} sm={24} md={8} key={index} data-aos="fade-up" data-aos-delay={index * 120}>
                    <div className="value-prop-item">
                      <div className="value-prop-icon">{item.icon}</div>
                      <div className="value-prop-text">
                        <strong className="value-prop-title">{item.title}</strong>
                        <span className="value-prop-subtitle">{item.subtitle}</span>
                      </div>
                    </div>
                  </Col>
                ))}
              </Row>
            </div>

            {/* partners */}
            <div className={"partner-div"}>
              <div className="partner-header">
                <Title level={1} className="title partner-title">
                  Trusted by Leading Educators
                </Title>
                <Text className="partner-subtitle">
                  We partner with Singapore's best enrichment providers to bring
                  quality learning experiences to your children
                </Text>
              </div>
              <Splide
                extensions={{ Grid }}
                options={{
                  pagination: false,
                  type: "loop",
                  perPage: 4,
                  perMove: 1,
                  gap: "24px",
                  arrows: true,
                  autoplay: true,
                  interval: 3000,
                  breakpoints: {
                    1200: {
                      perPage: 3,
                      gap: "20px",
                    },
                    900: {
                      perPage: 2,
                      gap: "16px",
                    },
                    600: {
                      perPage: 2,
                      gap: "12px",
                    },
                  },
                }}
              >
                {imageList.map((image, index) => (
                  <SplideSlide key={`partner-${index}`}>
                    <Card
                      className="partner-splide-card partner-card-wrapper"
                      bordered={false}
                    >
                      <Image
                        src={image}
                        alt={`Partner logo ${index + 1}`}
                        preview={false}
                        className="partner-logo"
                      />
                    </Card>
                  </SplideSlide>
                ))}
              </Splide>
            </div>

            <div className="join-us-div">
              {/* Title and Subtitle */}
              <div className="join-us-header" data-aos="fade-up">
                <Title level={1} className="title join-us-title">
                  Getting Started is Easy
                </Title>
                <Text className="join-us-subtitle">
                  Three simple steps to unlock amazing learning experiences for
                  your child
                </Text>
              </div>

              {/* Cards Section */}
              <Row
                gutter={[32, 32]}
                justify="center"
                className="join-us-cards-row"
              >
                {cardsData.map((card, index) => (
                  <Col
                    xs={24}
                    sm={24}
                    md={8}
                    lg={8}
                    key={index}
                    data-aos="fade-up"
                    data-aos-delay={index * 150}
                  >
                    <div className="step-number">{index + 1}</div>
                    <InfoCard
                      icon={card.icon}
                      title={card.title}
                      description={card.description}
                      hovered={hoveredIndex === index}
                      onHover={() => handleMouseEnter(index)}
                      onLeave={() => handleMouseLeave()}
                    />
                  </Col>
                ))}
              </Row>

              {/* CTA Button */}
              <div
                className="join-us-cta"
                data-aos="fade-up"
                data-aos-delay="500"
              >
                <Link to="/">
                  {/* <Link to="/register"> */}
                  <Button
                    type="primary"
                    size="large"
                    className="join-us-button"
                  >
                    Start Your Journey Today
                  </Button>
                </Link>
              </div>
            </div>

            {/* FAQs */}
            <div className="faq-div">
              <div className="faq-inner-div">
                <Row gutter={[32, 32]} align="top">
                  {/* Title Column */}
                  <Col xs={24} sm={24} md={8} lg={7} data-aos="fade-right">
                    <div className="faq-header-section">
                      <Title className="title faq-title" level={1}>
                        Got Questions?
                      </Title>
                      <Text className="faq-subtitle">
                        Find answers to common questions about our services,
                        booking process, and credit system.
                      </Text>
                    </div>
                  </Col>

                  {/* FAQ Collapse Column */}
                  <Col
                    xs={24}
                    sm={24}
                    md={16}
                    lg={17}
                    data-aos="fade-left"
                    data-aos-delay="200"
                  >
                    <FAQ />
                  </Col>
                </Row>
              </div>
            </div>

          </div>
        </Content>
      </Layout>
      <Footer />
    </ConfigProvider>
  );
}

export default HomePage;
