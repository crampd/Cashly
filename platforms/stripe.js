const stripe = require('stripe')(require('../config').STRIPE_SECRET_KEY);

module.exports = async function sendInvoice(invoiceData) {
  // 1. Create customer (if not exists)
  let customer;
  const customers = await stripe.customers.list({ email: invoiceData.email, limit: 1 });
  if (customers.data.length) {
    customer = customers.data[0];
  } else {
    customer = await stripe.customers.create({ name: invoiceData.name, email: invoiceData.email });
  }

  // 2. Create invoice item
  await stripe.invoiceItems.create({
    customer: customer.id,
    amount: Math.round(invoiceData.amount * 100),
    currency: 'usd',
    description: invoiceData.description
  });

  // 3. Create invoice
  const invoice = await stripe.invoices.create({
    customer: customer.id,
    collection_method: 'send_invoice',
    days_until_due: 30,
    metadata: { transaction_id: invoiceData.transaction_id }
  });

  // 4. Finalize and send invoice (triggers Stripe email)
  await stripe.invoices.finalizeInvoice(invoice.id);
  await stripe.invoices.sendInvoice(invoice.id);

  return true;
};

// Add createCustomer for customer onboarding
module.exports.createCustomer = async function(name, email) {
  // Check if customer exists
  const customers = await stripe.customers.list({ email, limit: 1 });
  if (customers.data.length) {
    return customers.data[0].id;
  }
  const customer = await stripe.customers.create({ name, email });
  return customer.id;
};