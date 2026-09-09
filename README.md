# Slack — Travel Disruption Recovery Engine

A real-time travel itinerary management system that models trips as **dependency graphs**, where buffer time between bookings is edge slack. When a disruption hits — a delayed flight, a cancelled transfer — the engine propagates the impact through a BFS ripple wave, scores ranked recovery options, and lets travelers restore their schedule in seconds.

## Overview

Most travel tools treat itineraries as flat lists. Slack treats them as directed acyclic graphs where every booking is a node and every connection between bookings is a weighted edge carrying timing constraints. This structure makes it possible to answer questions flat lists cannot:

- *If my flight lands 60 minutes late, which downstream bookings break?*
- *What's the cheapest way to recover without losing my hotel?*
- *How resilient is my trip to a single-point failure?*

**Built for:** Travelers managing multi-city, multi-booking trips where timing dependencies between segments matter.

## Key Features

- **Dependency Graph Modeling** — Bookings become nodes; temporal, location, and prerequisite constraints become weighted edges with computed slack metrics
- **BFS Disruption Ripple Engine** — Delay or cancel any booking and watch the impact propagate through downstream connections, classifying each as missed, at-risk, or unaffected
- **Ranked Recovery Options** — Automatically generates rebook, shift, and drop candidates scored across cost, time, itinerary preservation, and refund recovery (with optional LLM enrichment via Groq)
- **Trip Resilience Scoring** — A 0–100 composite score grading overall trip health as Robust, Caution, or Critical
- **Real-Time Collaboration** — SSE-powered live updates, presence tracking, role-based access (owner/editor/viewer), invite links, and an activity feed
- **Live Weather Integration** — Real-time airport conditions from Open-Meteo with calculated ground-stop delay estimates
- **Interactive D3 Graph Visualization** — Time-anchored SVG canvas with pan/zoom, day-jump navigation, animated ripple waves, and fit-to-content scaling up to 16+ bookings

## Architecture

```mermaid
flowchart TB
    User([Traveler]) --> Frontend

    subgraph Frontend["Next.js 16 Frontend"]
        UI[React UI + D3 Graph]
        Hooks[Domain Hooks<br/>useTripState, etc.]
        API_Client[API Client]
        SSE_Listener[SSE Listener]
    end

    subgraph Backend["FastAPI Backend"]
        Routers[Domain Routers<br/>Trips, Bookings, Disruptions]
        GraphEngine[Graph Builder<br/>NetworkX]
        RippleEngine[BFS Ripple Engine]
        RecoveryEngine[Recovery Scoring Engine]
        Heuristics[Dependency Heuristics]
        EventBus[SSE Event Bus]
        DemoSeed[Demo Seeding]
    end

    subgraph External["External Services"]
        PostgreSQL[(PostgreSQL)]
        OpenMeteo[Open-Meteo API]
        Groq[Groq LLM API<br/>Optional]
    end

    UI --> API_Client
    API_Client -->|REST| Routes
    SSE_Listener -->|SSE Stream| EventBus
    Routes --> GraphEngine
    Routes --> RippleEngine
    Routes --> RecoveryEngine
    Routes --> Heuristics
    Routes --> EventBus
    Routes --> DemoSeed
    GraphEngine --> PostgreSQL
    RippleEngine --> GraphEngine
    RecoveryEngine --> Groq
    DemoSeed --> OpenMeteo
    Routes --> PostgreSQL
```

### Component Responsibilities

| Component | Role |
|---|---|
| **Domain Routers** (`slack-api/app/routers/`) | FastAPI REST + SSE endpoints split logically by domain (trips, bookings, disruptions, members) |
| **Graph Builder** (`graph.py`) | Constructs a NetworkX DiGraph from bookings and dependencies, computing actual gap, slack, and edge status |
| **Ripple Engine** (`ripple.py`) | BFS traversal from a disrupted node outward, classifying severity per downstream booking |
| **Recovery Engine** (`recovery.py`) | Generates 3 recovery candidates (rebook, shift, drop) with a transparent weighted scoring formula |
| **Event Bus** (`events.py`) | In-memory pub/sub with per-trip SSE channels and presence heartbeat tracking |
| **D3 Graph View** (`GraphView.tsx`) | Responsive, time-anchored SVG rendering with D3 zoom, animated ripple pulses, and day-grouped layout |
| **Frontend Hooks** (`slack-web/hooks/`) | Extracted modular state management (`useTripState`, `useDisruptionFlow`, `useD3Graph`) |

## Core Workflow: Disruption → Ripple → Recovery

