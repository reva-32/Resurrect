import os
import sys
import time
from pathlib import Path

import pandas as pd
from pymongo import MongoClient

from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression

from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    brier_score_loss
)

try:
    from xgboost import XGBClassifier
except ImportError:
    XGBClassifier = None
    print("XGBoost is not installed.")
    print("Run: pip install xgboost")


def load_env_file():

    env_paths = [
        Path.cwd() / ".env",
        Path.cwd().parent / ".env",
        Path(__file__).resolve().parent / ".env",
        Path(__file__).resolve().parent.parent / ".env"
    ]

    for env_path in env_paths:

        if not env_path.exists():
            continue

        for line in env_path.read_text(encoding="utf-8").splitlines():

            line = line.strip()

            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)

            key = key.strip()
            value = value.strip().strip('"').strip("'")

            os.environ.setdefault(key, value)


load_env_file()


MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI")

if not MONGO_URI:
    print("MONGO_URI is not set.")
    print("Check backend/.env")
    sys.exit(1)


client = MongoClient(MONGO_URI)

# Separate database for ML
db = client["resurrect_ml"]

# Training collection
collection = db["trainingrecords"]


records = list(
    collection.find(
        {"dataSource": "synthetic"},
        {
            "amount": 1,
            "paymentMethod": 1,
            "failureReason": 1,
            "retryCount": 1,
            "timeSinceFailureMinutes": 1,
            "customerHistory": 1,
            "previousFailures": 1,
            "recovered": 1,
            "_id": 0
        }
    )
)


if len(records) < 100:

    print(f"\nOnly {len(records)} training records found.")
    print("Need at least 100 records.")
    print()
    print("Database : resurrect_ml")
    print("Collection: trainingrecords")
    print()
    print("Add the synthetic training records first.")
    sys.exit(1)


df = pd.DataFrame(records)


print()
print("========================================")
print("RESURRECT ML MODEL BENCHMARK")
print("========================================")

print(f"Training records found: {len(df)}")

recovered_count = int(df["recovered"].sum())
not_recovered_count = len(df) - recovered_count

print(f"Recovered: {recovered_count}")
print(f"Not recovered: {not_recovered_count}")


X = df.drop(columns=["recovered"])

y = df["recovered"].astype(int)


categorical = [
    "paymentMethod",
    "failureReason"
]


numerical = [
    "amount",
    "retryCount",
    "timeSinceFailureMinutes",
    "customerHistory",
    "previousFailures"
]


preprocessor = ColumnTransformer(
    transformers=[
        (
            "num",
            StandardScaler(),
            numerical
        ),
        (
            "cat",
            OneHotEncoder(handle_unknown="ignore"),
            categorical
        )
    ]
)


X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42,
    stratify=y
)


def evaluate(name, model):

    start = time.perf_counter()

    model.fit(X_train, y_train)

    train_time = time.perf_counter() - start


    start = time.perf_counter()

    probabilities = model.predict_proba(X_test)[:, 1]

    prediction_time = time.perf_counter() - start


    predictions = (probabilities >= 0.5).astype(int)


    print()
    print(f"========== {name} ==========")

    print(
        f"Accuracy:  {accuracy_score(y_test, predictions):.4f}"
    )

    print(
        f"Precision: {precision_score(y_test, predictions, zero_division=0):.4f}"
    )

    print(
        f"Recall:    {recall_score(y_test, predictions, zero_division=0):.4f}"
    )

    print(
        f"F1:        {f1_score(y_test, predictions, zero_division=0):.4f}"
    )

    print(
        f"ROC-AUC:   {roc_auc_score(y_test, probabilities):.4f}"
    )

    print(
        f"Brier:     {brier_score_loss(y_test, probabilities):.4f}"
    )

    print(
        f"Train:     {train_time:.4f}s"
    )

    print(
        f"Predict:   {prediction_time:.6f}s"
    )


# ----------------------------------------
# LOGISTIC REGRESSION
# ----------------------------------------

logistic = Pipeline(
    steps=[
        (
            "preprocessor",
            preprocessor
        ),
        (
            "model",
            LogisticRegression(
                max_iter=1000
            )
        )
    ]
)


evaluate(
    "LOGISTIC REGRESSION",
    logistic
)


# ----------------------------------------
# XGBOOST
# ----------------------------------------

if XGBClassifier is not None:

    xgboost = Pipeline(
        steps=[
            (
                "preprocessor",
                preprocessor
            ),
            (
                "model",
                XGBClassifier(
                    n_estimators=200,
                    max_depth=4,
                    learning_rate=0.05,
                    subsample=0.8,
                    colsample_bytree=0.8,
                    eval_metric="logloss",
                    random_state=42
                )
            )
        ]
    )


    evaluate(
        "XGBOOST",
        xgboost
    )


print()
print("========================================")
print("BENCHMARK COMPLETE")
print("========================================")


client.close()