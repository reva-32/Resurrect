# ML Recovery Prediction

## What the model does

Resurrect uses a merchant-specific logistic regression model to estimate the probability that a failed payment can be recovered.

The model learns from the synthetic `TrainingRecord` collection. It is a prototype prediction model, not a production financial-risk model.

## Inputs

- amount
- payment method
- failure reason
- retry count
- time since failure
- customer successful-payment history
- customer previous failures

The target is `recovered` (0/1).

`actionTaken` is deliberately not a training feature because the model is predicting recovery potential before the recovery action is selected. This avoids a simple form of target leakage.

## Training

- 80% of the merchant's synthetic records are used for training.
- 20% are held out for evaluation.
- The model is trained per merchant.
- Training happens explicitly through `POST /api/recovery/train-model`, and the first recovery prediction can train lazily if the model is not cached.

## Metrics

The training endpoint returns accuracy, precision, recall and ROC-AUC on the held-out test set.

These metrics describe performance on the synthetic dataset only. They must not be presented as production performance.

## Policy boundary

ML predicts probability; it does not bypass deterministic policy.

Current prototype thresholds are internal policy settings:

- probability < 0.25 -> stop
- probability 0.25–0.45 + retry recommendation -> review
- otherwise continue with the existing action recommendation and policy checks

These thresholds are not RBI rules and are not presented as financial regulations.

## Gemini's role

Gemini remains an advisory explanation/recommendation layer. The numerical recovery probability comes from the ML model, while deterministic backend policy remains the final safety boundary.

## Model selection benchmark

A separate local Python benchmark compared Logistic Regression and XGBoost on 1,000 synthetic training records stored in the isolated `resurrect_ml` database.

| Metric | Logistic Regression | XGBoost |
|---|---:|---:|
| Accuracy | 0.6650 | 0.6600 |
| Precision | 0.6375 | 0.6522 |
| Recall | 0.5730 | 0.5056 |
| F1 | 0.6036 | 0.5696 |
| ROC-AUC | 0.7648 | 0.7056 |
| Brier score | 0.1965 | 0.2232 |
| Train time | 1.0654s | 1.1138s |
| Predict time | 0.018871s | 0.013007s |

For this synthetic benchmark, Logistic Regression was selected as the initial model because it produced the stronger ROC-AUC, F1 and Brier score while remaining simple and fast.

These benchmark results are not claims about real-world payment recovery performance. The deployed prototype trains a separate merchant-specific Logistic Regression model from that merchant's synthetic `TrainingRecord` data.
