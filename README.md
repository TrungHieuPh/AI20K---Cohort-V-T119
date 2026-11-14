# zero-one-lexgate

Audit gate for legal chatbots. Give it a law and a batch of chatbot answers, and it flags every answer that contradicts the law, citing the exact article and clause as evidence.

> **Status:** repository skeleton. Folders and empty placeholder files are in place on the `develop` branch, and the MVP is being built. Built by Zero One Team for hackathon topic AIP-04. The commands and file formats below are the interface the team is building toward.

## Why

Legal chatbots sound confident even when they are wrong. They give the wrong number of days, quote a repealed law, or invent a right that does not exist. Generic RAG metrics return a score, but they do not say which sentence is wrong or which article it breaks.

lexgate checks each claim in an answer against the law text itself. It blocks the batch if any claim is wrong.

## What the MVP does

**Input**
- The Vietnamese Labor Code, consolidated text No. 18/VBHN-VPQH dated 12/02/2026: Law No. 45/2019/QH14 as amended by Laws No. 71/2025/QH15, 113/2025/QH15 and 124/2025/QH15. Source: vbpl.vn.
- A CSV of questions with the chatbot's answers.

**For each answer**
1. Split the answer into individual claims.
2. Retrieve the most relevant articles of the law.
3. Judge each claim against the retrieved text, and cite the article, clause and point it relies on.

Each claim gets one of three labels:

| Label | Meaning |
|---|---|
| `DUNG` (đúng) | Supported by the cited provision |
| `TRAI_LUAT` (trái luật) | Contradicts the law |
| `KHONG_CAN_CU` (không căn cứ) | The law text gives no basis for it |

Each answer then gets a verdict:
- `SAI` (wrong) if any claim is `TRAI_LUAT`;
- otherwise `KHONG_CAN_CU` if any claim is `KHONG_CAN_CU`;
- otherwise `DUNG`.

The batch then gets a gate decision (`cong`) with three levels:
- `KHONG_DAT` (fail) if any answer is `SAI`;
- otherwise `CAN_XEM_LAI` (needs human review) if any answer is `KHONG_CAN_CU`;
- otherwise `DAT` (pass), meaning every answer is `DUNG`.

**Error types it is built to catch.** The demo set plants 5 wrong answers among 20 questions, one of each type:

| Error type | Example |
|---|---|
| Wrong number | Wrong notice period or overtime limit |
| Outdated law | Quoting an older rule (the 2012 Labor Code, or 2019 text since amended) where the current consolidated text differs |
| Invented right | A benefit that no article grants |
| Wrong article cited | The rule is right, but the article number is not |
| Partly correct | One true claim mixed with one false claim |

## How it works

```
Law text (consolidated 18/VBHN-VPQH, Word/HTML from vbpl.vn)
  └─ ingest: split at each "Điều N." → one chunk per article → embeddings → Qdrant (local)

Q&A CSV
  └─ audit: answer → claims → top-5 articles → LLM judge per claim (+ Ragas faithfulness)
       └─ results.json → Streamlit UI
```

**Stack:** Python, Qdrant (local mode), LiteLLM, Ragas, Streamlit.

## Repository layout

```
zero-one-lexgate/
  core/                  backend
    ingest.py            build_index(law_path)                         Bảo
    retrieve.py          retrieve(query, k=5) -> list[chunk + score]   Bảo
    audit.py             audit_one(cau_hoi, cau_tra_loi) -> dict       Vĩnh
                         run_audit(csv_path) -> results.json
  eval/
    score.py             score(results_path, answer_key_path)          Khoa
  app/
    app.py               Streamlit UI, the MVP frontend                Hiếu
  mock/
    mock_results.json    sample output, so the UI can be built before the backend is ready
  data/law/              law text
  data/test/             dev_set.csv
  .env.example           settings template; copy to .env
  requirements.txt
```

The backend and frontend live in this one repo. In week 2, `api/` (FastAPI wrapping `core/`) and `web/` (Next.js) are added alongside these folders, and nothing above has to move.

## Getting started

Requirements: Python 3.11+ and an API key for an LLM provider supported by LiteLLM.

```bash
git clone https://github.com/TrungHieuPh/zero-one-lexgate.git
cd zero-one-lexgate
git switch develop
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # then add your model name and API key
```

`.env` is git-ignored. Never commit API keys.

### Branches

| Branch | Purpose |
|---|---|
| `main` | Stable. Updated only from `develop` at milestones such as the demo. |
| `develop` | Integration. Everyone branches from here and merges back through a pull request. |
| `feat/<area>` | One per person: `feat/retrieval` (Bảo), `feat/audit` (Vĩnh), `feat/eval` (Khoa), `feat/ui` (Hiếu). |

```bash
git switch develop
git pull
git switch -c feat/ui              # your own branch
# ...work and commit...
git push -u origin feat/ui         # then open a pull request into develop
```

