.PHONY: install dev-backend dev-frontend dev test lint migrate migrate-new

install:
	cd backend && uv venv && uv pip install -e ".[dev]"
	@echo "Backend installed. Run 'make dev-backend' to start."

dev-backend:
	cd backend && uv run uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

dev:
	$(MAKE) dev-backend &
	$(MAKE) dev-frontend &
	wait

test:
	cd backend && uv run pytest -v

lint:
	cd backend && uv run ruff check .
	cd backend && uv run ruff format --check .

lint-fix:
	cd backend && uv run ruff check --fix .
	cd backend && uv run ruff format .

migrate:
	cd backend && uv run alembic upgrade head

migrate-new:
	@read -p "Migration message: " msg; \
	cd backend && uv run alembic revision --autogenerate -m "$$msg"
