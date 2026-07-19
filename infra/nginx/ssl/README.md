# SSL / TLS — Cloudflare Origin Certificate

Place certificate files here before enabling HTTPS server blocks in `conf.d/`.

## Recommended setup: Cloudflare Full (Strict)

1. **Cloudflare Dashboard** → SSL/TLS → Overview → set mode to **Full (strict)**.
2. **SSL/TLS → Origin Server** → Create Certificate:
   - Hostnames: `cardon.vn`, `*.cardon.vn`
   - Validity: 15 years (Cloudflare origin cert)
   - Key type: RSA 2048
3. Save files on the server (this directory):

| File | Content |
|------|---------|
| `cardon.vn.pem` | Origin certificate (PEM) — covers apex + wildcard |
| `cardon.vn.key` | Private key (PEM) |

Use the same cert for all subdomains when using a wildcard origin cert:
- `partner.cardon.vn` → symlink or copy to `partner.cardon.vn.pem` / `.key`
- `admin.cardon.vn` → symlink or copy to `admin.cardon.vn.pem` / `.key`

4. Uncomment HTTPS `server { }` blocks in:
   - `conf.d/cardon.vn.conf`
   - `conf.d/partner.cardon.vn.conf`
   - `conf.d/admin.cardon.vn.conf`

5. Enable HTTP → HTTPS redirect in `cardon.vn.conf`.

6. Reload nginx:
   ```bash
   docker compose -f docker-compose.production.yml exec nginx nginx -t
   docker compose -f docker-compose.production.yml exec nginx nginx -s reload
   ```

## Auto renewal

Cloudflare **origin certificates** are long-lived (up to 15 years) and are renewed manually in the Cloudflare dashboard — they do not use Let's Encrypt ACME.

Options:

| Approach | Renewal |
|----------|---------|
| Cloudflare Origin Cert (recommended) | Manual re-issue before expiry; set calendar reminder |
| Let's Encrypt on origin (certbot) | Auto via cron + certbot; Cloudflare SSL mode = Full (strict) |
| Cloudflare Tunnel | Cloudflare terminates TLS; origin can use HTTP only |

For automated renewal with Let's Encrypt instead of origin cert:

```bash
# Example (run on host, not in container)
certbot certonly --webroot -w /var/www/certbot \
  -d cardon.vn -d www.cardon.vn \
  -d partner.cardon.vn -d admin.cardon.vn
```

Mount `/etc/letsencrypt/live/` into `infra/nginx/ssl/` and point `ssl_certificate` paths accordingly.

## Security notes

- Never commit `.pem` / `.key` files to git.
- Restrict file permissions: `chmod 600 *.key`
- Use Cloudflare **Authenticated Origin Pulls** (optional) for extra origin protection.