```mermaid
sequenceDiagram
    actor Traveler
    participant UI as Frontend
    participant API as FastAPI
    participant Ripple as BFS Ripple Engine
    participant Recovery as Recovery Scorer
    participant DB as PostgreSQL

    Traveler->>UI: Trigger disruption (e.g., Flight +60m delay)
    UI->>API: POST /trips/{id}/disruptions
    API->>DB: Insert disruption row
    API->>Ripple: Compute effective bookings with delay applied
    Ripple->>Ripple: BFS traversal from disrupted node
    Ripple->>Ripple: Classify each downstream node (missed/at_risk/unaffected)
    Ripple-->>API: ripple_path + per_node_impact + updated_graph
    API-->>UI: RippleResponse (animated in graph)

    Traveler->>UI: View Impact Panel → Request recovery options
    UI->>API: POST /trips/{id}/disruptions/{id}/recovery-options
    API->>Recovery: Generate rebook, shift, drop candidates
    Recovery->>Recovery: Score each (cost 35% + time 30% + itinerary 20% + refund 15%)
    Recovery-->>API: Ranked candidates with scoring breakdown
    API-->>UI: RecoveryOptionsResponse

    Traveler->>UI: Apply recommended option
    UI->>API: POST /recovery-options/{candidate_id}/apply
    API->>DB: Mutate booking (shift time / drop / rebook)
    API->>DB: Resolve disruption
    API-->>UI: Updated graph with restored slack
```

## How the System Works

### Slack Metric Computation

Every dependency edge carries three derived values computed in [`graph.py`](slack-api/app/graph.py):

```
actual_gap = (to_booking.start_time - from_booking.end_time) in minutes
slack       = actual_gap - min_buffer_minutes
status      = "violated" if slack < 0, "tight" if slack ≤ 30, else "safe"
```

The `tight_threshold_minutes` (default: 30) is configurable via environment.

### Resilience Score

Computed in the `/trips/{id}/resilience` endpoint ([`routes.py`](slack-api/app/routes.py)):

```
score = max(0, 100 - (tight_edges × 15) - (violated_edges × 35))
grade = "Robust" (≥80) | "Caution" (≥50) | "Critical" (<50)
```

### Recovery Scoring Formula

Each recovery candidate is scored on a 0–100 scale with fixed transparent weights:

| Factor | Weight | Logic |
|---|---|---|
| Cost | 35% | 100 if no extra cost; drops 1.5 points per dollar of additional spend |
| Time | 30% | 100 if no schedule slip; drops 0.5 points per minute of delay |
| Itinerary Preservation | 20% | 100 minus percentage of itinerary altered |
| Refund Recovery | 15% | Percentage of original cost recoverable under the stored cancellation policy |

### Real-Time Updates

The backend maintains an in-memory `TripEventBus` ([`events.py`](slack-api/app/events.py)) with per-trip SSE channels. All mutations (booking CRUD, disruptions, recoveries, member changes) broadcast events that connected clients receive instantly. Presence tracking uses heartbeat-based expiry (25-second TTL).

### Auto-Suggested Dependencies

When a booking is created, [`heuristics.py`](slack-api/app/heuristics.py) scans existing bookings for temporal proximity (within 24 hours) and location overlap, then suggests edges with type-aware buffer recommendations (e.g., 60m after flights for customs, 90m before flights for check-in).

## Project Structure

```
slack/
├── schema.sql                    # PostgreSQL schema with RLS policies
├── slack-api/                    # FastAPI backend
│   ├── app/
│   │   ├── main.py               # Application entrypoint + CORS setup
│   │   ├── auth.py               # Shared JWT authentication dependency
│   │   ├── config.py             # Pydantic settings
│   │   ├── routers/              # Domain-specific REST + SSE endpoints
│   │   ├── db/                   # Database CRUD operations per domain
│   │   ├── models.py             # Pydantic request/response schemas
│   │   ├── graph.py              # NetworkX graph construction + slack computation
│   │   ├── ripple.py             # BFS disruption propagation engine
│   │   ├── recovery.py           # Ranked recovery candidate generation + scoring
│   │   └── events.py             # SSE event bus + presence tracking
│   └── tests/                    # Pytest test suite
└── slack-web/                    # Next.js 16 frontend
    ├── app/
    │   ├── page.tsx              # Landing page
    │   ├── layout.tsx            # Global layout + next/font integrations
    │   └── trips/[tripId]/       # Main workspace and settings routes
    ├── components/               # React presentational components
    │   ├── GraphView.tsx         # D3 SVG graph (responsive, touch-enabled)
    │   ├── TripHeader.tsx        # Top navigation with Notifications & Presence
    │   └── ...
    ├── hooks/                    # Extracted logic (useTripState, useD3Graph, etc.)
    └── lib/                      # Typed API client + Auth + Types
```

## Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js 16, React 19, TypeScript | Application shell + routing |
| Visualization | D3.js 7 | Interactive SVG graph rendering |
| Animation | Framer Motion | UI transitions and micro-animations |
| Icons | Lucide React | Consistent iconography |
| Styling | Tailwind CSS 4 | Utility-first styling |
| Backend | FastAPI, Python 3.11+ | REST API + SSE streaming |
| Graph Library | NetworkX 3 | Directed graph construction + BFS traversal |
| Database | PostgreSQL | Persistent storage with UUID, JSONB, TIMESTAMPTZ |
| DB Driver | psycopg2 | Direct PostgreSQL connection |
| Validation | Pydantic 2 | Request/response schema validation |
| Weather API | Open-Meteo | Live airport weather conditions |
| LLM (Optional) | Groq (Llama 3.3 70B) | Human-readable recovery explanations |

## Quick Start

### Prerequisites

- **Python** ≥ 3.11
- **Node.js** ≥ 18
- **PostgreSQL** ≥ 14 (running locally or remote)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd slack

# Backend
cd slack-api
pip install -e ".[dev]"
cp .env.example .env
# Edit .env with your PostgreSQL credentials

# Frontend
cd ../slack-web
npm install
cp .env.example .env.local
```

### Environment Configuration

**Backend** (`slack-api/.env`):

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Yes | `postgresql://postgres:2006@localhost:5432/slack_db` | PostgreSQL connection string |
| `TIGHT_THRESHOLD_MINUTES` | No | `30` | Slack threshold for "tight" edge classification |
| `DEBUG` | No | `false` | Enable debug mode |
| `GROQ_API_KEY` | No | — | Optional: enables LLM-enriched recovery explanations |

**Frontend** (`slack-web/.env.local`):

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | `http://localhost:8000` | Backend API endpoint |

### Run Locally

```bash
# Terminal 1: Start the backend (auto-creates database and tables on first run)
cd slack-api
uvicorn app.main:app --reload --port 8000

# Terminal 2: Start the frontend
cd slack-web
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Click **"Load Demo Trip"** to seed a complete multi-city itinerary and explore the graph.

## Important Commands

```bash
# Backend
uvicorn app.main:app --reload           # Development server
python -m pytest                        # Run all 27 tests

# Frontend
npm run dev                             # Development server (port 3000)
npm run build                           # Production build
npm run lint                            # ESLint check
npx tsc --noEmit                        # Type check
```

## API Reference

### Trip Management

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/trips` | Create a new trip |
| `GET` | `/trips` | List all trips |
| `GET` | `/trips/{trip_id}` | Get a single trip |

### Bookings & Dependencies

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/trips/{trip_id}/bookings` | Add booking (returns auto-suggested dependencies) |
| `PUT` | `/bookings/{booking_id}` | Update a booking |
| `DELETE` | `/bookings/{booking_id}` | Delete booking (cascades to dependencies) |
| `POST` | `/trips/{trip_id}/dependencies` | Create a dependency edge |
| `PUT` | `/dependencies/{dependency_id}` | Update dependency buffer/type |
| `DELETE` | `/dependencies/{dependency_id}` | Remove a dependency |

### Graph & Analysis

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/trips/{trip_id}/graph` | Full graph with computed slack metrics |
| `GET` | `/trips/{trip_id}/suggestions` | Auto-suggested dependency edges |
| `GET` | `/trips/{trip_id}/resilience` | Resilience score, grade, and thin connections |

### Disruptions & Recovery

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/trips/{trip_id}/disruptions` | Trigger disruption → returns BFS ripple response |
| `GET` | `/trips/{trip_id}/disruptions` | List active (unresolved) disruptions |
| `POST` | `/disruptions/{disruption_id}/resolve` | Resolve and revert graph |
| `POST` | `/trips/{trip_id}/disruptions/{id}/recovery-options` | Generate ranked recovery candidates |
| `POST` | `/recovery-options/{candidate_id}/apply` | Apply a recovery option |

### Collaboration

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/trips/{trip_id}/events` | SSE stream for real-time updates |
| `POST` | `/trips/{trip_id}/presence` | Send presence heartbeat |
| `POST` | `/trips/{trip_id}/members/invite` | Invite a collaborator |
| `GET` | `/trips/{trip_id}/members` | List trip members |
| `DELETE` | `/trips/{trip_id}/members/{member_id}` | Remove a member |
| `GET` | `/invites/{token}` | Preview an invite |
| `POST` | `/invites/{token}/accept` | Accept an invite |
| `GET` | `/trips/{trip_id}/activity` | Activity feed |

