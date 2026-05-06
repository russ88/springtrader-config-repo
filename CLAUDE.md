# SpringTrader Config Repository

## Overview

This is the centralized configuration repository for the **SpringTrader** application suite, consumed by a [Spring Cloud Config Server](https://docs.spring.io/spring-cloud-config/docs/current/reference/html/). Spring Cloud Config Server reads property files from this Git repository and serves them to microservices at startup and at runtime via the `/actuator/refresh` endpoint.

## Repository Role

- **Source of truth** for all externalized application configuration
- Consumed by Spring Cloud Config Server (typically running as its own microservice)
- Microservices pull their configuration on startup using their `spring.application.name` and the active profile(s)
- Supports per-environment overrides through Spring profile conventions

## File Naming Conventions

Spring Cloud Config resolves files in this priority order (highest first):

```
{application}-{profile}.yml        # e.g. account-service-production.yml
{application}.yml                   # e.g. account-service.yml
application-{profile}.yml           # e.g. application-production.yml
application.yml                     # shared defaults for all services
```

Rules:
- Use `application.yml` for settings that apply to **every** service (logging format, management endpoints, tracing config, etc.)
- Use `{service-name}.yml` for settings specific to one service that are profile-agnostic
- Use `{service-name}-{profile}.yml` for profile-specific overrides
- Keep secrets out of this repo — use Spring Cloud Config Vault backend or environment-variable placeholders (`${SOME_SECRET}`) instead

## Expected Directory / File Structure

```
springtrader-config-repo/
├── CLAUDE.md
├── application.yml                        # global defaults (all services, all envs)
├── application-development.yml            # global dev overrides
├── application-staging.yml                # global staging overrides
├── application-production.yml             # global production overrides
│
├── account-service.yml                    # account-service defaults
├── account-service-development.yml
├── account-service-staging.yml
├── account-service-production.yml
│
├── portfolio-service.yml
├── portfolio-service-development.yml
├── portfolio-service-staging.yml
├── portfolio-service-production.yml
│
├── trade-service.yml
├── trade-service-development.yml
├── trade-service-staging.yml
├── trade-service-production.yml
│
├── quote-service.yml
├── quote-service-development.yml
├── quote-service-staging.yml
├── quote-service-production.yml
│
├── gateway-service.yml                    # API gateway / edge service
├── gateway-service-development.yml
├── gateway-service-staging.yml
└── gateway-service-production.yml
```

Add new files as new services are introduced — the naming pattern is the only requirement.

## Profiles

| Profile | Purpose |
|---|---|
| `development` | Local developer machines; verbose logging, H2 or local DB |
| `staging` | Pre-production environment; mirrors production topology |
| `production` | Live environment; secrets via env-var placeholders only |

The default (no profile) file is used as a baseline in every environment.

## YAML Conventions

- Use 2-space indentation, never tabs
- Group related keys under a parent namespace (e.g. `spring.datasource`, `management.endpoints`)
- Prefer YAML anchors (`&anchor` / `*anchor`) to duplicate values across profiles when appropriate
- Document non-obvious values with an inline comment
- Never hard-code passwords, API keys, or tokens — use `${ENV_VAR_NAME}` placeholders

Example structure for a service config:

```yaml
spring:
  datasource:
    url: jdbc:postgresql://${DB_HOST:localhost}:5432/springtrader
    username: ${DB_USER:springtrader}
    password: ${DB_PASSWORD}          # must be set via environment variable

management:
  endpoints:
    web:
      exposure:
        include: health,info,refresh

logging:
  level:
    root: INFO
    com.springtrader: DEBUG
```

## Development Workflow

### Adding Configuration for a New Service

1. Create `{service-name}.yml` with baseline config
2. Create `{service-name}-development.yml`, `{service-name}-staging.yml`, and `{service-name}-production.yml` as needed
3. Commit with a message like: `feat(account-service): add initial externalized config`
4. Push to the appropriate branch; Config Server will pick up the change automatically (or after a `/actuator/refresh` call)

### Changing Existing Config

1. Edit the relevant file(s)
2. Verify YAML syntax locally: `python3 -c "import yaml,sys; yaml.safe_load(open('file.yml'))" file.yml`
3. Commit with a descriptive message
4. Push; trigger a refresh if Config Server polling is not enabled:
   ```bash
   curl -X POST http://<config-server-host>/actuator/refresh
   # or for a specific downstream service:
   curl -X POST http://<service-host>/actuator/refresh
   ```

### Validating YAML Syntax

```bash
# Validate a single file
python3 -c "import yaml, sys; yaml.safe_load(open(sys.argv[1]))" application.yml

# Validate all YAML files at once
for f in *.yml; do
  python3 -c "import yaml, sys; yaml.safe_load(open(sys.argv[1]))" "$f" \
    && echo "OK: $f" || echo "INVALID: $f"
done
```

## Branching Strategy

| Branch | Purpose |
|---|---|
| `main` | Consumed by production Config Server |
| `staging` | Consumed by staging Config Server |
| `development` | Consumed by development Config Server |

The Config Server's `spring.cloud.config.server.git.default-label` property controls which branch it reads. Each environment's Config Server should point at its corresponding branch.

Feature branches should target `development` for review before promoting to `staging` and then `main`.

## Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

Types: feat | fix | chore | refactor | docs
Scope: service name or "global"

Examples:
  feat(trade-service): add circuit breaker timeout config
  fix(production): correct Redis connection pool size
  chore(global): bump default log level to WARN for production
```

## Security Guidelines

- **Never commit secrets.** Use `${ENV_VAR}` placeholders or integrate with a Vault/Secrets Manager backend.
- Rotate the Config Server's Git credentials regularly and store them outside this repo.
- Restrict write access to `main` and `staging` branches via branch protection rules.
- All PRs to `main` must be reviewed before merge.

## Config Server Connection

Microservices connect to the Config Server via `bootstrap.yml` (Spring Boot 2.x) or `application.yml` with the `spring-cloud-starter-bootstrap` dependency (Spring Boot 3.x):

```yaml
spring:
  application:
    name: account-service          # must match the config file prefix
  config:
    import: "configserver:"
  cloud:
    config:
      uri: ${CONFIG_SERVER_URI:http://localhost:8888}
      fail-fast: true
      retry:
        max-attempts: 6
```

## Key Contacts / References

- Spring Cloud Config docs: https://docs.spring.io/spring-cloud-config/docs/current/reference/html/
- Config Server repository: *(add link to the config-server service repo here)*
- Vault/Secrets integration: *(add link to secrets management runbook here)*
