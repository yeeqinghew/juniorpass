const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async (to, subject, html) => {
  try {
    const { data, error } = await resend.emails.send({
      from: "JuniorPass <admin@juniorpass.sg>",
      to,
      subject,
      html,
    });

    if (error) {
      throw new Error(
        error.message || "The email provider rejected the request",
      );
    }

    console.log(`✅ Email sent successfully to ${to}`);
    return data;
  } catch (err) {
    console.error("Error sending email:", err);
    throw new Error(`Email sending failed: ${err.message}`);
  }
};

module.exports = sendEmail;
