from app.services.forecast.base import BaseForecaster
from app.services.forecast.simple import SimpleForecaster

_REGISTRY: dict[str, type[BaseForecaster]] = {
    "simple": SimpleForecaster,
}


def get_forecaster(method: str) -> BaseForecaster:
    """Get a forecaster instance by method name."""
    cls = _REGISTRY.get(method)
    if cls is None:
        raise ValueError(f"Unknown forecast method: {method}. Available: {list(_REGISTRY.keys())}")
    return cls()


def available_methods() -> list[str]:
    return list(_REGISTRY.keys())
