# Template Management & Extensibility Guide

## 1. Overview
The **Smart Document Generator – ACM SVNIT** uses a **Configuration-Driven Template Registry** pattern (`backend/app/core/template_registry.py`).
This allows authorized developers and club maintainers to register, configure, and validate official document templates without hardcoding conditional branches throughout the codebase or modifying core routing mechanisms.

The system currently supports three standardized ACM SVNIT document types:
1. `exec_meet`: **Executive Meet** (Event proposals, room reservations, and administrative permission requests)
2. `bill_certificate`: **Bill Certificate** (Financial expenditure certification, recurring purchase validations)
3. `bill_summary`: **Bill Summary** (Prize distributions, reimbursements, multi-recipient payment schedules)

---

## 2. Template Architecture

Each template is defined by an instance of `TemplateDefinition`:

```python
from app.core.template_registry import TemplateDefinition, template_registry

template = TemplateDefinition(
    id="custom_template_id",
    title="Custom Document Title",
    description="Official purpose and context for the document.",
    icon="📑",
    category="Administrative",
    reference_document="sample_reference.pdf",
    schema_class=CustomRequestSchema,
    service_class=CustomDocumentService,
    required_fields=["event_name", "date", "venue"],
    optional_fields=["notes", "remarks"],
    field_labels={
        "event_name": "Event Name",
        "date": "Document Date",
        "venue": "Event Venue",
    },
    aliases={
        "location": "venue",
        "event_title": "event_name",
    }
)

template_registry.register(template)
```

### Key Components of a Template Definition:
- **`id`**: Unique kebab/snake_case string identifier used in routing (`/api/documents/templates/{id}`) and frontend state.
- **`schema_class`**: Pydantic `BaseModel` that enforces payload structure, data types, and server-side constraints.
- **`service_class`**: Python service containing static/class methods:
  - `generate_docx(data, output_path: Path) -> None`
  - `generate_pdf(data, output_path: Path) -> None`
- **`required_fields`**: List of field keys that are strictly mandatory.
- **`optional_fields`**: List of non-blocking fields that may remain blank.
- **`field_labels`**: User-friendly names used in missing-field alerts and review panels.
- **`aliases`**: Mapping of natural-language or synonym keys to the canonical schema field.

---

## 3. Step-by-Step: Adding a New Compatible Template

### Step 1: Create the Request Schema
Create `backend/app/schemas/your_template.py`:
```python
from pydantic import BaseModel, Field
from typing import Optional

class YourTemplateRequest(BaseModel):
    title: str = Field(description="Document title")
    date: str = Field(description="Document date DD/MM/YYYY")
    organizer: str = Field(description="Organizing lead")
    notes: Optional[str] = Field(default="", description="Additional remarks")
```

### Step 2: Implement the Generation Service
Create `backend/app/services/your_template_service.py`:
- Use `python-docx` for `.docx` output, utilizing standard margins (0.65") and SVNIT / ACM header tables.
- Use `reportlab` for `.pdf` output with `SimpleDocTemplate` and consistent styling palette.
- Implement both `generate_docx(data, path)` and `generate_pdf(data, path)`.

### Step 3: Register in the Registry
In `backend/app/core/template_registry.py` (or within an initialization hook):
```python
from app.schemas.your_template import YourTemplateRequest
from app.services.your_template_service import YourTemplateService

template_registry.register(TemplateDefinition(
    id="your_template",
    title="Your Template Name",
    description="Brief description of the template purpose.",
    icon="📄",
    category="Club Operations",
    reference_document="sample.pdf",
    schema_class=YourTemplateRequest,
    service_class=YourTemplateService,
    required_fields=["title", "date", "organizer"],
    optional_fields=["notes"],
    field_labels={
        "title": "Document Title",
        "date": "Issue Date",
        "organizer": "Organizing Lead"
    }
))
```

### Step 4: Add Backend Route (if custom endpoints needed)
Register the generation route in `backend/app/api/documents.py`:
```python
@router.post("/your-template/generate")
def generate_your_template(data: YourTemplateRequest):
    ...
```

---

## 4. Validation & Error Handling
1. **API Validation**: Calling `GET /api/documents/templates/{template_id}` returns the complete field registry and required field lists.
2. **Missing Field Detection**: `template.get_missing_required_fields(data)` checks missing keys and surfaces clear human-readable alerts to the user before generation.
3. **Decimal Calculations**: For financial documents, all totals must use `round(float, 2)` or `Decimal` with consistent subtotal + tax = grand total logic.

---

## 5. Architectural Distinction
- **Configuration-Driven Extensibility**: Supported. Authorized maintainers can declare and modify templates via clean definitions, schemas, and generators in code.
- **Live User-Facing Drag-and-Drop Editor**: Not currently implemented. Template definitions are kept server-side to guarantee official compliance with SVNIT format standards.
