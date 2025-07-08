const cron = require('node-cron');
const { getUnpaidInvoices, getCustomerByEmail } = require('../db');

let botInstance = null;

function setupReminders(bot) {
  botInstance = bot;
  // Runs every day at 9am server time
  cron.schedule('0 9 * * *', async () => {
    try {
      const unpaid = await getUnpaidInvoices();
      for (const inv of unpaid) {
        const customer = await getCustomerByEmail(inv.customer_email);
        if (customer && customer.telegram_id) {
          await botInstance.api.sendMessage(
            customer.telegram_id,
            `⏰ *Invoice Reminder*\n\nYou have an unpaid invoice:\n• Amount: $${inv.amount}\n• Description: ${inv.description}\n• Status: ${inv.status}\n\nPlease pay as soon as possible.`,
            { parse_mode: 'Markdown' }
          );
        }
      }
      console.log(`[reminder] Sent reminders for ${unpaid.length} unpaid invoices.`);
    } catch (err) {
      console.error('[reminder] Error sending reminders:', err);
    }
  });
}

module.exports = { setupReminders };