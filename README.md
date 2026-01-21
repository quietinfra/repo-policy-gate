# Repo Policy Gate

A lightweight GitHub Action that enforces repository and dependency policies on pull requests.

No dashboards. No accounts. Just fast, local checks that fail PRs with clear explanations.

## What this does

Repo Policy Gate can enforce:

- Pull request title conventions
- Required repository files (e.g. LICENSE, SECURITY.md)
- Dependency denylists (supports semver ranges)
- Gradual adoption via warnings vs errors

All checks run locally in CI and report results directly on the pull request.

---

## Installation (60 seconds)

Add the action to a pull request workflow:

```yaml
name: Repo Policy Gate
on:
  pull_request:
    types: [opened, synchronize, reopened, edited]

jobs:
  policy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: nnoribeiro/repo-policy-gate@v1
```

That’s it. The action will look for a ```.repo-policy.yml``` file at the repo root.

## Configuration

Create a `.repo-policy.yml` file:

```yaml
# Fail the check if violations at or above this severity exist.
# Allowed values: "error" (default) or "warn"
fail_on: error

# Optional per-rule severity overrides
severity_overrides:
  required_files: warn
  package_lock_missing: warn
  dependency_denylist: error
  pr_title_regex: error
  package_lock_missing: error

pull_request:
  # JavaScript RegExp (without surrounding / /)
  title_regex: "^(feat|fix|chore|docs):"

repo:
  # Files required at the repository root
  required_files:
    - LICENSE
    - SECURITY.md
    - CODEOWNERS

dependencies:
  # Disallowed dependencies (supports semver ranges)
  deny:
    - "lodash@<4.17.21"
    - "minimist@<1.2.6"
```

**Note:** Semver ranges must be quoted in YAML.

## Supported rules

| Rule                       | Description                                 |
| -------------------------- | ------------------------------------------- |
| `pull_request.title_regex` | Enforce PR title naming                     |
| `repo.required_files`      | Require files at repo root                  |
| `dependencies.deny`        | Block dependencies (exact or semver ranges) |
| `severity_overrides`       | Override severity per rule                  |
| `fail_on`                  | Control when the workflow fails             |


## Behavior

* Violations are reported as a single pull request comment
* The workflow fails only when configured thresholds are met
* Missing or invalid package-lock.json is reported explicitly

## License

MIT
