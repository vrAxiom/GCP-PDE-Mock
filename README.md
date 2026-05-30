# GCP Professional Data Engineer Mock Quiz 2026

A self-contained single-page mock exam app for the Google Cloud Professional Data Engineer certification.
No build step, no dependencies — serve it over HTTP and open in a browser.

---

## Running the App

The app fetches question JSON files at runtime and **must be served over HTTP** (not opened as a `file://` URL):

```bash
# Python (built-in, any Python 3)
python3 -m http.server 8080

# Node.js
npx serve .
```

Open `http://localhost:8080`.

---

## Question Bank Structure

Questions live in five JSON files — one per exam section:

| File | Section | Exam Weight | Pool Size |
|------|---------|-------------|-----------|
| `questions-s1.json` | Designing Data Processing Systems | 22% | 104 |
| `questions-s2.json` | Ingesting and Processing the Data | 25% | 126 |
| `questions-s3.json` | Storing the Data | 20% | 117 |
| `questions-s4.json` | Preparing and Using Data for Analysis | 15% | 90 |
| `questions-s5.json` | Maintaining and Automating Data Workloads | 18% | 83 |
| **Total** | | | **520** |

- **Section quiz** — picks 20 random questions from the section pool. Options are shuffled every run.
- **Full mock exam** — 50 questions, blueprint-weighted: 11 / 12 / 10 / 8 / 9 per section.
- Passing threshold: **70%**.

---

## Adding New Questions

### Step 1 — Choose the right file

| Topic keywords | File |
|----------------|------|
| Architecture, pipeline design, Dataflow, Pub/Sub, batch vs streaming, Lambda/Kappa | `questions-s1.json` |
| Kafka, Datastream, CDC, real-time ingestion, ETL/ELT, Pub/Sub push/pull | `questions-s2.json` |
| BigQuery, Bigtable, Spanner, Cloud Storage, Firestore, partitioning, data modelling | `questions-s3.json` |
| Looker, Data Studio, analytics queries, ML features, Vertex AI, data quality | `questions-s4.json` |
| CI/CD, Cloud Composer, monitoring, cost optimisation, IAM, automation, scheduling | `questions-s5.json` |

### Step 2 — JSON format

Each question is a JSON object with **exactly five fields**:

```json
{
  "q": "Full question text. HTML is supported (<code>, <br>, <strong>, etc.).",
  "opts": [
    "First option text — no A./B./C./D. prefix",
    "Second option text",
    "Third option text",
    "Fourth option text"
  ],
  "ans": 2,
  "explain": "Why the correct answer is right and the distractors are wrong.",
  "concept": "Short GCP service/concept tag — shown in the study review panel"
}
```

| Field | Type | Rules |
|-------|------|-------|
| `q` | `string` | Non-empty. HTML allowed. |
| `opts` | `string[4]` | **Exactly 4 strings.** No `A.`/`B.`/`C.`/`D.` prefixes. |
| `ans` | `number` | **0-based index** into `opts[]` — `0` = first option, `3` = fourth. |
| `explain` | `string` | Non-empty. Displayed in results review. |
| `concept` | `string` | Non-empty. Short label for study tracking. |

### Step 3 — Append to the JSON array

Open the target file and add your object(s) before the closing `]`:

```json
[
  { ...existing question... },
  { ...existing question... },
  {
    "q": "A company needs sub-second query performance on 50 TB of log data with minimal ops overhead. Which service?",
    "opts": [
      "Cloud SQL with read replicas",
      "BigQuery with on-demand pricing",
      "Cloud Spanner multi-region",
      "Dataproc with Hive metastore"
    ],
    "ans": 1,
    "explain": "BigQuery is serverless and designed for ad-hoc analytics at petabyte scale. Cloud SQL and Spanner are OLTP. Dataproc requires cluster management.",
    "concept": "BigQuery, serverless analytics, on-demand pricing"
  }
]
```

### Step 4 — Validate

```bash
node -e "JSON.parse(require('fs').readFileSync('questions-s1.json','utf-8')); console.log('OK')"
```

Replace `s1` with the file you edited. A syntax error will print the exact line/column.

