const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

const sendAlertEmail = async (toEmail, message) => {
  await transporter.sendMail({
    from: `"SelectShans" <${process.env.MAIL_USER}>`,
    to: toEmail,   
    subject: "Ransomware Alert Detected",
    text: message,
  });
};

module.exports = { sendAlertEmail };

// Example registration
const registerUser = async (req, res) => {
  const { email, password } = req.body;

  await db.query(
    "INSERT INTO users (email, password) VALUES (?, ?)",
    [email, hashedPassword]
  );

  res.json({ message: "User registered" });
};