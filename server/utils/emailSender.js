const nodemailer = require("nodemailer");

/**
 * Sends an email using nodemailer.
 * @param {string} to - Recipient's email address.
 * @param {string} subject - Subject of the email.
 * @param {string} html - HTML content of the email.
 */

const sendEmail = async (to, subject, html) => {
  const transporter = nodemailer.createTransport({
    service: "Gmail",
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.gmailAccount,
      pass: process.env.gmailPassword,
    },
  });

  const mailOptions = {
    from: process.env.gmailAccount,
    to,
    subject,
    html,
  };

  try {
    await transporter.sendMail(mailOptions);
    // TODO: return status with message?
  } catch (err) {
    console.error("Error sending email: ", error);
    throw new Error("Email sending failed");
  }
};

module.exports = sendEmail;
