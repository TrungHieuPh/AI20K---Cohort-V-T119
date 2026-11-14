# zero-one-lexgate

Audit gate for legal chatbots. Give it a law and a batch of chatbot answers, and it flags every answer that contradicts the law, citing the exact article and clause as evidence.

> **Status:** repository skeleton. Folders and empty placeholder files are in place on the `develop` branch, and the MVP is being built. Built by Zero One Team for hackathon topic AIP-04. The commands and file formats below are the interface the team is building toward.

## Why

Legal chatbots sound confident even when they are wrong. They give the wrong number of days, quote a repealed law, or invent a right that does not exist. Generic RAG metrics return a score, but they do not say which sentence is wrong or which article it breaks.

lexgate checks each claim in an answer against the law text itself. It blocks the batch if any claim is wrong.

## What the MVP does

**Input**
- The Vietnamese Labor Code 2019 (Law No. 45/2019/QH14, 220 articles), in its consolidated text 18/VBHN-VPQH of 12/02/2026. That text includes the 2025 amendments to Articles 59, 61, 139 and 154. Data cut-off: 14/11/2026. The amending laws are No. 71/2025/QH15, 113/2025/QH15 and 124/2025/QH15.
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
Law text (18/VBHN-VPQH, .doc → .txt)
  └─ scripts/split_law.py: split at each "Điều N." → data/law/dieu.jsonl (one line per article)
       └─ ingest: chapter/section header + article → bge-m3 embeddings (1024-d, cosine) → Qdrant (local)

Q&A CSV
  └─ audit: answer → claims → top-5 articles (+ articles the answer cites) → LLM judge per claim → faithfulness from the claim labels
       └─ results.json → Next.js UI (web/)
```

**Stack:** Python, Qdrant (local mode), LiteLLM, Ragas, Next.js.

## Repository layout

```
zero-one-lexgate/
  core/                  backend
    vectordb.py          settings, embedder, Qdrant client (shared)    Bào
    ingest.py            build_index(law_path)                         Bào
    retrieve.py          retrieve(query, k=5) -> list[chunk + score]   Bào
                         get_article("Điều 35") -> chunk | None
    audit.py             audit_one(cau_hoi, cau_tra_loi) -> dict       Vĩnh
                         run_audit(csv_path) -> results.json
  eval/
    score.py             score(results_path, answer_key_path)          Khoa
  web/                   Next.js UI, the MVP frontend (reads results.json) Hiếu
  mock/
    mock_results.json    sample output, so the UI can be built before the backend is ready
  scripts/
    split_law.py         law .txt -> dieu.jsonl
    check_retrieval.py   Hit@k / MRR of retrieve() on a question -> article CSV
  docs/
    law-data-and-retrieval.md   law data, vector index and retrieve() API: decisions, results, open items
  data/law/              18_VBHN-VPQH.doc (source), bo-luat-lao-dong-vbhn18.txt, dieu.jsonl,
                         dieu.BAAI__bge-m3.npz (cached article vectors)
  data/test/             dev_set.csv, dev_set_dap_an.csv, retrieval_smoke.csv
  .env.example           settings template; copy to .env
  requirements.txt
```

The backend and frontend live in this one repo. In week 2, `api/` (FastAPI wrapping `core/`) is added alongside these folders for login, upload and running audits from the UI, and nothing above has to move. Until then the UI only reads `results.json`; it never loads the embedding model.

## Getting started

Requirements: Python 3.11+ and an API key for an LLM provider supported by LiteLLM.

```bash
git clone https://github.com/TrungHieuPh/AI20K_CohortV_T119.git zero-one-lexgate
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
| `feat/<area>` | One per person: `feat/retrieval` (Bào), `feat/audit` (Vĩnh), `feat/eval` (Khoa), `feat/ui` (Hiếu). |

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
#    Vectors are committed in data/law/dieu.BAAI__bge-m3.npz, so this takes about a second
#    and does not load the model. Only new or edited articles are re-embedded.
python -m core.ingest data/law/dieu.jsonl

#    Querying needs BAAI/bge-m3 locally (about 4.3 GB, downloaded on first use).
#    See docs/law-data-and-retrieval.md for copying the model cache on a slow network.

#    Check retrieval: is the right article in the top 5?
python -m core.retrieve "nghỉ việc phải báo trước bao nhiêu ngày"
python -m scripts.check_retrieval data/test/retrieval_smoke.csv

# 2. Audit a CSV of answers (writes results.json)
python -m core.audit data/test/dev_set.csv

# 3. Score results against an answer key kept outside the repo
python -m eval.score results.json <path/to/answer_key.csv> [--lan2 results_run2.json] [--out results_score.json]
#    --lan2: a second run of the same CSV, to measure verdict stability. Dev set key: data/test/dev_set_dap_an.csv

