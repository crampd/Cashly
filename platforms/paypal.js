const paypal = require('@paypal/checkout-server-sdk');
const config = require('../config');

const environment = config.PAYPAL_ENV === 'live'
  ? new paypal.core.LiveEnvironment(config.PAYPAL_CLIENT_ID, config.PAYPAL_CLIENT_SECRET)
  : new paypal.core.SandboxEnvironment(config.PAYPAL_CLIENT_ID, config.PAYPAL_CLIENT_SECRET);
const client = new paypal.core.PayPalHttpClient(environment);

module.exports = async function sendInvoice(invoiceData) {
  // Compose invoice payload
  const invoice = {
    detail: {
      invoice_number: invoiceData.transaction_id,
      note: invoiceData.description,
      currency_code: 'USD',
      terms_and_conditions: 'Thank you for your business.'
    },
    invoicer: { name: { given_name: invoiceData.name } },
    primary_recipients: [
      { billing_info: { email_address: invoiceData.email } }
    ],
    items: [
      {
        name: invoiceData.description,
        quantity: '1',
        unit_amount: { currency_code: 'USD', value: invoiceData.amount.toFixed(2) }
      }
    ]
  };

  // 1. Create invoice
  const request = new paypal.invoices.InvoicesCreateRequest();
  request.requestBody(invoice);
  const createRes = await client.execute(request);
  const invoiceId = createRes.result.id;

  // 2. Send invoice (triggers PayPal email)
  const sendReq = new paypal.invoices.InvoicesSendRequest(invoiceId);
  await client.execute(sendReq);

  return true;
};

// Add createCustomer for customer onboarding (PayPal API doesn't have a separate customer object, so just return email)
module.exports.createCustomer = async function(name, email) {
  // For PayPal, customer is identified by email, so just return the email
  return email;
};