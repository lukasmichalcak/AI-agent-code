import os
from dataclasses import dataclass

@dataclass
class Settings:
    tool_mode: str = os.getenv('TOOL_MODE', 'live')
    ollama_url: str = os.getenv('OLLAMA_URL', 'http://127.0.0.1:11434')
    model: str = os.getenv('OLLAMA_MODEL', 'qwen3.5:4b')
    adapter_url: str = os.getenv('ADAPTER_URL', 'http://127.0.0.1:8787')
    lifi_url: str = 'https://li.quest/v1'
    lifi_key: str = os.getenv('LIFI_API_KEY', '')
    trace_dir: str = os.getenv('TRACE_DIR', 'evaluation/results/traces')
    context: int = int(os.getenv('OLLAMA_CONTEXT', '8192'))
    seed: int = int(os.getenv('OLLAMA_SEED', '42'))
    max_rounds: int = 6
    max_calls: int = 12
    max_quote_age: int = 120
