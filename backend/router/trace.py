import json
from pathlib import Path
from uuid import uuid4
from .domain import now

class Trace:
    def __init__(self, directory: str):
        self.id = uuid4().hex
        self.events = []
        self.path = Path(directory) / (self.id + '.jsonl')
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def add(self, event, **data):
        row = {'traceId': self.id, 'timestamp': now(), 'event': event, **data}
        self.events.append(row)
        with self.path.open('a', encoding='utf-8') as file:
            file.write(json.dumps(row, ensure_ascii=False, default=str) + '\n')
