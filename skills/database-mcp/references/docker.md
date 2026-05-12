# Docker Reference

## Build the image

```bash
npm run docker:build
# or:
docker build -t database-mcp .
```

## Configure your MCP client

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "database": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-v", "/absolute/path/to/databases.json:/app/databases.json",
        "database-mcp"
      ]
    }
  }
}
```

### Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "database": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-v", "/absolute/path/to/databases.json:/app/databases.json",
        "database-mcp"
      ]
    }
  }
}
```

> **Always use absolute paths** in `-v` mounts. Relative paths are not supported by most MCP clients.

## Volume mounts

| What | Host path | Container path |
|------|-----------|----------------|
| Database config (required) | `/your/path/databases.json` | `/app/databases.json` |
| Migrations (optional, to persist) | `/your/path/migrations/` | `/app/migrations` |
| SQLite file (if applicable) | `/your/path/app.db` | `/data/app.db` |

## Connection strings inside Docker

| Database location | Use in `connectionString` |
|-------------------|--------------------------|
| Cloud / remote host | Normal URL, no changes |
| `localhost` on your machine | Replace with `host.docker.internal` |
| Another Docker container | Service name on the same Docker network |
| SQLite file | Mount it and use the container path (e.g. `/data/app.db`) |

### Example: host machine Postgres

```json
{
  "name": "local_pg",
  "connectionString": "postgresql://user:pass@host.docker.internal:5432/mydb",
  "dbType": "postgres"
}
```

### Example: SQLite with mounted file

`databases.json`:
```json
{
  "name": "app_sqlite",
  "connectionString": "/data/app.db",
  "dbType": "sqlite"
}
```

`docker run` args:
```
"-v", "/your/path/app.db:/data/app.db"
```

## Full example with all mounts

```bash
docker run -i --rm \
  -v /your/path/databases.json:/app/databases.json \
  -v /your/path/migrations:/app/migrations \
  -v /your/path/app.db:/data/app.db \
  database-mcp
```

## Environment variables

Pass with `-e` flag if needed:

| Variable | Default | Description |
|----------|---------|-------------|
| `MIGRATIONS_ENABLED` | `true` | Auto-record DDL changes |
| `MIGRATIONS_DIR` | `/app/migrations` | Where migration files are saved |

```bash
docker run -i --rm \
  -v /your/path/databases.json:/app/databases.json \
  -e MIGRATIONS_ENABLED=false \
  database-mcp
```
