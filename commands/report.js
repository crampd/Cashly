const { getInvoicesSummary } = require('../db');
const { InlineKeyboard } = require('grammy');

module.exports = async function reportCommand(ctx) {
  try {
    const summary = await getInvoicesSummary();
    const keyboard = new InlineKeyboard()
      .text('Download PDF', 'download_report_pdf')
      .text('Download CSV', 'download_report_csv');

    await ctx.reply(
      `📊 *Invoice Summary*\n\n` +
      `• Total Invoiced: $${summary.total}\n` +
      `• Paid: $${summary.paid}\n` +
      `• Unpaid: $${summary.unpaid}\n` +
      `• Overdue: $${summary.overdue}`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  } catch (err) {
    console.error('[report] Error:', err);
    await ctx.reply('❌ Failed to generate report.');
  }
};

// Optional: Add handlers for the inline keyboard callbacks in your bot.js
// Example:
// bot.callbackQuery('download_report_pdf', async ctx => { ... });
// bot.callbackQuery('download_report_csv', async ctx => { ...
