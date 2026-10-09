const { Resend } = require("resend");

let resend;

const getEmailClient = () => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required to send email");
  }
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
};

const sendEmail = async (to, subject, html, options = {}) => {
  try {
    const { data, error } = await getEmailClient().emails.send(
      {
        from: "JuniorPass <admin@juniorpass.sg>",
        to,
        subject,
        html,
      },
      options.idempotencyKey
        ? { idempotencyKey: options.idempotencyKey }
        : undefined,
    );

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
