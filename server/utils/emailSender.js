const { Resend } = require("resend");
const resend = new Resend(process.env.resendApiKey);

const sendEmail = async (to, subject, html) => {
  try {
    const response = await resend.emails.send({
      from: "JuniorPass <admin@juniorpass.sg>",
      to,
      subject,
      html,
    });
    console.log(`✅ Email sent successfully to ${to}`);
  } catch (err) {
    console.error("Error sending email:", err);
    throw new Error(`Email sending failed: ${err.message}`);
  }
};

module.exports = sendEmail;
