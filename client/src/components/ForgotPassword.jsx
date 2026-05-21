import { useState } from "react";
import { Form, Input, Button, Typography, Image } from "antd";
import { fetchWithAuth, API_ENDPOINTS } from "../utils/api";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";

const { Title, Text } = Typography;

const ForgotPassword = () => {
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false); // Track if the email is sent
  const [submittedEmail, setSubmittedEmail] = useState(""); // Store the submitted email

  const onFinish = async (values) => {
    setLoading(true);
    try {
      setSubmittedEmail(values.email); // Store email before sending request
      const response = await fetchWithAuth(API_ENDPOINTS.FORGOT_PASSWORD, {
        method: "POST",
        body: JSON.stringify({ email: values.email }),
      });

      const parseRes = await response.json();

      if (response.status === 400 && parseRes.message) {
        toast.error(parseRes.message);
      } else if (response.status === 200) {
        toast.success("Password reset email sent!");
        setEmailSent(true); // Show success message
      } else {
        toast.error("An unexpected error occurred.");
      }
    } catch (error) {
      toast.error(error.message || "Error occurred during the request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: "30px 40px",
        borderRadius: "10px",
        maxWidth: "600px",
        margin: "50px auto",
        boxShadow: "0 6px 20px rgba(0, 0, 0, 0.1)",
        background: "#ffffff",
      }}
    >
      {emailSent ? (
        <div style={{ textAlign: "center" }}>
          <Image
            src={"../images/success.gif"}
            alt="Success"
            style={{ width: "100px", marginBottom: "20px" }}
            preview={false}
          />
          <Title level={4}>
            A reset password email has been sent to{" "}
            <strong>{submittedEmail}</strong>.
          </Title>
          <Text>
            If you did not receive the email, please check your spam folder or{" "}
            <Link
              to="mailto:admin@juniorpass.sg"
              style={{ color: "#98BDD2", fontWeight: "bold" }}
            >
              contact us
            </Link>{" "}
            for help.
          </Text>
        </div>
      ) : (
        <Form
          onFinish={onFinish}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "15px",
          }}
        >
          <Title
            level={3}
            style={{ textAlign: "center", marginBottom: "20px" }}
          >
            Forgot Password
          </Title>
          <Form.Item
            name="email"
            rules={[
              {
                required: true,
                type: "email",
                message: "Please enter a valid email!",
              },
            ]}
          >
            <Input
              placeholder="Enter your email"
              size="large"
              style={{
                borderRadius: "8px",
                padding: "10px 12px",
                boxShadow: "0 2px 6px rgba(0, 0, 0, 0.1)",
              }}
            />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              style={{
                width: "100%",
              }}
            >
              Submit
            </Button>
          </Form.Item>
          <div style={{ textAlign: "center", marginTop: "20px" }}>
            <Text>Remembered your password? </Text>
            <Link to="/login" style={{ color: "#98BDD2", fontWeight: "bold" }}>
              Login
            </Link>
          </div>
        </Form>
      )}
    </div>
  );
};

export default ForgotPassword;
