import TrainingRecord from "../models/TrainingRecord.js";

const FAILURE_REASONS = [
  "bank_timeout",
  "network_error",
  "checkout_abandoned",
  "insufficient_funds",
  "card_declined",
  "otp_failed",
  "unknown",
];

const PAYMENT_METHODS = ["card", "upi", "netbanking", "wallet"];
const FEATURE_NAMES = [
  "amount",
  "retryCount",
  "timeSinceFailureMinutes",
  "customerHistory",
  "previousFailures",
  ...PAYMENT_METHODS.map((x) => `method_${x}`),
  ...FAILURE_REASONS.map((x) => `reason_${x}`),
];

const MODEL_CACHE = new Map();

function vectorize(record) {
  const values = [
    Number(record.amount) / 1000000,
    Number(record.retryCount),
    Number(record.timeSinceFailureMinutes) / 1000,
    Number(record.customerHistory) / 10,
    Number(record.previousFailures) / 5,
  ];

  for (const method of PAYMENT_METHODS) values.push(record.paymentMethod === method ? 1 : 0);
  for (const reason of FAILURE_REASONS) values.push(record.failureReason === reason ? 1 : 0);

  return values;
}

function sigmoid(value) {
  const clipped = Math.max(-35, Math.min(35, value));
  return 1 / (1 + Math.exp(-clipped));
}

function dot(a, b) {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += a[i] * b[i];
  return total;
}

function shuffleDeterministic(items) {
  const copy = [...items];
  let seed = 20260923;
  for (let i = copy.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function aucScore(labels, probabilities) {
  const pairs = labels.map((label, i) => ({ label, probability: probabilities[i] }));
  pairs.sort((a, b) => b.probability - a.probability);
  const positives = labels.filter(Boolean).length;
  const negatives = labels.length - positives;
  if (!positives || !negatives) return null;

  let tp = 0;
  let fp = 0;
  let previousFpr = 0;
  let previousTpr = 0;
  let auc = 0;

  for (const pair of pairs) {
    if (pair.label) tp += 1;
    else fp += 1;
    const tpr = tp / positives;
    const fpr = fp / negatives;
    auc += (fpr - previousFpr) * (tpr + previousTpr) / 2;
    previousFpr = fpr;
    previousTpr = tpr;
  }

  return auc;
}

function trainLogisticRegression(rows) {
  const X = rows.map(vectorize);
  const y = rows.map((row) => (row.recovered ? 1 : 0));
  const weights = new Array(FEATURE_NAMES.length).fill(0);
  let bias = 0;
  const learningRate = 0.08;
  const epochs = 900;
  const regularization = 0.002;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradients = new Array(weights.length).fill(0);
    let biasGradient = 0;

    for (let i = 0; i < X.length; i++) {
      const probability = sigmoid(dot(weights, X[i]) + bias);
      const error = probability - y[i];
      for (let j = 0; j < weights.length; j++) gradients[j] += error * X[i][j];
      biasGradient += error;
    }

    for (let j = 0; j < weights.length; j++) {
      gradients[j] = gradients[j] / X.length + regularization * weights[j];
      weights[j] -= learningRate * gradients[j];
    }
    bias -= learningRate * (biasGradient / X.length);
  }

  return { weights, bias, featureNames: FEATURE_NAMES, modelType: "logistic-regression" };
}

function predictWithModel(model, record) {
  const probability = sigmoid(dot(model.weights, vectorize(record)) + model.bias);
  return Math.max(0.01, Math.min(0.99, probability));
}

function evaluate(model, rows) {
  const labels = rows.map((row) => Boolean(row.recovered));
  const probabilities = rows.map((row) => predictWithModel(model, row));
  const predictions = probabilities.map((p) => p >= 0.5);
  let correct = 0;
  let tp = 0;
  let fp = 0;
  let fn = 0;

  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === predictions[i]) correct += 1;
    if (predictions[i] && labels[i]) tp += 1;
    if (predictions[i] && !labels[i]) fp += 1;
    if (!predictions[i] && labels[i]) fn += 1;
  }

  return {
    testRecords: rows.length,
    accuracy: Number((correct / rows.length).toFixed(4)),
    precision: Number((tp / Math.max(1, tp + fp)).toFixed(4)),
    recall: Number((tp / Math.max(1, tp + fn)).toFixed(4)),
    auc: aucScore(labels, probabilities),
  };
}

export async function trainRecoveryModel(merchantId) {
  const rows = await TrainingRecord.find({ merchant: merchantId, dataSource: "synthetic" })
    .select("amount paymentMethod failureReason retryCount timeSinceFailureMinutes customerHistory previousFailures recovered -_id")
    .lean();

  if (rows.length < 50) {
    throw new Error(`At least 50 training records are required. Found ${rows.length}.`);
  }

  const shuffled = shuffleDeterministic(rows);
  const splitIndex = Math.floor(shuffled.length * 0.8);
  const trainRows = shuffled.slice(0, splitIndex);
  const testRows = shuffled.slice(splitIndex);
  const model = trainLogisticRegression(trainRows);
  const metrics = evaluate(model, testRows);

  const cached = {
    model,
    metrics: {
      ...metrics,
      trainingRecords: trainRows.length,
      totalRecords: rows.length,
      trainedAt: new Date().toISOString(),
    },
  };

  MODEL_CACHE.set(String(merchantId), cached);
  return cached.metrics;
}

export async function predictRecovery(payment, customer, merchantId) {
  const key = String(merchantId);
  let cached = MODEL_CACHE.get(key);
  if (!cached) {
    await trainRecoveryModel(merchantId);
    cached = MODEL_CACHE.get(key);
  }

  const record = {
    amount: payment.amount,
    paymentMethod: payment.paymentMethod || "upi",
    failureReason: payment.failureReason,
    retryCount: payment.retryCount,
    timeSinceFailureMinutes: Math.max(0, Math.round((Date.now() - new Date(payment.failedAt || payment.createdAt).getTime()) / 60000)),
    customerHistory: customer?.successfulPaymentsCount || 0,
    previousFailures: customer?.previousFailures || 0,
  };

  return {
    probability: predictWithModel(cached.model, record),
    model: cached.model.modelType,
    metrics: cached.metrics,
  };
}

export function clearRecoveryModelCache(merchantId) {
  MODEL_CACHE.delete(String(merchantId));
}
