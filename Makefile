.PHONY: dev-rust dev-py dev-all

dev-rust:
	cd apps/rust-core && cargo run

dev-py:
	cd apps/python-intelligence && uvicorn app.main:socket_app --reload --port 8090

dev-all:
	@echo "Starting all services..."
	@echo ""
	@echo "  ▸ Rust Core (port 8787) — data-plane API"
	@cd apps/rust-core && cargo run &
	@sleep 2
	@echo "  ▸ Python Intelligence (port 8090) — auth, billing, AI, real-time"
	@cd apps/python-intelligence && uvicorn app.main:socket_app --reload --port 8090 &
	@sleep 2
	@echo "  ▸ Frontend UI (port 5173) — Vite dev server"
	@cd apps/ui && bun run dev