### Demo & Weather

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/demo/seed` | Seed Alpine Odyssey demo trip (7 bookings) |
| `POST` | `/demo/seed-stress` | Seed 16-booking stress test trip |
| `POST` | `/demo/sample-disruption` | Trigger pre-configured Flight LX 354 +60m delay |
| `GET` | `/weather/airports` | Live weather for ZRH, GVA, LHR, CDG, MXP |
| `POST` | `/trips/{trip_id}/disruptions/live-weather` | Trigger weather-based disruption |
| `GET` | `/health` | Health check |

## Database Model

```mermaid
erDiagram
    trips ||--o{ bookings : contains
    trips ||--o{ dependencies : contains
    trips ||--o{ disruptions : contains
    trips ||--o{ trip_members : has
    trips ||--o{ activity_feed : logs

    bookings ||--o{ dependencies : "from/to"
    bookings ||--o{ disruptions : affects
    disruptions ||--o{ recovery_candidates : generates
    disruptions ||--o{ applied_recoveries : resolves
    recovery_candidates ||--o{ applied_recoveries : tracks

    trips {
        uuid id PK
        text name
        uuid owner_id
        timestamptz created_at
    }

    bookings {
        uuid id PK
        uuid trip_id FK
        text type "flight|hotel|transfer|activity"
        text title
        text vendor
        text location
        timestamptz start_time
        timestamptz end_time
        numeric cost
        text cancellation_policy
        jsonb metadata
    }

    dependencies {
        uuid id PK
        uuid trip_id FK
        uuid from_booking_id FK
        uuid to_booking_id FK
        integer min_buffer_minutes
        text dependency_type "temporal|location|prerequisite"
    }

    disruptions {
        uuid id PK
        uuid trip_id FK
        uuid booking_id FK
        text disruption_type "delay|cancellation|weather|other"
        integer delay_minutes
        boolean resolved
    }

    recovery_candidates {
        uuid id PK
        uuid disruption_id FK
        uuid target_booking_id FK
        text candidate_type "rebook|shift|drop"
        integer score "0-100"
        numeric cost_delta
        jsonb scoring_breakdown
        jsonb mutation_payload
    }

    trip_members {
        uuid id PK
        uuid trip_id FK
        text email
        text role "owner|editor|viewer"
        text invite_token
    }
```

The database auto-initializes on first backend startup — no manual migration step is required. The schema includes Supabase-compatible Row Level Security (RLS) policies scoped to `auth.uid()` for production deployment (see [`schema.sql`](schema.sql)).

## Authorization

Authorization is enforced server-side via request headers:

| Header | Purpose |
|---|---|
| `X-User-Name` | Actor identity for activity logging |
| `X-User-Email` | Email for member role lookup |
| `X-User-Role` | Declared role (`owner` / `editor` / `viewer`) |

**Enforcement:** All mutation endpoints call `verify_trip_mutation_permission()`, which returns `403 Forbidden` if the caller's role is `viewer`. Viewers have full read access but cannot modify bookings, dependencies, disruptions, or recoveries.

> **Note:** The current implementation uses header-based identity without cryptographic authentication (no JWT/session tokens). This is suitable for development and demo scenarios. For production, integrate a proper auth provider (e.g., Supabase Auth) and validate tokens server-side.

## External Integrations

### Open-Meteo (Weather)

- **Purpose:** Live airport weather conditions for weather-based disruptions
- **Endpoint:** `https://api.open-meteo.com/v1/forecast`
- **Coverage:** ZRH, GVA, LHR, CDG, MXP
- **Data:** Temperature, wind speed, gusts, precipitation, WMO weather code
- **No API key required** — Open-Meteo is a free, open-source weather API

### Groq LLM (Optional)

- **Purpose:** Enriches recovery candidate explanations with natural language
- **Model:** Llama 3.3 70B Versatile
- **Behavior:** If `GROQ_API_KEY` is not set or the call fails, the engine falls back to deterministic human-readable explanations — **the feature degrades gracefully, never blocks**
- **Timeout:** 3 seconds hard limit

## Testing

The backend has 27 pytest tests covering all major subsystems:

```bash
cd slack-api
python -m pytest
```

| Test File | Tests | Coverage Area |
|---|---|---|
| `test_graph.py` | 2 | Graph construction, slack computation, edge status classification |
| `test_ripple.py` | 4 | BFS traversal, severity classification, multi-hop propagation |
| `test_recovery.py` | 4 | Candidate generation, scoring formula, cancellation policy parsing |
| `test_resilience.py` | 4 | Resilience score computation, grade thresholds, thin connection detection |
| `test_collaboration.py` | 5 | Member invite/accept, role-based authorization, activity feed |
| `test_demo.py` | 5 | Demo seeding, stress test, sample disruption, weather endpoints |
| `test_postgres.py` | 3 | PostgreSQL CRUD operations, cascade deletes, data integrity |

## Architectural Decisions

| Decision | Why | Trade-off |
|---|---|---|
| **Graph-based itinerary model** | Enables propagation analysis impossible with flat lists; slack metrics are a natural property of edges in a DAG | Higher conceptual complexity vs. simple list storage |
| **BFS for ripple propagation** | Guarantees all downstream nodes are visited in correct dependency order; linear time complexity O(V+E) | Assumes acyclic graph; cycles would cause infinite traversal |
| **Deterministic scoring with optional LLM** | Scoring is always available and reproducible without external dependencies; LLM only adds polish | LLM explanations may vary between calls |
| **In-memory event bus** | Zero-infrastructure SSE for real-time updates; no Redis/RabbitMQ dependency | State lost on server restart; single-process only |
| **PostgreSQL with psycopg2 (no ORM)** | Direct SQL gives full control over queries, UUID/JSONB types, and connection behavior | More boilerplate than SQLAlchemy; manual query construction |
| **Auto-initializing database** | `init_postgres_db()` creates tables on startup, eliminating migration tooling for development | Not suitable for production schema evolution — needs a migration tool |

## Troubleshooting

| Problem | Solution |
|---|---|
| `database "slack_db" does not exist` | The backend auto-creates it on first startup. Ensure PostgreSQL is running and `DATABASE_URL` credentials are correct. |
| `connection refused` on port 5432 | Start PostgreSQL: `pg_ctl start` or `sudo service postgresql start` |
| Frontend shows "Failed to fetch" | Verify the backend is running on port 8000 and `NEXT_PUBLIC_API_URL` is set in `slack-web/.env.local` |
| SSE events not arriving | Check browser DevTools Network tab for the `/events` stream. Ensure only one tab is connected per client ID. |
| Recovery options missing LLM text | Set `GROQ_API_KEY` in `slack-api/.env`. Without it, deterministic fallback explanations are used (this is expected behavior). |
| Graph view doesn't fit large trips | Click the "Fit to Screen" button in the header. The D3 view supports up to 16+ bookings with `scaleExtent [0.15, 3.5]`. |

## Production Considerations

### Currently Implemented

- Row Level Security (RLS) policies in PostgreSQL schema for multi-tenant isolation
- Role-based mutation control (owner/editor/viewer) enforced server-side
- Graceful degradation when external services (Groq, Open-Meteo) are unavailable
- Activity audit trail for all mutations
- CORS configuration
- Health check endpoint (`GET /health`)

### Known Limitations

- **No cryptographic authentication** — identity is declared via headers, not verified with tokens
- **In-memory event bus** — SSE state is lost on server restart and does not scale horizontally
- **No database migrations** — tables are created with `CREATE IF NOT EXISTS`; schema evolution requires manual intervention
- **No rate limiting** — all endpoints are unthrottled
- **Single-process architecture** — the event bus and presence tracking are not distributed

### Recommended Hardening & Deployment

- **Frontend:** Vercel is the recommended and easiest way to deploy the Next.js frontend. Connect your GitHub repository to Vercel and it will automatically build and deploy.
- **Backend:** **Fly.io** is highly recommended for the FastAPI backend and PostgreSQL database. Fly.io provides an excellent free tier and makes it easy to run a Postgres cluster alongside the FastAPI app using a standard `Dockerfile`.
- **Database:** If not using Fly.io's Postgres, Supabase or Neon are great serverless PostgreSQL alternatives.
- Integrate Supabase Auth or similar for JWT-based authentication
- Replace in-memory event bus with Redis Pub/Sub for horizontal scaling
- Add Alembic or similar for database migration management
- Implement rate limiting on mutation endpoints
- Add structured logging (e.g., structlog) and error monitoring (e.g., Sentry)
