#!/usr/bin/env python3
"""Sync POSTGRES_PASSWORD in .env.production from running postgres container env."""
import pathlib
import re
import subprocess

ENV_PATH = pathlib.Path("/opt/cardon/.env.production")


def main() -> None:
    result = subprocess.run(
        ["docker", "exec", "cardon-prod-postgres", "printenv", "POSTGRES_PASSWORD"],
        check=True,
        capture_output=True,
        text=True,
    )
    pg_pass = result.stdout.strip()
    if not pg_pass:
        raise SystemExit("POSTGRES_PASSWORD empty in postgres container")

    text = ENV_PATH.read_text(encoding="utf-8")
    if re.search(r"^POSTGRES_PASSWORD=", text, re.M):
        text = re.sub(
            r"^POSTGRES_PASSWORD=.*$",
            f"POSTGRES_PASSWORD={pg_pass}",
            text,
            flags=re.M,
        )
    else:
        text += f"\nPOSTGRES_PASSWORD={pg_pass}\n"

    ENV_PATH.write_text(text, encoding="utf-8")
    print("POSTGRES_PASSWORD_SYNCED")


if __name__ == "__main__":
    main()
