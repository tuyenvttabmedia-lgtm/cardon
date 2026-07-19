# BUILD 6033.9.5 — FINANCE/OPS LABEL CLARITY

**Build label:** `6033.9.5 FINANCE/OPS LABEL CLARITY`

Copy/i18n only — **no route, API, or business logic changes**.

---

## Goal

Disambiguate Finance (accounting reports) vs Operations (SOC/incident response) and vs Provider ops (`/providers`).

## Label changes

### Sidebar
| Before | After |
|--------|-------|
| Nhà cung cấp | **NCC · Trạng thái** |

### Finance (`/finance/*`)
| Before | After |
|--------|-------|
| Subtitle (hardcoded) | **Báo cáo doanh thu, phí cổng và giá vốn theo kỳ — chỉ xem báo cáo, không xử lý sự cố** |
| Tổng quan tài chính | **📊 Báo cáo P&L** |
| Cổng thanh toán | **🏦 Settlement cổng TT** |
| Nhà cung cấp (finance nav) | **🏭 Giá vốn NCC** |
| Tab: Đối soát giao dịch | **Settlement cổng TT** |
| Tab: Hóa đơn cổng | **Hóa đơn cổng TT** |

### Operations (`/operations/*`)
| Before | After |
|--------|-------|
| Subtitle | **Phát hiện lệch dữ liệu và xử lý sự cố — không phải báo cáo kế toán** |
| Đối soát (nav + hub) | **So khớp dữ liệu** |
| Hóa đơn (nav + hub) | **Hóa đơn nền tảng** |
| Hub descriptions | Clarified vs Finance |

### Providers page (`/providers`)
| Before | After |
|--------|-------|
| Giám sát nhà cung cấp | **NCC · Trạng thái** |

## Files touched

- `apps/admin/lib/i18n/vi.ts`
- `apps/admin/components/finance/FinanceShell.tsx`
- `apps/admin/components/finance/FinancePaymentsPanel.tsx`

## Deploy

```powershell
cd C:\Users\MyHome\Projects\cardon
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build admin
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --force-recreate admin nginx
```

Footer: `6033.9.5 FINANCE/OPS LABEL CLARITY`
