import express from "express";
import BusinessCustomer from "../models/BusinessCustomer.js";
import Invoice from "../models/Invoice.js";
import ReceivableAuditLog from "../models/ReceivableAuditLog.js";

const router = express.Router();

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function deriveStatus(invoice, now = new Date()) {
  if (invoice.amountPaid >= invoice.amount) return "paid";
  if (invoice.amountPaid > 0) return "partially_paid";

  const due = new Date(invoice.dueDate);
  const daysUntilDue = Math.ceil((due - now) / 86400000);

  if (daysUntilDue < 0) return "overdue";
  if (daysUntilDue <= 7) return "due_soon";
  return "due";
}

function daysOverdue(invoice, now = new Date()) {
  if (invoice.amountPaid >= invoice.amount) return 0;
  return Math.max(0, Math.floor((now - new Date(invoice.dueDate)) / 86400000));
}

function recoveryRecommendation(invoice, customer, now = new Date()) {
  const overdue = daysOverdue(invoice, now);
  const outstanding = Math.max(0, invoice.amount - invoice.amountPaid);

  if (overdue === 0) return { action: "reminder", reason: "Invoice is not overdue yet; use a normal reminder." };
  if (overdue <= 7) return { action: "reminder", reason: `${overdue} day${overdue === 1 ? "" : "s"} overdue; start with a normal follow-up.` };
  if (overdue <= 30) return { action: "priority_followup", reason: `${overdue} days overdue; prioritize the follow-up because ₹${(outstanding / 100).toLocaleString("en-IN")} remains outstanding.` };
  return { action: "review", reason: `${overdue} days overdue; move this receivable to merchant review before further automated contact.` };
}

async function refreshStatuses(merchantId) {
  const invoices = await Invoice.find({ merchant: merchantId });
  const now = new Date();
  for (const invoice of invoices) {
    const next = deriveStatus(invoice, now);
    if (invoice.status !== next) {
      const previous = invoice.status;
      invoice.status = next;
      await invoice.save();
      await ReceivableAuditLog.create({
        merchant: merchantId,
        invoice: invoice._id,
        event: "status_changed",
        detail: `Invoice status changed from ${previous} to ${next}.`,
        metadata: { previous, next },
      });
    }
  }
}

router.get("/summary", async (req, res) => {
  try {
    await refreshStatuses(req.user._id);
    const invoices = await Invoice.find({ merchant: req.user._id }).populate("businessCustomer", "businessName contactName email phone");
    const outstanding = invoices.reduce((sum, i) => sum + Math.max(0, i.amount - i.amountPaid), 0);
    const dueSoon = invoices.filter((i) => i.status === "due_soon").reduce((sum, i) => sum + Math.max(0, i.amount - i.amountPaid), 0);
    const overdue = invoices.filter((i) => i.status === "overdue").reduce((sum, i) => sum + Math.max(0, i.amount - i.amountPaid), 0);
    const paid = invoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.amountPaid, 0);

    res.json({
      counts: {
        total: invoices.length,
        dueSoon: invoices.filter((i) => i.status === "due_soon").length,
        overdue: invoices.filter((i) => i.status === "overdue").length,
        partiallyPaid: invoices.filter((i) => i.status === "partially_paid").length,
        paid: invoices.filter((i) => i.status === "paid").length,
      },
      amounts: { outstanding, dueSoon, overdue, paid },
    });
  } catch (err) {
    console.error("[receivables] summary error:", err.message);
    res.status(500).json({ error: "Failed to load receivables summary" });
  }
});

