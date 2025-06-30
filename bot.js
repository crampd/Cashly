// Global error handlers for debugging
process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', err => {
  console.error('Unhandled Rejection:', err);
});

const { Bot } = require('grammy');
const config = require('./config');
const { sessionMiddleware } = require('./middlewares/session');
const { requireRole } = require('./middlewares/accessControl');
const fs = require('fs');
const path = require('path');

// Command handlers
const start = require('./commands/start');
const customers = require('./commands/customers');
const invoice = require('./commands/invoice');
const admins = require('./commands/admins');
const help = require('./commands/help');
const faq = require('./commands/faq');
const setupCallCommand = require('./commands/call');
const report = require('./commands/report');

// PDF generator
const { generateInvoicePDF } = require('./services/pdf');
const { getInvoicesSummary, db } = require('./db');

// --- Webhook Routers ---
const express = require('express');
const stripeWebhook = require('./webhook/stripe');
const paypalWebhook = require('./webhook/paypal');
const squareWebhook = require('./webhook/square');

// Start webhook server
const webhookApp = express();
webhookApp.use('/webhook', stripeWebhook);
webhookApp.use('/webhook', paypalWebhook);
webhookApp.use('/webhook', squareWebhook);

const WEBHOOK_PORT = process.env.WEBHOOK_PORT || 3000;
webhookApp.listen(WEBHOOK_PORT, () => console.log(`Webhook server running on port ${WEBHOOK_PORT}`));

// --- Telegram Bot ---
const bot = new Bot(config.BOT_TOKEN);
bot.use(sessionMiddleware());

// Register commands
bot.command('start', start);
bot.command('help', help);
bot.command('faq', faq);
bot.command('customers', requireRole(['admin', 'manager', 'staff']), customers);
bot.command('invoice', requireRole(['admin', 'manager']), invoice);
bot.command('admins', requireRole(['admin']), admins);
bot.command('report', requireRole(['admin', 'manager']), report);

// Register call command and its wizard
setupCallCommand(bot);

// Inline keyboard callback handlers
bot.on('callback_query:data', async (ctx, next) => {
  try {
    await ctx.answerCallbackQuery(); // Always answer, ignore if fails
  } catch (e) {}

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
    // --- Report PDF/CSV download handlers ---
    if (ctx.callbackQuery.data === 'download_report_pdf') {
      try {
        // Generate a summary PDF
        const summary = await getInvoicesSummary();
        const invoice = {
          id: 'Summary',
          customer_email: 'All',
          amount: summary.total,
          status: `Paid: $${summary.paid}, Unpaid: $${summary.unpaid}, Overdue: $${summary.overdue}`,
          description: 'Invoice Summary Report'
        };
        const filePath = path.join(__dirname, 'tmp', `report_${Date.now()}.pdf`);
        await generateInvoicePDF(invoice, filePath);
        await ctx.replyWithDocument(
          { source: fs.createReadStream(filePath), filename: 'invoice_report.pdf' },
          { caption: '📄 Invoice Summary Report (PDF)' }
        );
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error('[report] PDF error:', err);
        await ctx.reply('❌ Failed to generate PDF report.');
      }
      return;
    }
    if (ctx.callbackQuery.data === 'download_report_csv') {
      try {
        // Generate a CSV summary
        db.all('SELECT * FROM invoices', [], async (err, rows) => {
          if (err) {
            await ctx.reply('❌ Failed to generate CSV report.');
            return;
          }
          const csvRows = [
            'ID,Customer Email,Amount,Currency,Description,Status,Created At',
            ...rows.map(r =>
              [
                r.id,
                r.customer_email,
                r.amount,
                r.currency,
                `"${(r.description || '').replace(/"/g, '""')}"`,
                r.status,
                r.created_at
              ].join(',')
            )
          ];
          const csvContent = csvRows.join('\n');
          const filePath = path.join(__dirname, 'tmp', `report_${Date.now()}.csv`);
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, csvContent);
          await ctx.replyWithDocument(
            { source: fs.createReadStream(filePath), filename: 'invoice_report.csv' },
            { caption: '📄 Invoice Report (CSV)' }
          );
          fs.unlinkSync(filePath);
        });
      } catch (err) {
        console.error('[report] CSV error:', err);
        await ctx.reply('❌ Failed to generate CSV report.');
      }
      return;
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

// Start reminders (pass bot instance to avoid circular dependency)
const { setupReminders } = require('./services/reminder');
setupReminders(bot);

// Global error handler for grammY
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`, err.error);
});

bot.start();
console.log('========CashlyPay Bot started========');