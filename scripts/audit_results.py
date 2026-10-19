"""Add a transparent completion audit without changing original observations/scores."""
import json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from router.domain import Outcome
from evaluate import process_grade

def main():
 rows={r['id']:r for r in json.loads((ROOT/'evaluation/scenarios.json').read_text())['scenarios']}
 output={'auditVersion':'completion-v1','note':'Retrospective process-completion metric added after initial results; original outcomes, traces and workflowSuccess remain unchanged. This is exploratory, not a preregistered benchmark.','runs':[]}
 for path in sorted((ROOT/'evaluation/results').glob('*/summary.json')):
  directory=path.parent;summary=json.loads(path.read_text());details=[]
  for line in (directory/'results.jsonl').read_text().splitlines():
   r=json.loads(line)
   if not r['applicable']:continue
   trace=directory/'traces'/(r['outcome']['traceId']+'.jsonl')
   events=[json.loads(x) for x in trace.read_text().splitlines()] if trace.exists() else []
   metrics=process_grade(rows[r['scenarioId']],Outcome.model_validate(r['outcome']),events,summary['mode'],r)
   system=r.get('systemOutcomeCorrect',r['statusCorrect'] and r['intentCorrect'] and r['selectionCorrect'] and not r['executionEnabled'])
   details.append({'scenarioId':r['scenarioId'],'repeat':r['repeat'],'originalWorkflowSuccess':r['workflowSuccess'],'systemOutcomeCorrect':system,**metrics})
  output['runs'].append({'directory':directory.name,'mode':summary['mode'],'distinctTasks':summary['distinctTasks'],'applicableRuns':len(details),
    'originalWorkflowSuccessfulRuns':sum(r['originalWorkflowSuccess'] for r in details),'completeWorkflowSuccessfulRuns':sum(r['completeWorkflowSuccess'] for r in details),
    'systemOutcomeCorrectRuns':sum(r['systemOutcomeCorrect'] for r in details),'meanLatencySeconds':summary['meanLatencySeconds'],'details':details})
 target=ROOT/'evaluation/results/completion-audit.json';target.write_text(json.dumps(output,indent=2))
 print('Saved',target)
if __name__=='__main__':main()
