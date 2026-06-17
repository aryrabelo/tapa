# Security Policy

## Reporting a vulnerability

If you find a security issue in Tapa, please report it privately rather than
opening a public issue.

- Use GitHub's [private vulnerability reporting](https://github.com/aryrabelo/tapa/security/advisories/new)
  for this repository, or
- Email the maintainer at **aryrabelo@gmail.com** with the details.

Please include:

- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- the version or commit you tested.

You can expect an initial response within a few days. Once a fix is available,
we'll coordinate disclosure with you.

## Scope

Tapa is a desktop application built on Tauri. It reads and writes Markdown files
on your local machine and watches folders for changes. It does not make network
requests of its own and has no telemetry. The most relevant security surface is
local file handling and the Tauri/webview boundary.

## Supported versions

Tapa is pre-1.0 and under active development. Security fixes target the latest
release and `main`. Older versions are not maintained.
