# 2FGT Kasyno (High-Performance Go + Clean JS Frontend)

Production-ready, provably fair virtual economy casino rewrite.

## 📁 Project Structure

```text
kasyno/
├── docker-compose.yml     # Complete stack orchestration (Postgres, Go backend, JS frontend)
├── .env.example           # Root environment configuration template
├── README.md              # Documentation & quickstart
├── backend/               # High-performance Go Backend (Go 1.23)
│   ├── cmd/               # Server entrypoint & Admin CLI grant tool
│   ├── internal/          # Games (Roulette, Blackjack, Mines, Slots), OIDC, Ledger, WS
│   ├── Dockerfile         # Multi-stage minimal Alpine/Scratch image
│   └── README.md          # Backend architecture & docs
└── frontend/              # Fast Pure JavaScript (React + Vite + Tailwind v4)
    ├── src/               # Anti-slop UI, tactile game tables, live ticker, audio
    ├── nginx.conf         # Production Nginx reverse proxy config
    ├── Dockerfile         # Multi-stage optimized Nginx build
    └── README.md          # Frontend docs
```

---

## 🚀 Quickstart with Docker Compose

1. **Clone & Configure Environment**:
   ```bash
   cp .env.example .env
   # Edit .env to set your AUTHENTIK_CLIENT_ID and AUTHENTIK_CLIENT_SECRET
   ```

2. **Launch Stack**:
   ```bash
   docker compose up -d --build
   ```

3. **Services Exposed**:
   - **Frontend**: `http://localhost:3000` (Reverse proxies `/api/*` and `/ws` to Go Backend)
   - **Backend API & WS**: `http://localhost:8080`
   - **PostgreSQL**: `127.0.0.1:5432`

---

## 🛠️ Local Development

### 1. Backend (Go)
```bash
cd backend
go test -v ./...
go run cmd/server/main.go
```

Admin grant CLI (add credits/XP to any user):
```bash
go run cmd/grant/main.go user@2fgt.pl 10000 500
```

### 2. Frontend (JavaScript React / Vite)
```bash
cd frontend
pnpm install
pnpm dev
```

---

## 🎲 Features & Improvements

- **100% Native Go Core**: Sub-millisecond game resolution, zero memory leaks, thread-safe WebSocket broadcast hub.
- **Provably Fair 2.0**: HMAC-SHA256 client/server seeds for Roulette, Mines, Slots, and deterministic Fisher-Yates Blackjack deck shuffle.
- **Atomic Balance & XP**: Concurrent transaction safety using PostgreSQL row-level locks (`FOR UPDATE`) and mathematical level curve $100 \times \text{level}^{1.5}$.
- **Authentik OIDC SSO**: Native backchannel logout, auto-registration, state validation, session cookies.
- **Anti-Slop Modern UI**: High contrast, tactile controls, real-time live win ticker, audio sound manager, mobile responsive.