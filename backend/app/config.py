from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    app_name: str = "Brain Fresh API"
    upload_dir: Path = Path(__file__).parent.parent / "uploads"
    max_upload_size_mb: int = 500
    tribe_model_id: str = "facebook/tribev2"
    tribe_cache_dir: str = "./model_cache"
    # TRIBE v2 open weights output fsaverage5 cortical vertices (~20k). We subsample for JSON
    # payload size; raise toward 20484 for max detail (larger responses / slower UI).
    tribe_brain_vertex_target: int = 8192
    # auto: cuda if available, else Apple MPS (Metal) on supported Macs, else cpu.
    # Override with TRIBE_DEVICE=cpu|mps|cuda in .env if needed (CUDA is not available on macOS).
    tribe_device: str = "auto"
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-20250514"
    # Kimi / Moonshot (OpenAI-compatible). If set, feedback uses this instead of Anthropic.
    moonshot_api_key: str = ""
    moonshot_base_url: str = "https://api.moonshot.cn/v1"
    moonshot_model: str = "moonshot-v1-8k"
    low_engagement_threshold: float = 0.3  # bottom 30th percentile = low engagement
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
settings.upload_dir.mkdir(parents=True, exist_ok=True)