# UI (Next.js, in web/; being built)
cd web && npm install && npm run dev
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
  "ten_chuong": "HỢP ĐỒNG LAO ĐỘNG",
  "muc": "Mục 3. CHẤM DỨT HỢP ĐỒNG LAO ĐỘNG",
  "dieu": 35,
  "tieu_de": "Quyền đơn phương chấm dứt hợp đồng lao động của người lao động",
  "noi_dung": "Điều 35. ...\n1. ...\na) Ít nhất 45 ngày ...",
  "so_khoan": 2,
  "sua_doi": [],
  "nguon": "Bộ luật Lao động – VBHN 18/VBHN-VPQH ngày 12/02/2026"
}
```

`retrieve()` returns this dict, plus `score` (cosine) and `chi_tham_chieu`. Article 219 has `chi_tham_chieu: true` because it quotes amendments to other laws. It is skipped by default search and can still be fetched with `get_article(219)`.

The index runs in Qdrant local mode (`.qdrant/`, git-ignored), and only one process can open it at a time. To use a Qdrant server instead, set `QDRANT_URL` in `.env`.

**`results.json`:**

```json
{
  "tong_ket": {"so_cau": 20, "dung": 15, "sai": 5, "khong_can_cu": 0, "loi": 0, "faithfulness_tb": 0.75, "cong": "KHONG_DAT"},
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
- `cac_y[].ha_nhan`: present and `true` only when the system downgraded a `DUNG` claim to `KHONG_CAN_CU` because its citation is not among the articles given to the judge (the top-5 retrieved, plus up to 3 articles the answer itself cites, fetched with `get_article`). Absent otherwise.
- `cac_y[].bang_chung_khop`: present and `false` only when `bang_chung` is not a verbatim quote of the cited article (compared word by word, ignoring case and punctuation; the judge may elide with `...`). A warning only: the label is not changed. Absent otherwise.
- `cau[].ket_luan`: `DUNG`, `SAI`, `KHONG_CAN_CU`, or `LOI` when the answer could not be audited (it is retried once first).
- `cau[].loi`: present only when `ket_luan` is `LOI`; the error message.
- `cau[].faithfulness`: share of the answer's claims labelled `DUNG` (supported claims / all claims), rounded to 2 decimals; `null` when `ket_luan` is `LOI`. This follows the Ragas definition of faithfulness but is computed from the audit's own labels (after the citation check), not by calling the Ragas library.
- `tong_ket.loi`: number of answers with `LOI`. Always `so_cau = dung + sai + khong_can_cu + loi`.
- `tong_ket.faithfulness_tb`: mean `faithfulness` over the answers that have one (answers with `LOI` are skipped), rounded to 2 decimals; `null` if none has a value. It reads as "share of claims that have a basis in the law text", not as a legal-correctness score: `TRAI_LUAT` and `KHONG_CAN_CU` claims both count as unsupported.
- `tong_ket.cong`: `KHONG_DAT` (some answer is `SAI`), `CAN_XEM_LAI` (no `SAI`, but some answer is `KHONG_CAN_CU` or `LOI`), `DAT` (every answer is `DUNG`).

## Evaluation

The team tunes on one set and reports on another, so the reported numbers are not fitted to the test questions.

- **Dev set:** 10 questions, open to the whole team for tuning.
- **Test set:** 20 questions, 5 of them deliberately wrong. Only the evaluation owner holds the test set and its answer key. Both are git-ignored (`data/test/test_set*.csv`, `answer_key*.csv`), so they never reach the repo.
- **Blind runs:** code is frozen first, then the test set is run twice to measure how stable the verdicts are.

**Scoring rule.** A verdict of `SAI` or `KHONG_CAN_CU` both count as flagging an answer:
- A deliberately wrong answer is **caught** if its verdict is `SAI` or `KHONG_CAN_CU`, and **missed** if it is `DUNG` or `LOI`.
- A correct answer is a **false alarm** if its verdict is `SAI` or `KHONG_CAN_CU`. A correct answer with `LOI` is not a false alarm.
- The number of `LOI` answers is reported separately.

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
- Login and a FastAPI backend in `api/` behind the Next.js frontend in `web/`.

## Team

| Member | Role |
|---|---|
| Ngô Chí Vĩnh | Claim verification (`core/audit.py`) |
| Nguyễn Khắc Bào | Law data and retrieval (`core/ingest.py`, `core/retrieve.py`), project management |
| Lê Viết Khoa | Test sets, scoring (`eval/score.py`), demo |
| Phan Trung Hiếu | Next.js UI and deployment (`web/`) |

## Disclaimer

lexgate is a research prototype, not legal advice. The law text is the consolidated document 18/VBHN-VPQH issued by the Office of the National Assembly, as published in the Official Gazette (congbao.chinhphu.vn).
