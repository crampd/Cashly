const { getInvoicesSummary } = require('../db');

module.exports = async function reportCommand(ctx) {
  const summary = await getInvoicesSummary();
  return ctx.reply(
    `Total Invoiced: $${summary.total}\nPaid: $${summary.paid}\nUnpaid: $${summary.unpaid}\nOverdue: $${summary.overdue}`
  );
};
