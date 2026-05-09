.PHONY: install build dev start typecheck clean rebuild setup-skills test test-watch docker-up docker-down help

.DEFAULT_GOAL := help

help:
	@echo ""
	@echo "database-mcp — available targets"
	@echo ""
	@echo "  install        Install npm dependencies"
	@echo "  build          Compile TypeScript + copy databases.json to dist/"
	@echo "  dev            Run MCP server in dev mode (tsx, no compile step)"
	@echo "  start          Run MCP server from compiled dist/"
	@echo "  typecheck      Type-check without emitting files"
	@echo "  clean          Remove dist/"
	@echo "  rebuild        clean + build"
	@echo "  setup-skills   Create skill symlinks for AI editors (Cursor, Claude Code...)"
	@echo "  test           Run integration tests (requires Docker or TEST_DATABASE_URL)"
	@echo "  test-watch     Run tests in watch mode"
	@echo "  docker-up      Start local PostgreSQL container for testing"
	@echo "  docker-down    Stop local PostgreSQL container"
	@echo ""

install:
	npm install

build:
	npm run build

dev:
	npm run dev

start:
	node dist/index.js

typecheck:
	npx tsc --noEmit

clean:
	rm -rf dist/

rebuild: clean build

setup-skills:
	bash scripts/setup-skills.sh

test:
	npm test

test-watch:
	npm run test:watch

docker-up:
	docker compose up -d

docker-down:
	docker compose down
