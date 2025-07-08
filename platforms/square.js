const { SquareClient } = require('square');
const config = require('../config');

const client = new SquareClient({
  accessToken: config.SQUARE_ACCESS_TOKEN,
  environment: config.SQUARE_ENVIRONMENT || 'sandbox'
});

module.exports = async function sendInvoice(invoiceData) {
  // 1. Find or create customer
  const customersApi = client.customersApi;
  let customerId;
  const searchRes = await customersApi.searchCustomers({
    query: { filter: { emailAddress: { exact: invoiceData.email } } }
  });
  if (searchRes.result.customers && searchRes.result.customers.length > 0) {
    customerId = searchRes.result.customers[0].id;
  } else {
    const createRes = await customersApi.createCustomer({
      givenName: invoiceData.name,
      emailAddress: invoiceData.email
    });
    customerId = createRes.result.customer.id;
  }

  // 2. Create invoice
  const invoicesApi = client.invoicesApi;
  const invoiceBody = {
    invoice: {
      locationId: config.SQUARE_LOCATION_ID,
      primaryRecipient: { customerId },
      paymentRequests: [
        {
          requestType: 'BALANCE',
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          fixedAmountRequestedMoney: {
            amount: Math.round(invoiceData.amount * 100),
            currency: 'USD'
          }
        }
      ],
      title: invoiceData.description,
      deliveryMethod: 'EMAIL',
      invoiceNumber: invoiceData.transaction_id
    }
  };

  const invoiceRes = await invoicesApi.createInvoice(invoiceBody);
  const invoiceId = invoiceRes.result.invoice.id;

  // 3. Publish the invoice (triggers Square email)
  await invoicesApi.publishInvoice(invoiceId, { version: invoiceRes.result.invoice.version });

  return true;
};

// Add createCustomer for customer onboarding
module.exports.createCustomer = async function(name, email) {
  const customersApi = client.customersApi;
  const searchRes = await customersApi.searchCustomers({
    query: { filter: { emailAddress: { exact: email } } }
  });
  if (searchRes.result.customers && searchRes.result.customers.length > 0) {
    return searchRes.result.customers[0].id;
  }
  const createRes = await customersApi.createCustomer({
    givenName: name,
    emailAddress: email
  });
  return createRes.result.customer.id;
};
