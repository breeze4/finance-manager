from pathlib import Path

from pydantic_settings import BaseSettings

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    database_url: str = f"sqlite:///{PROJECT_ROOT / 'data' / 'finance.db'}"
    input_dir: Path = PROJECT_ROOT / "input"

    model_config = {"env_prefix": "FA_"}


settings = Settings()
