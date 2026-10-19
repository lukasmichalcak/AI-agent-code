Dataset v0 contains 20 synthetic controlled tasks (12 development, 8 reserved test).
Expected results were authored before running a model. Runtime fixtures contain no oracle fields.
The fixture clock is fixed; live planning uses UTC now. UI demo mode refreshes only synthetic timestamps.
All addresses are public example accounts. No scenario means an executed transfer.

Comparisons: `deterministic` and `provider:lifi|paraspell|wormhole` receive typed form input;
`single-agent` and `two-role` receive the utterance and example account context. That input difference
is reported explicitly. Parsed-intent accuracy is graded separately from downstream status/selection.
The direct-provider baseline is a thin adapter plus the SAME validation; it is not a provider UI usability study.
Provider cases outside a provider's configured scope are N/A, not failures. Null structured input is a
form clarification task, not an NLP baseline success. Do not infer agent superiority from those cases.

Run from repository root after installing backend dependencies:
  python scripts/evaluate.py --mode deterministic --split all --repeats 1
  python scripts/evaluate.py --mode two-role --model qwen3.5:4b --split test --repeats 3
  python scripts/evaluate.py --mode single-agent --model qwen3.5:4b --split test --repeats 3
  python scripts/evaluate.py --mode provider:lifi --split all

Freeze `evaluation/scenarios.json`, prompts and dependency locks before comparisons. Results retain
SHA256 of dataset/prompts, interpreter settings, hardware and model digest when reachable.
Report task counts, per-task success/repeated stability, model token counts, wall time, tool errors,
and unknown prices separately. Model token cost is not blockchain fees. No energy or USD inference
cost is fabricated; measure energy externally before assigning one. Paired comparisons should use
identical splits, repeats and seeds. Seed 42 is fixed by default, not a proof of deterministic GPU output.
Human explanation review and signed transfer success remain separate experiments.

The recorded first runs are exploratory: one reserved case was exposed in an interrupted
development run. Do not label the complete reserved set strictly unseen or preregistered.
Original `workflowSuccess` checks oracle fields and bounded/safe tool use; `completeWorkflowSuccess`
additionally requires an observed valid `finish` when planning is needed. `audit_results.py`
adds that completion metric retrospectively to older runs without overwriting observations.
Field-based clarification grading does not certify the explanation's truth or usefulness.
See `docs/IMPLEMENTATION_REPORT.md` for denominators, prompt iterations and adverse results.
