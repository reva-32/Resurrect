# Resurrect ML experiment

This folder contains the local Python benchmark used to compare Logistic Regression and XGBoost on synthetic recovery data.

- `seed_ml.py` creates 1,000 synthetic records in the isolated `resurrect_ml.trainingrecords` collection.
- `train.py` compares Logistic Regression and XGBoost using the same held-out test split.
- The selected initial model for the application is Logistic Regression.

The Python experiment database is separate from the deployed application's merchant data. The backend application itself uses `backend/services/recoveryMLService.js`, which trains a merchant-specific Logistic Regression model from that merchant's synthetic `TrainingRecord` records.

Do not commit `backend/.env`, `frontend/.env`, the Python virtual environment, or generated Python cache files.
