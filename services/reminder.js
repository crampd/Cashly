const cron = require('node-cron');
const { getUnpaidInvoices, getCustomerByEmail } = require('../db');
const { bot } = require('../bot'); // adjust import as needed

// Runs every day at 9am
cron.schedule('0 9 * * *', async () => {
  const unpaid = await getUnpaidInvoices();
  for (const inv of unpaid) {
    const customer = await getCustomerByEmail(inv.customer_email);
    if (customer && customer.telegram_id) {
      await bot.api.sendMessage(
        customer.telegram_id,
        `Reminder: Invoice ${inv.id} for $${inv.amount} is still unpaid.`
      );
    }
  }
});