router.get("/invoices", async (req, res) => {
  try {
    await refreshStatuses(req.user._id);
    const query = { merchant: req.user._id };
    if (req.query.status) query.status = req.query.status;
    const invoices = await Invoice.find(query)
      .populate("businessCustomer", "businessName contactName email phone creditLimit")
      .sort({ dueDate: 1, createdAt: -1 });

    const now = new Date();
    res.json(invoices.map((invoice) => {
      const obj = invoice.toObject();
      const outstanding = Math.max(0, invoice.amount - invoice.amountPaid);
      const overdueDays = daysOverdue(invoice, now);
      const riskScore = Math.min(100, Math.round(
        Math.min(60, overdueDays * 3) +
        Math.min(25, outstanding / Math.max(1, invoice.amount) * 25) +
        (overdueDays > 30 ? 15 : overdueDays > 14 ? 8 : 0)
      ));
      return { ...obj, outstanding, overdueDays, riskScore, recommendation: recoveryRecommendation(invoice, invoice.businessCustomer, now) };
    }));
  } catch (err) {
    console.error("[receivables] invoices error:", err.message);
    res.status(500).json({ error: "Failed to load invoices" });
  }
});

router.post("/customers", async (req, res) => {
  try {
    const { businessName, contactName, email, phone, creditLimit = 0 } = req.body || {};
    if (!businessName || !contactName) return res.status(400).json({ error: "Business name and contact name are required" });
    const customer = await BusinessCustomer.create({
      merchant: req.user._id, businessName, contactName, email, phone, creditLimit
    });
    res.status(201).json(customer);
  } catch (err) {
    console.error("[receivables] customer create error:", err.message);
    res.status(500).json({ error: "Failed to create business customer" });
  }
});

router.post("/invoices", async (req, res) => {
  try {
    const { businessCustomer, invoiceNumber, amount, issueDate, dueDate, amountPaid = 0 } = req.body || {};
    if (!businessCustomer || !invoiceNumber || !amount || !issueDate || !dueDate) {
      return res.status(400).json({ error: "Customer, invoice number, amount, issue date and due date are required" });
    }
    const invoiceAmount = Number(amount);
    const initialPaid = Number(amountPaid);
    if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0 || !Number.isFinite(initialPaid) || initialPaid < 0 || initialPaid > invoiceAmount) {
      return res.status(400).json({ error: "Amount paid must be between ₹0 and the invoice amount." });
    }

    const customer = await BusinessCustomer.findOne({ _id: businessCustomer, merchant: req.user._id });
    if (!customer) return res.status(404).json({ error: "Business customer not found" });

    const invoice = await Invoice.create({
      merchant: req.user._id,
      businessCustomer,
      invoiceNumber,
      amount: invoiceAmount,
      amountPaid: initialPaid,
      issueDate,
      dueDate,
      status: deriveStatus({ amount: invoiceAmount, amountPaid: initialPaid, dueDate }, new Date()),
      dataSource: "merchant",
    });

    customer.totalBilled += invoiceAmount;
    customer.totalPaid += initialPaid;
    await customer.save();

    await ReceivableAuditLog.create({
      merchant: req.user._id,
      invoice: invoice._id,
      event: "invoice_created",
      detail: `Invoice ${invoice.invoiceNumber} created for ${customer.businessName}.`,
      metadata: { amount: invoice.amount, dueDate: invoice.dueDate },
    });

    res.status(201).json(await invoice.populate("businessCustomer", "businessName contactName email phone"));
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "Invoice number already exists for this merchant" });
    console.error("[receivables] invoice create error:", err.message);
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

router.post("/invoices/:id/recover", async (req, res) => {
  try {
    await refreshStatuses(req.user._id);
    const invoice = await Invoice.findOne({ _id: req.params.id, merchant: req.user._id }).populate("businessCustomer");
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (invoice.status === "paid") return res.status(400).json({ error: "Paid invoices do not need recovery" });

    const recommendation = recoveryRecommendation(invoice, invoice.businessCustomer);
    invoice.lastRecoveryAction = recommendation.action;
    invoice.lastRecoveryAt = new Date();
    await invoice.save();

    await ReceivableAuditLog.create({
      merchant: req.user._id,
      invoice: invoice._id,
      event: "recovery_actioned",
      detail: `Receivables recovery action recorded: ${recommendation.action}.`,
      metadata: { action: recommendation.action, reason: recommendation.reason },
    });

    res.json({ invoice, recommendation, message: "Recovery action recorded. This demo does not send a real B2B message." });
  } catch (err) {
    console.error("[receivables] recovery error:", err.message);
    res.status(500).json({ error: "Failed to record recovery action" });
  }
});

