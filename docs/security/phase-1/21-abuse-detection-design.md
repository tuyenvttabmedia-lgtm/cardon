# 21 — Abuse detection design

**Depends on:** hardening controls `16–20`.  
**v1 rule:** **No auto-suspend.** Detect → watchlist → alert → human review.

---

## Root cause

Even with deny-list/CAPTCHA, adaptive attackers shift domains/IPs. Need visibility and triage, not silent autopilot bans that can lock real customers.

---

## Proposed solution

### A. Signals (inputs)

| Signal | Weight (draft) | Source |
|--------|----------------|--------|
| Email domain on deny-list / disposable | +50 | Register / profile |
| ≥N accounts same IP / 24h | +30 | Auth + audit |
| Account age &lt; 1h + ticket created | +20 | Support |
| Account age &lt; 24h + KYC submit | +20 | Agent |
| ≥M unpaid/cancelled orders / 24h | +15 | Orders |
| Zero successful payments ever + high API volume | +15 | Orders/payments |
| UA empty / known script UA | +10 | Request meta |

Score ≥ threshold (e.g. 60) → **watchlist**, not ban.

### B. Watchlist

- Table or admin flag `users.abuseWatchlistedAt` / `abuseScore` (design only — migration later)  
- Admin Customer Center filter: Watchlist  
- Attach reason codes array for audit  

### C. Alerting

- Slack/Telegram/email when:
  - Watchlist additions / hour &gt; threshold  
  - Register rate spike  
  - Ticket create spike  
- Reuse notification center patterns where possible — **do not** spam per single ticket  

### D. Admin review workflow

1. List watchlist users  
2. View linked tickets / KYC / orders / IPs  
3. Actions (manual only in v1): suspend, ban, close tickets, reject KYC, clear watchlist  
4. All actions → security audit log  

### E. Explicit non-goals (v1)

- Auto-suspend / auto-ban  
- Auto-refund  
- Changing payment or fulfillment state machines  

---

## Business impact

- Faster incident response; fewer surprise bans  
- Supports forensics for probing campaigns  

## Performance impact

- Async score update on events (queue job) preferred over sync on every request  
- Use existing Redis/Bull carefully — dedicated lightweight job name e.g. `abuse-score` with low concurrency  

## False-positive risk

- Shared IP (school/office): human review required — hence no auto-suspend  
- Tune weights after 2 weeks of labeled data  

## Rollback

- Disable score job / alerts via flag; leave columns inert  

## Regression tests

- Synthetic signal combination → watchlist row  
- Score job failure does not fail register/order  
- Suspend path still only via existing admin APIs  

## Dependencies

- Audit/activity modules; admin UI slot in Customer Center (implementation later)  
- Prefer after email policy + rate limit so noise drops before scoring  

## Effort

- **M–L** (3–5 days) including minimal admin filter + alerts.
