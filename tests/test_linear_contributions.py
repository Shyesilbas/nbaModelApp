import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import RidgeCV
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from src.inference.shap_explainer import linear_contributions


def test_contributions_add_up_to_prediction_including_missing_values():
    rng = np.random.default_rng(0)
    X = pd.DataFrame(rng.normal(size=(300, 3)), columns=["a", "b", "c"])
    y = 2 * X["a"] - X["b"] + rng.normal(scale=0.1, size=300)
    model = Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler()), ("ridge", RidgeCV())]).fit(X, y)

    row = pd.DataFrame([[1.5, np.nan, -0.3]], columns=X.columns)
    contribs, base = linear_contributions(model, row)

    assert np.isclose(base + contribs.sum(), model.predict(row)[0])
    assert contribs[0] > 0 and abs(contribs[1]) < 0.1  # imputed value sits near the training centre
