import { Divider, Flex, Space, Image, Typography, Layout } from "antd";
import { Link } from "react-router-dom";
import {
  MailOutlined,
  PhoneOutlined,
  FacebookFilled,
  LinkedinFilled,
  InstagramOutlined,
} from "@ant-design/icons";
import useWindowDimensions from "../hooks/useWindowDimensions";
import logo from "../images/logopngResize.png";
import "./Footer.css";

const { Text, Title } = Typography;
const { Footer: Foot } = Layout;

const Footer = () => {
  const isProduction = import.meta.env.VITE_NODE_ENV === "production";
  const { isDesktop, isTabletLandscape } = useWindowDimensions();

  // desktop and tablet landscape
  if (isDesktop || isTabletLandscape) {
    return (
      <Foot className="site-footer site-footer-desktop">
        <Divider></Divider>
        <Flex className="site-footer-row">
          <Flex className="site-footer-logo-column">
            <Flex vertical gap="large">
              <Link to="/">
                <Image
                  alt="logo"
                  src={logo}
                  width={100}
                  height={50}
                  preview={false}
                />
              </Link>
            </Flex>
          </Flex>

          <Flex className="site-footer-links">
            <Flex vertical gap="large" className="site-footer-column">
              <Title level={5}>Junior Pass</Title>
              <Link to="/about-us">About us</Link>
              {!isProduction && <Link to="/classes">Classes</Link>}
              <Link to="/pricing">Pricing</Link>
            </Flex>

            <Flex vertical gap="large" className="site-footer-column">
              <Title level={5}>PARTNERS</Title>
              <Link to="/partner-contact">Become a partner</Link>
              <Link to="https://partner.juniorpass.sg">Partner Login</Link>
            </Flex>

            <Flex vertical gap="large" className="site-footer-column">
              <Title level={5}>FOLLOW US</Title>
              <Space direction="horizontal">
                <MailOutlined />
                <Link to="mailto:admin@juniorpass.sg">admin@juniorpass.sg</Link>
              </Space>
              {!isProduction && (
                <Flex vertical={false} gap="large" className="site-footer-socials">
                  <Space direction="horizontal">
                    <FacebookFilled />
                  </Space>

                  <Space direction="horizontal">
                    <Link to="https://www.instagram.com/juniorpass.sg/">
                      <InstagramOutlined />
                    </Link>
                  </Space>

                  <Space direction="horizontal">
                    <LinkedinFilled />
                  </Space>
                </Flex>
              )}
              {!isProduction && (
                <Space direction="horizontal">
                  <PhoneOutlined />
                  <Text>(65)XXXX-XXXX</Text>
                </Space>
              )}

              {/* <Space direction="horizontal">
        <WhatsAppOutlined />
        <Text>(65)XXXX-XXXX</Text>
      </Space> */}
            </Flex>
          </Flex>
        </Flex>
        <Divider></Divider>© Copyright {new Date().getFullYear()} Junior Pass
        (UEN: 202411484C)
      </Foot>
    );
  }

  // Mobile and tablet portrait
  return (
    <Foot className="site-footer site-footer-mobile">
      <Divider />

      {/* Center the logo */}
      <Flex vertical gap="large" className="site-footer-centered">
        <Link to="/">
          <Image
            alt="logo"
            src={logo}
            width={100}
            height={50}
            preview={false}
          />
        </Link>
      </Flex>

      {/* Center the contact and social links */}
      <Flex vertical gap="middle" className="site-footer-mobile-contact">
        <Space direction="horizontal" className="site-footer-centered">
          <MailOutlined />
          <Link to="mailto:admin@juniorpass.sg">admin@juniorpass.sg</Link>
        </Space>

        {!isProduction && (
          <Flex vertical={false} gap="large" className="site-footer-mobile-socials">
            <Space direction="horizontal" className="site-footer-centered">
              <FacebookFilled />
            </Space>
            <Space direction="horizontal" className="site-footer-centered">
              <Link to="https://www.instagram.com/juniorpass.sg/">
                <InstagramOutlined />
              </Link>
            </Space>
            <Space direction="horizontal" className="site-footer-centered">
              <LinkedinFilled />
            </Space>
          </Flex>
        )}

        {/* Phone */}
        {!isProduction && (
          <Space direction="horizontal" className="site-footer-centered">
            <PhoneOutlined />
            <Text>(65)XXXX-XXXX</Text>
          </Space>
        )}
      </Flex>

      <Divider />
      {/* Copyright and UEN */}
      <Flex className="site-footer-centered">
        © Copyright {new Date().getFullYear()} Junior Pass (UEN: 202411484C)
      </Flex>
    </Foot>
  );
};

export default Footer;
