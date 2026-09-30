"""
ml/__init__.py – Machine Learning package placeholder.

This package will eventually contain:
    ml_model.py  – Model definitions and loading
    train.py     – Training scripts (run offline, not from FastAPI)
    predict.py   – Prediction interface called from FastAPI routes

Current status: PLACEHOLDER INTERFACES ONLY.
Training requires accumulated historical sensor + weather data.
Do NOT train on fake or insufficient data.

Potential future model types:
    * Random Forest / XGBoost (tabular sensor + weather features)
    * Ridge Regression (baseline for soil moisture prediction)
    * Time-series models (LSTM, Prophet) for trend forecasting

When ready, prediction results must be passed to the Generative AI layer
for human-readable explanation — NOT returned raw to the user without context.
"""
