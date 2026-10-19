import json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'))
from router.api import app
from router.extraction import Extraction
from router.domain import Intent,Candidate,Outcome,interpretation_schema
for filename,data in [('openapi.json',app.openapi()),('intent.schema.json',Intent.model_json_schema()),('candidate.schema.json',Candidate.model_json_schema()),('outcome.schema.json',Outcome.model_json_schema()),('interpretation.schema.json',Extraction.model_json_schema())]:
 (ROOT/'docs'/filename).write_text(json.dumps(data,indent=2))
