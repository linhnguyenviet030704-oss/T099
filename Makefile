.PHONY: run test lint format typecheck check clean

run:
	uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

test:
	pytest tests/ -v

lint:
	ruff check backend/ agent/ tests/

format:
	ruff format backend/ agent/ tests/

typecheck:
	mypy backend/ agent/

check: lint format test

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type d -name .pytest_cache -exec rm -rf {} +
	find . -type d -name .ruff_cache -exec rm -rf {} +
