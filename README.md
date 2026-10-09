# Smart Document Generator — ACM SVNIT Surat

A production-grade, hackathon-ready full-stack web application designed for the **ACM Student Chapter at Sardar Vallabhbhai National Institute of Technology (SVNIT), Surat**. This platform automates the end-to-end creation, calculation, and generation of official club documentation from structured form inputs and natural-language prompts.

The system faithfully reproduces the visual layout, administrative headings, bilingual headers, tables, and signature sections of official SVNIT and ACM documents, generating real, downloadable **Microsoft Word (.docx)** and **ReportLab PDF (.pdf)** files.

---

## 🌟 Key Features

1. **Three Core Official Document Types**:
   - **Executive Meet (`exec_meet`)**: Standardized event proposal and room/hall permission requests, including reference numbers, schedule tables, objectives, participant counts, and official 4-quadrant signatory blocks (Student Chairperson, Tech Assistant, Faculty In-charge, Faculty Chairman).
   - **Bill Certificate (`bill_certificate`)**: Recurring expenditure certification following official SVNIT Form BC-R standards. Features multi-item dynamic line items, automated financial calculations (Subtotal + Taxes = Total Estimated Amount), supplier information, bank account details, stock register entries, indenter details, and accounts section approval stamps.
   - **Bill Summary (`bill_summary`)**: Hackathon and activity prize reimbursement summaries. Supports dynamic multiple recipient rows, automated prize money and expense totaling, Page 1 summary table with 3-party signatory columns (Student Head, Student Secretary, Faculty Chairman), and Page 2 dedicated bank disbursement table.

2. **Automated Server-Side Financial Calculations**:
   - Strict decimal-safe calculation for line items: `item_total = quantity × unit_cost`.
   - Subtotals, tax/delivery charges, and grand totals are validated and calculated on the server to prevent client-side tampering.

3. **High-Fidelity Document Generation**:
   - **DOCX**: Native Word styling via `python-docx` with custom XML table borders, cell background shading, margins, and embedded official ACM & SVNIT logos.
   - **PDF**: Pixel-crisp PDF rendering via `ReportLab` with exact column widths, page flow, table styling, and multi-page safety.

4. **Natural-Language Quick-Fill Assistant (Optional)**:
   - Paste unstructured event prompts (e.g. *"Organize an ACM technical workshop on 15 November at Seminar Hall 402 for 150 students"*).
   - Deterministic entity extraction parses candidate event dates, participant counts, venues, and objectives with confidence metrics and automatic document recommendation.

5. **Security & Safe File Handling**:
   - Unique UUID-based session storage prevents collision and directory traversal attacks.
   - Safe content-disposition filenames (e.g., `Executive_Meet_15-10-2026.docx`).
   - Automated expiration and cleanup of temporary generated documents.

---

## 🛠️ Technology Stack

- **Frontend**: React 19, Vite, Vanilla CSS design system (dark sidebar, purple gradient hero, dynamic data tables).
- **Backend**: Python 3.11+, FastAPI, Uvicorn, Pydantic v2.
- **Document Engines**: `python-docx` (Word documents), `ReportLab` (PDF documents), `pypdf`.
- **Testing**: `pytest`, `httpx` (API test client), `oxlint` (frontend linting).

---

## 📂 Repository Structure

```text
smart-document-generator-acm-svnit/
│
├── assets/
│   └── branding/              # Official SVNIT & ACM emblem logos
│       ├── acm_logo.png
│       └── svnit_logo.png
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── documents.py   # Generation, template, & download endpoints
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   └── config.py      # App settings, paths, and CORS configuration
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── executive_meet.py
│   │   │   ├── bill_certificate.py
│   │   │   └── bill_summary.py
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── executive_meet_service.py
│   │   │   ├── bill_certificate_service.py
│   │   │   └── bill_summary_service.py
│   │   ├── utils/
│   │   │   ├── __init__.py
│   │   │   └── file_manager.py
│   │   └── main.py            # FastAPI entrypoint with CORS & lifespan
│   ├── tests/
│   │   └── test_documents.py  # 12 unit and integration tests
│   ├── .env.example
│   └── requirements.txt
│
├── frontend/
│   ├── public/                # Icons and favicons
│   ├── src/
│   │   ├── services/
│   │   │   └── documentApi.js # API client for FastAPI
│   │   ├── App.jsx            # Dynamic document studio & review flows
│   │   ├── App.css            # Styles for tables, cards, & downloads
│   │   ├── index.css
│   │   └── main.jsx
│   ├── .env.example
│   ├── package.json
│   └── vite.config.js
│
├── templates/
│   ├── exec_meet/             # Official EXEC MEET reference PDF
│   ├── bill_certificate/      # Official Bill Certificate reference PDF
│   └── bill_summary/          # Official Bill Summary reference PDF
│
├── .gitignore
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- **macOS** (or Linux / Windows with bash)
- **Python 3.10+** (Python 3.11, 3.12, or 3.13)
- **Node.js 18+** and **npm**

---

### 1. Backend Installation & Setup

Open a terminal window and navigate to the `backend/` directory:

```bash
cd backend

