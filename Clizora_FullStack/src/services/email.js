const nodemailer = require('nodemailer');

let transporter;
function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
  }
  return transporter;
}

async function sendOtpEmail(email, code) {
  const mailer = getTransporter();
  if (!mailer) {
    if (process.env.NODE_ENV === 'production') throw new Error('Email delivery is not configured. Set SMTP_HOST before enabling production sign-up.');
    console.log(`\n[CLIZORA DEV OTP] ${email}: ${code}\n`);
    return { delivered: false, development: true };
  }

  await mailer.sendMail({
    from: process.env.SMTP_FROM || 'Clizora <no-reply@example.com>',
    to: email,
    subject: 'Your Clizora verification code',
    text: `Your Clizora verification code is ${code}. It expires in 5 minutes.`,
    html: `<p>Your Clizora verification code is:</p><h2 style="letter-spacing:6px">${code}</h2><p>This code expires in 5 minutes.</p>`
  });
  return { delivered: true, development: false };
}

module.exports = { sendOtpEmail };
