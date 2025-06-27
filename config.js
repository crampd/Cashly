module.exports = {
  // Telegram Bot Configuration
  BOT_TOKEN: process.env.BOT_TOKEN,

  // Stripe Configuration
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
  ADMINS: (process.env.ADMINS ? process.env.ADMINS.split(',') : ['123456789']),

  // Paypal Configuration
  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
  PAYPAL_ENV: process.env.PAYPAL_ENV,

  // Square Configuration
  SQUARE_ACCESS_TOKEN: process.env.SQUARE_ACCESS_TOKEN,
  SQUARE_LOCATION_ID: process.env.SQUARE_LOCATION_ID,

  // ElevenLabs Configuration
  ELEVEN_LAB_API_KEY: process.env.ELEVEN_LAB_API_KEY,
  ELEVEN_LAB_AGENT_ID: process.env.ELEVEN_LAB_AGENT_ID,

  // Twilio Configuration
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER
};
