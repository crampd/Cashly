const { getAdminRole } = require('../db');

module.exports = async function helpCommand(ctx) {
  let role = 'user';
  if (ctx.from) {
    try {
      role = await getAdminRole(String(ctx.from.id)) || 'user';
    } catch {}
  }

  let commands = [
    '🤖 <b>Cashly Bot Help</b>',
    '',
    '<b>General Commands:</b>',
    '/start - Start the bot and see a welcome message',
    '/help - Show this help message',
    '/faq - Frequently asked questions',
  ];

  if (['admin', 'manager'].includes(role)) {
    commands.push(
      '',
      '<b>Manager/Admin Commands:</b>',
      '/salesreport - Show sales report',
      '/customers - Customer management menu',
      '/invoice - Invoice management menu',
      '/call - Initiate an outbound AI-powered call to a customer'
    );
  }

  if (role === 'admin') {
    commands.push(
      '',
      '<b>Admin Only:</b>',
      '/admins - Manage admins and users',
      '/settings - Bot settings menu',
      '/export - Export data'
    );
  }

  commands.push(
    '',
    '✨ <i>Tip: Use the inline menu for all customer and invoice actions.</i>',
    '📞 <i>Use /call to start an outbound AI call to a customer (admins/managers only).</i>',
    '💡 <i>Need more info? Use /faq or contact support.</i>'
  );

  return ctx.reply(commands.join('\n'), { parse_mode: 'HTML', disable_web_page_preview: true });
};