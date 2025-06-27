const { InlineKeyboard } = require('grammy');

module.exports = async function faqCommand(ctx) {
  const keyboard = new InlineKeyboard()
    .text('Contact Support', 'contact_support')
    .url('Docs', 'https://grammy.dev/');

  return ctx.reply(
    '<b>Frequently Asked Questions</b>\n\n' +
    '1️⃣ <b>How do I manage customers?</b>\n' +
    'Use /customers or the inline menu to add, update, or export customers.\n\n' +
    '2️⃣ <b>How do I manage invoices?</b>\n' +
    'Use /invoice or the inline menu to create and send invoices.\n\n' +
    '3️⃣ <b>How do I export customers?</b>\n' +
    'Go to /customers and select "Export customers" (admins only).\n\n' +
    '4️⃣ <b>How do I get help?</b>\n' +
    'Use /help at any time or contact support below.\n',
    { parse_mode: 'HTML', reply_markup: keyboard }
  );
};