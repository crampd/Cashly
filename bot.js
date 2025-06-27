const { Bot } = require('grammy');
const config = require('./config');
const { sessionMiddleware } = require('./middlewares/session');
const { requireRole } = require('./middlewares/accessControl');

// Command handlers
const start = require('./commands/start');
const customers = require('./commands/customers');
const invoice = require('./commands/invoice');
const admins = require('./commands/admins');
const help = require('./commands/help');
const faq = require('./commands/faq');
const setupCallCommand = require('./commands/call'); // <-- Add this line

const bot = new Bot(config.BOT_TOKEN);
bot.use(sessionMiddleware());

// Register commands
bot.command('start', start);
bot.command('help', help);
bot.command('faq', faq);
bot.command('customers', requireRole(['admin', 'manager', 'staff']), customers);
bot.command('invoice', requireRole(['admin', 'manager']), invoice);
bot.command('admins', requireRole(['admin']), admins);

// Register call command and its wizard
setupCallCommand(bot); // <-- Add this line

// Inline keyboard callback handlers
bot.on('callback_query:data', async (ctx, next) => {
  if (ctx.callbackQuery && ctx.callbackQuery.data) {
    if (ctx.callbackQuery.data.startsWith('customers:')) {
      return customers.handleCallbackQuery(ctx);
    }
    if (ctx.callbackQuery.data.startsWith('invoices:')) {
      return invoice.handleCallbackQuery(ctx);
    }
    if (ctx.callbackQuery.data.startsWith('admins:')) {
      return admins.handleCallbackQuery(ctx);
    }
  }
  await next();
});

// Multi-step/session-based flows
bot.on('message', async (ctx, next) => {
  if (ctx.session && ctx.session.customerAction) {
    return customers.handleMessage(ctx);
  }
  if (ctx.session && ctx.session.invoiceAction) {
    return invoice.handleMessage(ctx);
  }
  if (ctx.session && ctx.session.adminAction) {
    return admins.handleMessage(ctx);
  }
  // No need to handle call wizard here, it's handled in setupCallCommand
  await next();
});

bot.start();