router.post("/invoices/:id/payment", async (req, res) => {
  try {
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Payment amount must be positive" });

    const invoice = await Invoice.findOne({ _id: req.params.id, merchant: req.user._id });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    const remaining = Math.max(0, invoice.amount - invoice.amountPaid);
    if (amount > remaining) return res.status(400).json({ error: `Payment exceeds the remaining balance of ₹${(remaining / 100).toLocaleString("en-IN")}.` });
    const applied = amount;
    invoice.amountPaid += applied;
    invoice.status = deriveStatus(invoice, new Date());
    await invoice.save();

    await BusinessCustomer.updateOne(
      { _id: invoice.businessCustomer, merchant: req.user._id },
      { $inc: { totalPaid: applied } }
    );

    await ReceivableAuditLog.create({
      merchant: req.user._id,
      invoice: invoice._id,
      event: "payment_recorded",
      detail: `Recorded ₹${(applied / 100).toLocaleString("en-IN")} against invoice ${invoice.invoiceNumber}.`,
      metadata: { applied, requested: amount },
    });

    res.json(invoice);
  } catch (err) {
    console.error("[receivables] payment error:", err.message);
    res.status(500).json({ error: "Failed to record payment" });
  }
});

router.post("/seed", async (req, res) => {
  try {
    const existing = await Invoice.countDocuments({ merchant: req.user._id });
    if (existing > 0 && req.body?.force !== true) {
      return res.json({ created: false, invoiceCount: existing, message: "Receivables sample data already exists." });
    }

    if (req.body?.force === true) {
      await Invoice.deleteMany({ merchant: req.user._id, dataSource: "synthetic" });
      await BusinessCustomer.deleteMany({ merchant: req.user._id, businessName: { $regex: /^Demo / } });
    }

    const customers = await BusinessCustomer.insertMany([
      { merchant: req.user._id, businessName: "Demo Nova Distributors", contactName: "Aarav Mehta", email: "aarav@novadistributors.example", phone: "+91XXXXXXXX01", creditLimit: 20000000 },
      { merchant: req.user._id, businessName: "Demo Bright Retailers", contactName: "Isha Shah", email: "isha@brightretailers.example", phone: "+91XXXXXXXX02", creditLimit: 12000000 },
      { merchant: req.user._id, businessName: "Demo Urban Supplies", contactName: "Kabir Rao", email: "kabir@urbansupplies.example", phone: "+91XXXXXXXX03", creditLimit: 15000000 },
    ]);

    const today = startOfToday();
    const date = (offset) => new Date(today.getTime() + offset * 86400000);
    const rows = [
      [customers[0], "INV-3001", 7500000, -18, 0],
      [customers[0], "INV-3002", 4200000, -5, 0],
      [customers[1], "INV-3003", 2800000, 3, 0],
      [customers[1], "INV-3004", 9500000, -42, 2500000],
      [customers[2], "INV-3005", 3600000, 14, 0],
      [customers[2], "INV-3006", 1800000, -9, 0],
    ];

    const invoices = [];
    for (const [customer, invoiceNumber, amount, dueOffset, paid] of rows) {
      invoices.push({
        merchant: req.user._id,
        businessCustomer: customer._id,
        invoiceNumber,
        amount,
        amountPaid: paid,
        issueDate: date(dueOffset - 30),
        dueDate: date(dueOffset),
        status: deriveStatus({ amount, amountPaid: paid, dueDate: date(dueOffset) }, new Date()),
        dataSource: "synthetic",
      });
    }
    await Invoice.insertMany(invoices);

    for (const invoice of invoices) {
      await ReceivableAuditLog.create({
        merchant: req.user._id,
        invoice: invoice._id,
        event: "invoice_created",
        detail: `Synthetic invoice ${invoice.invoiceNumber} created for receivables demo.`,
        metadata: { dataSource: "synthetic" },
      });
    }

    res.json({ created: true, invoiceCount: invoices.length });
  } catch (err) {
    console.error("[receivables] seed error:", err.message);
    res.status(500).json({ error: "Failed to seed receivables data" });
  }
});

export default router;
