const { getAllCustomers, getInvoicesByEmail, getInvoiceById } = require('../db');
const { createAndSendInvoice, createAndSendPayPalInvoice } = require('../platforms/invoiceManager');
const { createSquareInvoice } = require('../platforms/square');
const { getPayPalInvoice } = require('../platforms/paypal');
const { getStripeInvoice } = require('../platforms/stripe');
const { getSquareInvoice } = require('../platforms/square');
const { generateInvoicePDF } = require('../platforms/pdf');
const { InlineKeyboard } = require('grammy');
const path = require('path');

module.exports = async function invoiceCommand(ctx) {
  const keyboard = new InlineKeyboard()
    .text('Stripe', 'invoices:service:stripe')
    .text('PayPal', 'invoices:service:paypal')
    .text('Square', 'invoices:service:square').row()
    .text('List invoices', 'invoices:list')
    .text('View invoice', 'invoices:view').row()
    .text('Check Invoice Status', 'invoices:status')
    .text('Download PDF', 'invoices:pdf');
  return ctx.reply('Choose Service or Action:', { reply_markup: keyboard });
};

module.exports.handleCallbackQuery = async function (ctx) {
  await ctx.answerCallbackQuery();
  const data = ctx.callbackQuery.data;

  if (data.startsWith('invoices:service:')) {
    const service = data.split(':')[2];
    ctx.session.invoiceService = service;
    ctx.session.invoiceAction = null;
    ctx.session.createStep = null;
    ctx.session.createData = {};
    const customers = await getAllCustomers();
    if (!customers.length) {
      ctx.session.invoiceService = null;
      return ctx.reply('No customers found. Please add a customer first.');
    }
    const keyboard = new InlineKeyboard();
    customers.slice(0, 10).forEach(c => {
      keyboard.text(`${c.name} (${c.email})`, `invoices:select:${c.email}`).row();
    });
    ctx.session.invoiceAction = 'create';
    ctx.session.createStep = 1;
    return ctx.reply(
      `Service: ${service.charAt(0).toUpperCase() + service.slice(1)}\nSelect a customer to invoice:`,
      { reply_markup: keyboard }
    );
  }

  if (data === 'invoices:list') {
    ctx.session.invoiceAction = 'list';
    ctx.session.invoiceService = null;
    return ctx.reply('Enter customer email to list invoices:');
  }
  if (data === 'invoices:view') {
    ctx.session.invoiceAction = 'view';
    ctx.session.invoiceService = null;
    return ctx.reply('Enter invoice ID to view:');
  }
  if (data === 'invoices:status') {
    ctx.session.invoiceAction = 'status';
    return ctx.reply('Enter invoice ID to check status:');
  }
  if (data === 'invoices:pdf') {
    ctx.session.invoiceAction = 'pdf';
    return ctx.reply('Enter invoice ID to download PDF:');
  }
  if (data.startsWith('invoices:select:')) {
    const email = data.split(':')[2];
    ctx.session.createData = ctx.session.createData || {};
    ctx.session.createData.email = email;
    ctx.session.createStep = 2;
    ctx.session.invoiceAction = 'create';
    return ctx.reply('Enter invoice description:');
  }
};

