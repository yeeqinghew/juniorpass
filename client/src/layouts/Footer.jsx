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

const { Text, Title } = Typography;
const { Footer: Foot } = Layout;

const Footer = () => {
  const isProduction = import.meta.env.VITE_NODE_ENV === "production";
  const { isDesktop, isTabletLandscape } = useWindowDimensions();

  // desktop and tablet landscape
  if (isDesktop || isTabletLandscape) {
    return (
      <Foot style={{ background: "#FCFBF8", padding: "20px 150px" }}>
        <Divider></Divider>
        <Flex style={{ width: "100%" }}>
          <Flex style={{ width: "25%", justifyContent: "flex-start" }}>
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

          <Flex
            style={{
              right: 0,
              width: "90%",
              justifyContent: "flex-end",
              textAlign: "left",
            }}
          >
            <Flex vertical gap="large" style={{ width: "20%" }}>
              <Title level={5}>Junior Pass</Title>
              <Link to="/about-us">About us</Link>
              {!isProduction && <Link to="/classes">Classes</Link>}
              <Link to="/pricing">Pricing</Link>
            </Flex>

            <Flex vertical gap="large" style={{ width: "20%" }}>
              <Title level={5}>PARTNERS</Title>
              <Link to="/partner-contact">Become a partner</Link>
              <Link to="https://partner.juniorpass.sg">Partner Login</Link>
            </Flex>

            <Flex vertical gap="large" style={{ width: "20%" }}>
              <Title level={5}>FOLLOW US</Title>
              <Space direction="horizontal">
                <MailOutlined />
                <Link to="mailto:admin@juniorpass.sg">admin@juniorpass.sg</Link>
              </Space>
              {!isProduction && (
                <Flex vertical={false} gap="large" style={{ width: "15%" }}>
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
    <Foot style={{ background: "#FCFBF8", padding: "10px" }}>
      <Divider />

      {/* Center the logo */}
      <Flex
        vertical
        gap="large"
        style={{ justifyContent: "center", alignItems: "center" }}
      >
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
      <Flex
        vertical
        gap="middle"
        style={{
          justifyContent: "center",
          alignItems: "center",
          margin: "24px",
        }}
      >
        <Space
          direction="horizontal"
          style={{ justifyContent: "center", alignItems: "center" }}
        >
          <MailOutlined />
          <Link to="mailto:admin@juniorpass.sg">admin@juniorpass.sg</Link>
        </Space>

        {!isProduction && (
          <Flex
            vertical={false}
            gap="large"
            style={{ width: "15%", justifyContent: "center" }}
          >
            <Space
              direction="horizontal"
              style={{ justifyContent: "center", alignItems: "center" }}
            >
              <FacebookFilled />
            </Space>
            <Space
              direction="horizontal"
              style={{ justifyContent: "center", alignItems: "center" }}
            >
              <Link to="https://www.instagram.com/juniorpass.sg/">
                <InstagramOutlined />
              </Link>
            </Space>
            <Space
              direction="horizontal"
              style={{ justifyContent: "center", alignItems: "center" }}
            >
              <LinkedinFilled />
            </Space>
          </Flex>
        )}

        {/* Phone */}
        {!isProduction && (
          <Space
            direction="horizontal"
            style={{ justifyContent: "center", alignItems: "center" }}
          >
            <PhoneOutlined />
            <Text>(65)XXXX-XXXX</Text>
          </Space>
        )}
      </Flex>

      <Divider />
      {/* Copyright and UEN */}
      <Flex style={{ justifyContent: "center", alignItems: "center" }}>
        © Copyright {new Date().getFullYear()} Junior Pass (UEN: 202411484C)
      </Flex>
    </Foot>
  );
};

export default Footer;
