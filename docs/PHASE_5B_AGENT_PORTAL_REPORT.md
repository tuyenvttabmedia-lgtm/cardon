# Phase 5B — Agent Portal Frontend

> Date: 2026-06-19  
> Scope: Partner portal (`apps/partner/`)  
> Not included: Admin UI

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| `npm run build` (partner) | **PASS** (11 routes) |
| `nest build` (backend portal extensions) | **PASS** |
| Tasks completed | **11/11** |

---

## Module Structure

```
apps/partner/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                 # → /dashboard
│   ├── login/
│   ├── dashboard/
│   ├── kyc/
│   ├── api-keys/
│   ├── docs/
│   ├── balance/
│   └── transactions/
├── components/
│   ├── layout/                  # Sidebar, PortalShell, AuthGuard
│   ├── ui/                      # Button, Input, Badge, Card
│   └── transactions/            # CardRevealPanel
├── services/
│   └── api-client.ts
├── hooks/
│   └── useAuth.ts               # useAuth + useAgentProfile
├── lib/
│   ├── utils.ts
│   └── auth-storage.ts
└── types/
    └── api.ts
```

Tech: **Next.js 15**, **TypeScript**, **Tailwind CSS 3**  
Dev port: **3002**

---

## Deliverables

### TASK 1: Agent Portal structure — **DONE**

Workspace `@cardon/partner` trong monorepo. Script root: `npm run build:partner`.

### TASK 2: Authentication — **DONE**

- Login qua `POST /auth/login` (API chung với customer)
- JWT + refresh token trong `localStorage` (keys riêng `cardon_partner_*`)
- Auto refresh 401 → `POST /auth/refresh`
- Logout → `POST /auth/logout` + `clearAuthSession()`
- `AuthGuard` bảo vệ mọi trang portal (trừ `/login`)

### TASK 3: Agent dashboard — **DONE**

Route: `/dashboard`

Hiển thị từ `GET /agents/me`:

- Trạng thái agent (`PENDING_KYC` / `ACTIVE` / …)
- Trạng thái KYC
- Số dư khả dụng / đang giữ
- Trạng thái API (`apiEnabled`)
- 5 giao dịch gần nhất (`GET /agents/me/transactions`)

Form đăng ký agent nếu chưa có hồ sơ (`POST /agents/register`).

### TASK 4: KYC pages — **DONE**

Route: `/kyc`

- Nộp: companyName, taxCode, representativeName, document URLs
- Trạng thái: PENDING / SUBMITTED (đang duyệt) / APPROVED / REJECTED
- `POST /agents/kyc`

### TASK 5: API credential page — **DONE**

Route: `/api-keys`

- API Key masked (`ak_••••…`) từ `GET /agents/me/credentials`
- Ngày cấp, trạng thái, last used
- **Không** hiển thị `secret_key`
- Cảnh báo: secret chỉ hiện một lần khi admin duyệt KYC
- `sessionStorage` tùy chọn cho credentials one-time (xóa khi đóng phiên)

### TASK 6: API documentation — **DONE**

Route: `/docs`

- Xác thực HMAC (headers, payload ký)
- Endpoints: buy card, balance, transaction query
- Ví dụ **cURL** và **Node.js**
- Cảnh báo: không gọi Partner API từ browser

### TASK 7: Balance & Ledger — **DONE**

Route: `/balance`

- Available / Held / Total từ profile
- Lịch sử sổ cái: CREDIT, HOLD, DEBIT, RELEASE qua `GET /agents/me/ledger`

### TASK 8: Transactions — **DONE**

Route: `/transactions`

- Bảng: request_id, product, amount, status, created_at
- Chi tiết + thẻ (PIN ẩn/hiện) khi `status === SUCCESS`
- Tra cứu theo request_id

### TASK 9: Security — **DONE**

| Rủi ro | Biện pháp |
|--------|-----------|
| Secret key lưu lâu dài | Không persist secret; chỉ sessionStorage tạm |
| PIN leak | Chỉ load khi SUCCESS; toggle ẩn/hiện |
| Dữ liệu agent khác | API scoped JWT user → own agent only |
| Partner API từ browser | Docs cảnh báo; không embed secret trong frontend |
| Console secrets | Không có `console.log` trong source app |

### TASK 10: Responsive UI — **DONE**

- Desktop: sidebar cố định
- Tablet/Mobile: nav scroll ngang + layout stack
- Bảng `overflow-x-auto`

### TASK 11: Build — **DONE**

```bash
cd apps/partner && npm run build
# 11 routes, exit 0
```

---

## Backend portal extensions (read-only)

Để portal hiển thị ledger/transactions/credentials mà **không đổi business logic** (ledger math, KYC flow, buy API):

| Endpoint | Mô tả |
|----------|--------|
| `GET /agents/me/ledger` | Sổ cái agent hiện tại |
| `GET /agents/me/transactions` | Danh sách đơn AGENT channel |
| `GET /agents/me/transactions/:requestId` | Chi tiết + cards nếu SUCCESS |
| `GET /agents/me/credentials` | Trạng thái API key (masked) |

---

## Configuration

| Env | Purpose |
|-----|---------|
| `NEXT_PUBLIC_API_URL` | Portal JWT API (`http://localhost:3000/api/v1`) |
| `NEXT_PUBLIC_PARTNER_API_URL` | Partner API base (docs examples) |
| `NEXT_PUBLIC_SITE_URL` | Portal URL (`http://localhost:3002`) |

---

## Flow đối tác

```
Đăng ký user → Login → Register agent → Submit KYC
    → Admin duyệt (nhận API key 1 lần) → Gọi Partner API
    → Xem số dư / giao dịch trên portal
```

---

## Out of Scope

- Admin UI
- Regenerate API key self-service
- Gọi Partner API trực tiếp từ browser

---

## Previous Phases

| Phase | Status |
|-------|--------|
| Backend Agent API | PASS |
| Customer Website | PASS |
| Customer Audit 5A.1 | PASS |
