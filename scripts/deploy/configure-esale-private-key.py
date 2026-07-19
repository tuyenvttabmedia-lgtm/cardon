#!/usr/bin/env python3
"""Install CardOn eSale RSA private key + sandbox URLs into .env.production on VPS."""
import pathlib
import re
import sys

ENV_PATH = pathlib.Path("/opt/cardon/.env.production")

SANDBOX_DEFAULTS = {
    "ESALE_API_URL_CARD": "https://partner3sb-esale.zing.vn/esale/cardshop/",
    "ESALE_API_URL_TOPUP": "https://partner3sb-esale.zing.vn/esale/mobiletopup/",
    "ESALE_AGENCY_CODE": "9014780450",
    "ESALE_TIMEOUT_MS": "30000",
    "ESALE_VERIFY_RESPONSE_SIGNATURE": "false",
}


def pem_to_env_value(pem: str) -> str:
    normalized = pem.strip().replace("\r\n", "\n")
    return normalized.replace("\n", "\\n")


def set_env_value(text: str, key: str, value: str) -> str:
    line = f'{key}="{value}"'
    if re.search(rf"^{re.escape(key)}=", text, re.M):
        return re.sub(rf"^{re.escape(key)}=.*$", line, text, flags=re.M)
    return text.rstrip() + f"\n{line}\n"


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: configure-esale-private-key.py /path/to/private.pem", file=sys.stderr)
        sys.exit(1)

    pem_path = pathlib.Path(sys.argv[1])
    private_pem = pem_path.read_text(encoding="utf-8")
    if "BEGIN PRIVATE KEY" not in private_pem:
        print("Invalid PKCS8 private key PEM", file=sys.stderr)
        sys.exit(1)

    text = ENV_PATH.read_text(encoding="utf-8")
    text = set_env_value(text, "ESALE_PRIVATE_KEY", pem_to_env_value(private_pem))
    for key, value in SANDBOX_DEFAULTS.items():
        text = set_env_value(text, key, value)

    ENV_PATH.write_text(text, encoding="utf-8")
    print("ESALE_PRIVATE_KEY_CONFIGURED")


if __name__ == "__main__":
    main()