Tell the whole team before changing a shared data format (see [Data formats](#data-formats)).

### Run

```bash
# 1. Build the index from the law text
python -m core.ingest data/law/<law-file>

# 2. Audit a CSV of answers (writes results.json)
python -m core.audit data/test/dev_set.csv

# 3. Score results against an answer key kept outside the repo
python -m eval.score results.json <path/to/answer_key.csv>

# UI
streamlit run app/app.py
```

## Data formats

**Input CSV.** Columns are `id`, `cau_hoi` (question) and `cau_tra_loi` (answer):

```csv
id,cau_hoi,cau_tra_loi
1,"Người lao động có hợp đồng không xác định thời hạn phải báo trước bao nhiêu ngày khi nghỉ việc?","Chỉ cần báo trước 30 ngày."
```

**Answer key.** Columns are `id`, `nhan_that` (true label), `loai_loi` (error type), `dieu_dung` (correct article) and `ghi_chu` (notes). It is used only for scoring and is never committed.

**Law chunk:**

```json
{
  "chunk_id": "dieu-35",
  "chuong": "III",
  "dieu": 35,
  "tieu_de": "Quyền đơn phương chấm dứt hợp đồng lao động của người lao động",
  "noi_dung": "..."
}
```

**`results.json`:**

```json
{
  "tong_ket": {"so_cau": 20, "dung": 15, "sai": 5, "khong_can_cu": 0, "cong": "KHONG_DAT"},
  "cau": [
    {
      "id": 1,
      "ket_luan": "SAI",
      "faithfulness": 0.0,
      "cac_y": [
        {
          "noi_dung": "Chỉ cần báo trước 30 ngày",
          "nhan": "TRAI_LUAT",
          "trich_dan": "Điều 35 khoản 1 điểm a",
          "bang_chung": "Ít nhất 45 ngày nếu làm việc theo hợp đồng lao động không xác định thời hạn",
          "giai_thich": "Câu trả lời ghi 30 ngày, luật quy định ít nhất 45 ngày"
        }
      ],
      "dieu_truy_hoi": ["dieu-35", "dieu-36"],
      "thoi_gian_ms": 4200,
      "chi_phi_usd": 0.002
    }
  ]
}
```

Allowed values:
- `cac_y[].nhan`: `DUNG`, `TRAI_LUAT`, `KHONG_CAN_CU`.
- `cau[].ket_luan`: `DUNG`, `SAI`, `KHONG_CAN_CU`.
- `tong_ket.cong`: `KHONG_DAT` (some answer is `SAI`), `CAN_XEM_LAI` (no `SAI`, but some answer is `KHONG_CAN_CU`), `DAT` (every answer is `DUNG`).

## Evaluation

The team tunes on one set and reports on another, so the reported numbers are not fitted to the test questions.

- **Dev set:** 10 questions, open to the whole team for tuning.
- **Test set:** 20 questions, 5 of them deliberately wrong. Only the evaluation owner holds the test set and its answer key. Both are git-ignored (`data/test/test_set*.csv`, `answer_key*.csv`), so they never reach the repo.
- **Blind runs:** code is frozen first, then the test set is run twice to measure how stable the verdicts are.

**Scoring rule.** A verdict of `SAI` or `KHONG_CAN_CU` both count as flagging an answer:
- A deliberately wrong answer is **caught** if its verdict is `SAI` or `KHONG_CAN_CU`, and **missed** if it is `DUNG`.
- A correct answer is a **false alarm** if its verdict is `SAI` or `KHONG_CAN_CU`.

MVP targets:

| Metric | Target |
|---|---|
| Wrong answers caught | ≥ 4 of 5 |
| False alarms on correct answers | ≤ 1 of 15 |
| Article cited for each caught answer | Correct in every case |
| Same verdict across 2 runs | ≥ 19 of 20 |
| Right article in top-5 retrieval (dev set) | ≥ 9 of 10 |
| Time to audit 20 questions | ≤ 5 minutes |

## Roadmap

- An agent that diagnoses retrieval misses and tunes the pipeline (chunking, `k`, embedding model), scored with Ragas. This is the core of AIP-04.
- Comparison of embedding models, starting with bge-m3.
- Login, a FastAPI backend in `api/` and a Next.js frontend in `web/`.

## Team

| Member | Role |
|---|---|
| Ngô Chí Vĩnh | Tech lead, claim verification (`core/audit.py`) |
| Nguyễn Khắc Bảo | Law data and retrieval (`core/ingest.py`, `core/retrieve.py`), project management |
| Lê Viết Khoa | Test sets, scoring (`eval/score.py`), demo |
| Phan Trung Hiếu | Streamlit UI and deployment (`app/`) |

## Disclaimer

lexgate is a research prototype, not legal advice. The law text comes from the Vietnamese national legal database (vbpl.vn).
