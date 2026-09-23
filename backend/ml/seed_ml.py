import os
import random
import math
from pathlib import Path

from pymongo import MongoClient


def load_env_file():

    env_paths = [
        Path.cwd().parent / ".env",
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

            os.environ.setdefault(
                key.strip(),
                value.strip().strip('"').strip("'")
            )


load_env_file()


MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI")

if not MONGO_URI:
    print("MONGO_URI is not set.")
    exit(1)


client = MongoClient(MONGO_URI)

db = client["resurrect_ml"]
collection = db["trainingrecords"]


random.seed(42)


payment_methods = [
    "card",
    "upi",
    "netbanking",
    "wallet"
]

failure_reasons = [
    "bank_timeout",
    "insufficient_funds",
    "authentication_failed",
    "network_error",
    "limit_exceeded"
]


records = []


for i in range(1000):

    amount = round(random.uniform(100, 50000), 2)

    payment_method = random.choice(payment_methods)

    failure_reason = random.choice(failure_reasons)

    retry_count = random.randint(0, 4)

    time_since_failure = random.randint(5, 1440)

    customer_history = random.randint(0, 20)

    previous_failures = random.randint(0, 5)


    score = 0


    if customer_history >= 8:
        score += 2

    elif customer_history >= 3:
        score += 1


    if previous_failures == 0:
        score += 2

    elif previous_failures >= 3:
        score -= 2


    if retry_count == 0:
        score += 2

    elif retry_count >= 3:
        score -= 2


    if time_since_failure <= 120:
        score += 2

    elif time_since_failure > 720:
        score -= 2


    if amount < 10000:
        score += 1

    elif amount > 30000:
        score -= 1


    if failure_reason in [
        "bank_timeout",
        "network_error"
    ]:
        score += 1


    if failure_reason == "insufficient_funds":
        score -= 1


    probability = 1 / (1 + math.exp(-score * 0.6))

    recovered = random.random() < probability


    record = {
        "amount": amount,
        "paymentMethod": payment_method,
        "failureReason": failure_reason,
        "retryCount": retry_count,
        "timeSinceFailureMinutes": time_since_failure,
        "customerHistory": customer_history,
        "previousFailures": previous_failures,
        "recovered": recovered,
        "dataSource": "synthetic"
    }

    records.append(record)


# Remove previous synthetic ML data so rerunning
# this script does not create duplicates.

collection.delete_many({
    "dataSource": "synthetic"
})


collection.insert_many(records)


recovered_count = sum(
    1 for record in records
    if record["recovered"]
)

not_recovered_count = 1000 - recovered_count


print()
print("===================================")
print("ML DATASET CREATED")
print("===================================")
print("Database   : resurrect_ml")
print("Collection : trainingrecords")
print("Records    : 1000")
print(f"Recovered  : {recovered_count}")
print(f"Not recovered: {not_recovered_count}")
print()
print("Done!")


client.close()