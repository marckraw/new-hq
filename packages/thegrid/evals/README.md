# Grid Evals

The `evals` directory contains small experiments that exercise The Grid's agents and tools.

## How `run.ts` loads experiments

`run.ts` checks the command line for an experiment name. If a name is supplied it imports `experiments/<name>.eval.ts`. If no name is given it loads every `*.eval.ts` file from the `experiments` folder. It also loads environment variables via `dotenv/config` before running anything.

## Running the evaluations

From `packages/thegrid` you can run:

```bash
# Run a single experiment
npm run eval -- allTools

# Run all experiments
npm run eval
```

The script behind `npm run eval` simply executes `npx tsx evals/run.ts`. You can call `npx tsx evals/run.ts createImage` directly if preferred.

## Environment setup

Ensure a `.env` file exists with the variables defined in `packages/thegrid/src/config.env.ts` (e.g. `OPENAI_API_KEY`, `GEMINI_API_KEY`, `LEONARDOAI_API_KEY`, etc.). These keys are required by the services used in the experiments.

Example `.env` file:

```env
OPENAI_API_KEY=your_openai_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
LEONARDOAI_API_KEY=your_leonardoai_api_key_here
Results are written to `results.json` in this folder.
