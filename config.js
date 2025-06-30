require('dotenv').config();

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
  WEBHOOK_PORT: process.env.WEBHOOK_PORT
  // Add more configurations as needed
};