---

## AI Agent Prompt — Reformat Q&A into Required JSON

Use this prompt with any AI assistant (ChatGPT, Claude, Gemini, Copilot Chat) to batch-convert
existing practice questions into the format required by this app.

---

```
You are a JSON formatter for a GCP Professional Data Engineer mock exam app.

Convert the Q&A content I provide into a JSON array. Each object must contain EXACTLY these five fields:

  "q"       – Full question text (string). Preserve formatting; HTML is allowed.
  "opts"    – Array of exactly 4 answer option strings. Remove any A./B./C./D. letter prefixes.
  "ans"     – Zero-based integer index of the correct option in opts[] (must be 0, 1, 2, or 3).
  "explain" – Clear explanation of why the correct answer is right (string, non-empty).
  "concept" – One-line GCP service/concept tag for study review (string, non-empty).

Hard rules:
1. opts must contain EXACTLY 4 strings — no more, no fewer.
2. ans must be an INTEGER 0–3, never a letter ("A", "B", "C", "D").
3. Do NOT include A./B./C./D. letter prefixes in option text.
4. If a question has more than one correct answer (multi-select), SKIP it.
5. If a question has fewer than 4 options, SKIP it.
6. Output ONLY valid JSON — no markdown fences (```), no trailing commas, no comments.

Target section for these questions (append to the matching file after output):
  Section 1 → questions-s1.json  (Designing Data Processing Systems)
  Section 2 → questions-s2.json  (Ingesting and Processing the Data)
  Section 3 → questions-s3.json  (Storing the Data)
  Section 4 → questions-s4.json  (Preparing and Using Data for Analysis)
  Section 5 → questions-s5.json  (Maintaining and Automating Data Workloads)

Example output:
[
  {
    "q": "Which GCP service is best suited for millisecond point-lookup by a composite row key at petabyte scale?",
    "opts": [
      "BigQuery — columnar OLAP with slot-based querying",
      "Cloud Bigtable — wide-column NoSQL with row-key-based access",
      "Cloud Spanner — globally distributed relational database",
      "Firestore — document store with rich query support"
    ],
    "ans": 1,
    "explain": "Bigtable is optimised for high-throughput low-latency reads and writes. A composite row key enables both point lookups and range scans. BigQuery and Spanner are not designed for millisecond key-value access patterns.",
    "concept": "Bigtable row key design, NoSQL storage selection"
  }
]

Now convert the following Q&A:

[PASTE YOUR QUESTIONS HERE]
```

---

Copy the output JSON array, open the matching `questions-s*.json`, and append the new objects
before the final `]`. Then validate with the `node -e` command above.

---

## Running the Regression Tests

Tests are written with [Playwright](https://playwright.dev/) and cover:

- JSON schema and count validation for all 5 question banks
- Home screen pool sizes
- Section quiz scoring (correct / wrong / skipped counts, percentages)
- Pass / fail threshold (≥ 70%)
- Full 50-question mock exam distribution and scoring
- Results review cards and tab filtering
- Quiz navigation (Prev / Next / dots / back)
- localStorage persistence (best score, history, clear)
- Retake and Go Home actions
- Score percentage formula verification

### Install

```bash
npm install
npx playwright install chromium
```

### Run all tests

```bash
npx playwright test
```

### Run a specific group

```bash
npx playwright test --grep "Data Integrity"
npx playwright test --grep "Section Quiz Scoring"
npx playwright test --grep "Full Mock Exam"
npx playwright test --grep "Persistence"
```

### View HTML report

```bash
npx playwright show-report
```

---

## File Reference

```
index.html              App — HTML + CSS + JS (~50 KB)
questions-s1.json       Section 1 question bank (104 questions)
questions-s2.json       Section 2 question bank (126 questions)
questions-s3.json       Section 3 question bank (117 questions)
questions-s4.json       Section 4 question bank (90 questions)
questions-s5.json       Section 5 question bank (83 questions)
tests/
  quiz.spec.js          Playwright regression test suite
playwright.config.js    Playwright configuration
package.json            Dev dependencies (Playwright)
```
