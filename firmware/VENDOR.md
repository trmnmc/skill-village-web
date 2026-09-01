# Vendored firmware provenance

Source: https://github.com/migratorywhale/stackchan-mcp (MIT)
Commit: e8258a85b408057e9c914b8bcca9b70f59361445 (upstream 2026-08-30)
Audit: ../docs/robot/AUDIT.md — verdict SAFE-AFTER-STRIPPING; the strip and
hardening are Tasks 4–5 of docs/superpowers/plans/2026-08-31-robot-v1-he-speaks.md.
Only the upstream `firmware/` subtree is vendored; the Python MCP server,
faces, deploy and ops trees were deliberately not copied.
Upstream is REFERENCE ONLY after this commit — never pull without re-audit.