module.exports.handleMessage = async function (ctx) {
  const action = ctx.session.invoiceAction;
  const service = ctx.session.invoiceService;
  if (!action && !service) return;

  if (action === 'list') {
    const email = ctx.message.text.trim();
    try {
      const invoices = await getInvoicesByEmail(email);
      ctx.session.invoiceAction = null;
      if (!invoices.length) return ctx.reply('No invoices found for this customer.');
      return ctx.reply(
        invoices.map(inv =>
          `🧾 ID: ${inv.id}\n💵 Amount: $${inv.amount}\n📄 Status: ${inv.status}\n📝 Desc: ${inv.description || ''}`
        ).join('\n\n')
      );
    } catch (err) {
      ctx.session.invoiceAction = null;
      return ctx.reply('❌ Failed to list invoices: ' + err.message);
    }
  }

  if (action === 'create' && service) {
    const step = ctx.session.createStep;
    const text = ctx.message.text.trim();
    if (step === 2) {
      ctx.session.createData.description = text;
      ctx.session.createStep = 3;
      return ctx.reply('Enter invoice amount:');
    }
    if (step === 3) {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) return ctx.reply('Invalid amount. Please enter a positive number:');
      ctx.session.createData.amount = amount;
      try {
        const customers = await getAllCustomers();
        const customer = customers.find(c => c.email === ctx.session.createData.email);
        let result;
        if (service === 'stripe') {
          result = await createAndSendInvoice({
            telegram_id: String(ctx.from.id),
            name: customer ? customer.name : '',
            email: ctx.session.createData.email,
            description: ctx.session.createData.description,
            amount: ctx.session.createData.amount
          });
        } else if (service === 'paypal') {
          result = await createAndSendPayPalInvoice({
            telegram_id: String(ctx.from.id),
            name: customer ? customer.name : '',
            email: ctx.session.createData.email,
            description: ctx.session.createData.description,
            amount: ctx.session.createData.amount
          });
        } else if (service === 'square') {
          result = await createSquareInvoice({
            name: customer ? customer.name : '',
            email: ctx.session.createData.email,
            description: ctx.session.createData.description,
            amount: ctx.session.createData.amount
          });
        } else {
          throw new Error('Unknown service');
        }
        ctx.session.invoiceAction = null;
        ctx.session.createStep = null;
        ctx.session.createData = null;
        ctx.session.invoiceService = null;
        return ctx.reply(
          `✅ Invoice created via ${service.charAt(0).toUpperCase() + service.slice(1)} and sent to ${customer.email}.\n` +
          `💵 Amount: $${result.amount}\n` +
          `📄 Status: ${result.status}\n` +
          `🔗 [View Invoice](${result.url || result.invoiceUrl})`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        ctx.session.invoiceAction = null;
        ctx.session.createStep = null;
        ctx.session.createData = null;
        ctx.session.invoiceService = null;
        return ctx.reply('❌ Failed to create invoice: ' + (err.message || 'Unknown error'));
      }
    }
  }

  if (action === 'view') {
    const id = ctx.message.text.trim();
    try {
      const inv = await getInvoiceById(id);
      ctx.session.invoiceAction = null;
      if (!inv) return ctx.reply('Invoice not found.');
      let links = [];
      if (inv.stripe_invoice_id) {
        links.push(`🔗 Stripe: https://invoice.stripe.com/i/${inv.stripe_invoice_id}`);
      }
      if (inv.paypal_invoice_id) {
        links.push(`🔗 PayPal: https://www.paypal.com/invoice/payerView/details/${inv.paypal_invoice_id}`);
      }
      return ctx.reply(
        `🧾 ID: ${inv.id}\n💵 Amount: $${inv.amount}\n📄 Status: ${inv.status}\n📝 Desc: ${inv.description || ''}\n${links.join('\n')}`
      );
    } catch (err) {
      ctx.session.invoiceAction = null;
      return ctx.reply('❌ Failed to view invoice: ' + err.message);
    }
  }

  // Invoice Status Tracking
  if (action === 'status') {
    const id = ctx.message.text.trim();
    try {
      const inv = await getInvoiceById(id);
      ctx.session.invoiceAction = null;
      if (!inv) return ctx.reply('Invoice not found.');
      let statusMsg = '';
      if (inv.stripe_invoice_id) {
        const stripeInv = await getStripeInvoice(inv.stripe_invoice_id);
        statusMsg = `Stripe Invoice Status: ${stripeInv.status}`;
      } else if (inv.paypal_invoice_id) {
        const paypalInv = await getPayPalInvoice(inv.paypal_invoice_id);
        statusMsg = `PayPal Invoice Status: ${paypalInv.status}`;
      } else if (inv.square_invoice_id) {
        const squareInv = await getSquareInvoice(inv.square_invoice_id);
        statusMsg = `Square Invoice Status: ${squareInv.status}`;
      } else {
        statusMsg = 'No provider invoice ID found.';
      }
      return ctx.reply(statusMsg);
    } catch (err) {
      ctx.session.invoiceAction = null;
      return ctx.reply('❌ Failed to get invoice status: ' + err.message);
    }
  }

  // PDF Invoice Generation
  if (action === 'pdf') {
    const id = ctx.message.text.trim();
    try {
      const inv = await getInvoiceById(id);
      ctx.session.invoiceAction = null;
      if (!inv) return ctx.reply('Invoice not found.');
      const filePath = path.join('/tmp', `invoice-${inv.id}.pdf`);
      await generateInvoicePDF(inv, filePath);
      await ctx.replyWithDocument({ source: filePath, filename: `invoice-${inv.id}.pdf` });
    } catch (err) {
      ctx.session.invoiceAction = null;
      return ctx.reply('❌ Failed to generate PDF: ' + err.message);
    }
  }
};