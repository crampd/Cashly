const { createCustomer, createInvoice } = require('./stripe');
const { createPayPalInvoice } = require('./paypal');
const { saveCustomer, getCustomerByEmail, saveInvoice } = require('../db');

/**
 * Stripe invoice creation (unchanged)
 */
async function createAndSendInvoice({ telegram_id, name, email, description, amount }) {
  let customer = await getCustomerByEmail(email);
  let stripeCustomerId = (customer && customer.stripe_customer_id) ? customer.stripe_customer_id : null;
  if (!stripeCustomerId) {
    const stripeCustomer = await createCustomer(name, email);
    stripeCustomerId = stripeCustomer.id;
    await saveCustomer({
      telegram_id,
      name,
      email,
      phone: customer ? customer.phone : '',
      address: customer ? customer.address : '',
      stripe_customer_id: stripeCustomerId
    });
    customer = await getCustomerByEmail(email);
  }

  const { invoiceUrl, stripeInvoiceId, status, currency, amount_due } = await createInvoice(
    stripeCustomerId,
    description,
    amount
  );

  await saveInvoice({
    customer_email: email,
    stripe_invoice_id: stripeInvoiceId,
    amount: amount_due / 100,
    currency,
    description,
    status
  });

  return { url: invoiceUrl, status, amount: amount_due / 100 };
}

/**
 * PayPal invoice creation and DB save
 */
async function createAndSendPayPalInvoice({ telegram_id, name, email, description, amount }) {
  console.log('InvoiceManager: Calling createPayPalInvoice...');
  const result = await createPayPalInvoice({
    name,
    email,
    description,
    amount
  });
  console.log('InvoiceManager: PayPal result:', result);

  if (result && !result.error) {
    await saveInvoice({
      customer_email: email,
      paypal_invoice_id: result.invoiceId,
      amount: result.amount,
      currency: 'USD',
      description,
      status: result.status
    });
    return {
      url: result.invoiceUrl,
      status: result.status,
      amount: result.amount
    };
  } else {
    // Always throw an error if result.error is set
    console.error('InvoiceManager: PayPal error:', result && result.message);
    throw new Error(result && result.message ? result.message : 'PayPal invoice creation failed');
  }
}

module.exports = { 
  createAndSendInvoice, 
  createAndSendPayPalInvoice 
};