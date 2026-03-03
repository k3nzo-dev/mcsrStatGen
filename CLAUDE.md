# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

`mcsrStatGen` is a statistics generator for MCSR (Minecraft Speedrun) Ranked. It fetches and processes data from the MCSR Ranked API.

## Allowed External APIs

The following domains are pre-approved for `WebFetch`:
- `mcsrranked.com`
- `api.mcsrranked.com`
- `docs.mcsrranked.com`

Consult `https://api.mcsrranked.com` or `https://docs.mcsrranked.com` to explore available endpoints before implementing data-fetching logic.

## Architecture Reference

For a complete overview of the project's architecture, tech stack, database schemas, and design patterns, read `PROJECT_ARCHITECTURE.md`. This is critical for understanding the Canvas UI logic, streaming widgets, and backend structure before making changes.
