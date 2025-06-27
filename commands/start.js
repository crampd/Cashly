const { InlineKeyboard } = require('grammy');

module.exports = async function startCommand(ctx) {
  const keyboard = new InlineKeyboard()
    .text('🧾 Invoice', '/invoice').row()
    .text('👥 Customers', '/customers').row()
    .text('❓ FAQ', 'open_faq').row()
    .url('🌐 Visit Website', 'https://your-website.com');
  return ctx.reply(
    '👋 <b>Welcome to Cashly!</b>\n\n' +
    'Easily manage your customers and invoices right here.\n\n' +
    'Use the menu below or type /help for all commands.',
    { reply_markup: keyboard, parse_mode: 'HTML' }
  );
};