# Create and activate virtual environment (if not already created)
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
python -m pip install -r requirements.txt

# Create environment configuration (optional overrides)
cp .env.example .env

# Start the FastAPI backend server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The backend server will run at:
- **API Base URL**: `http://127.0.0.1:8000`
- **Interactive Swagger Docs**: `http://127.0.0.1:8000/docs`
- **Health Check**: `http://127.0.0.1:8000/health`

---

### 2. Frontend Installation & Setup

Open a second terminal window and navigate to the `frontend/` directory:

```bash
cd frontend

# Install npm dependencies
npm install

# Create environment configuration
cp .env.example .env

# Start Vite development server
npm run dev
```

The frontend web application will run at:
- **Web App**: `http://localhost:5173`

---

## 📡 API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | API status and root greeting |
| `GET` | `/health` | Service health status check |
| `GET` | `/api/documents/templates` | Lists supported templates and metadata |
| `POST` | `/api/documents/executive-meet/generate` | Generates DOCX & PDF for Executive Meet |
| `POST` | `/api/documents/bill-certificate/generate` | Recalculates totals & generates Bill Certificate |
| `POST` | `/api/documents/bill-summary/generate` | Recalculates totals & generates Bill Summary |
| `GET` | `/api/documents/download/{id}/{format}` | Secure download route for `.docx` or `.pdf` |
| `POST` | `/api/documents/nlp/extract` | Deterministic entity extractor for event prompts |

---

## 🧪 Testing Instructions

### Run Backend Unit & Integration Tests

From the repository root (or within `backend/` with venv activated):

```bash
backend/.venv/bin/pytest backend/tests/ -v
```

**Results**: 12 passing test cases covering:
- Health and template listing endpoints
- Valid and invalid schema submissions
- Executive Meet DOCX & PDF generation
- Bill Certificate financial arithmetic and validation
- Bill Summary multi-recipient generation and arithmetic
- Safe downloads & directory traversal rejection
- Natural language extraction
- Multi-page and long-text safety
- Precise decimal price rounding

### Run Frontend Lint & Build

From the repository root:

```bash
npm --prefix frontend run lint
npm --prefix frontend run build
```

**Results**: Clean production build with 0 lint warnings and 0 errors.

---

## 📄 Document Generation Workflow

1. **Step 1 — Choose a Document**: Select from Executive Meet, Bill Certificate, or Bill Summary.
2. **Step 2 — Document Information**: Fill out structured fields or use the optional **NLP Quick-Fill Assistant** to pre-populate details. Add/remove item or recipient rows dynamically.
3. **Step 3 — Review Information**: Verify all details and server-computed financial subtotals and totals before submission. Return to edit if needed.
4. **Step 4 — Generate Document**: Click **Generate DOCX & PDF ⚡**. The backend formats the tables, logos, and typography.
5. **Step 5 — Download Files**: Direct one-click download for both Word (`.docx`) and PDF (`.pdf`) with sanitized, descriptive filenames.

---

## 🔒 Security & Privacy

- **No Sensitive Data Persistence**: Bank account numbers and payment details are processed in memory and written only to the user-generated document.
- **Safe Path Retrieval**: File downloads are verified against the document session folder; directory traversal (`../`) is blocked.
- **CORS Restricted**: Defaults strictly to local development origins (`http://localhost:5173`, `http://127.0.0.1:5173`).
- **No Database Required**: Stateless and scalable document engine.

---

## 📝 Known Considerations & Limitations

- Physical handwritten signatures and official institute rubber stamps must be affixed manually after printing or through digital certificate signing tools.
- Official reference PDFs are archived in `templates/` as the ground truth.
