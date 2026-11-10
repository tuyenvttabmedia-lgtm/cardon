# Cardon Admin — Operations Dashboard · Phase C2.1

**Ngày:** 2026-11-10  
**Phạm vi:** UI polish theo Visual QA C2 (VQA-1 / VQA-2 / VQA-3)  
**Trạng thái:** Hoàn thành · LOCAL ONLY · **không** commit/deploy · **không** C3

Tham chiếu: `docs/admin/operations-dashboard-phase-c2-visual-qa.md`

---

## 1. Root cause & cách sửa

### VQA-1 — Mobile topbar overflow (Medium)

**Root cause:** `UserMenu` luôn render chip role «Quản trị cao cấp» (`sm` không ẩn). Cùng logo `whitespace-nowrap` + cluster `ml-auto shrink-0` → tại 375px `scrollWidth ≈ 413 > clientWidth`.

**Sửa:**
- Ẩn role chip dưới `sm` (`hidden … sm:inline`); giữ avatar; `aria-label` vẫn có role.
- Header: `min-w-0`, logo `truncate`, gap nhỏ hơn trên mobile.
- **Không** dùng `overflow-x-hidden` để che.

**File:** `apps/admin/components/layout/AdminShell.tsx`

### VQA-2 — Duplicate SUCCESS hint (Low)

**Root cause:** `paymentSuccessHint` vừa truyền vào `StatCard.hint` vừa render thêm `<p>` dưới grid.

**Sửa:** Xóa `<p>` dưới grid; giữ hint trên StatCard «TT thành công».

**File:** `apps/admin/components/dashboard/DashboardBusinessSection.tsx`

### VQA-3 — StatCard mobile navigation (Low)

**Root cause:** `Link` bọc `Card` (`div`) → nested surface; accent bar không `pointer-events-none` → tap mobile không ổn định.

**Sửa:** Một surface duy nhất — `Link` (có `href`) hoặc `div`; style card trên chính element đó; focus-visible ring; accent `pointer-events-none`.

**File:** `apps/admin/components/ui/Display.tsx`

---

## 2. File thay đổi

| File | Thay đổi |
|------|----------|
| `apps/admin/components/layout/AdminShell.tsx` | VQA-1 |
| `apps/admin/components/dashboard/DashboardBusinessSection.tsx` | VQA-2 |
| `apps/admin/components/ui/Display.tsx` | VQA-3 |
| `apps/admin/components/dashboard/dashboard-ui.test.ts` | Assert C2.1 |

---

## 3. Test / build

| Command | Result |
|---------|--------|
| `npm test --workspace=@cardon/admin` | **21 files · 103 tests PASS** (+2 C2.1 asserts) |
| Docker `next build` trong image `cardon-admin:local-full` | **PASS** (rebuild admin local) |

---

## 4. Visual QA sau sửa (LOCAL `admin.localhost`)

| Viewport | overflow-x | Role chip | SUCCESS hint | StatCard navigate |
|----------|------------|-----------|--------------|-------------------|
| Desktop 1440 | ✅ none | ✅ hiện | ✅ 1 lần | ✅ (cùng Link surface) |
| Tablet 768 | ✅ `scrollWidth=clientWidth` | ✅ hiện (`sm+`) | ✅ 1 | — |
| Mobile 375 | ✅ `375===375` | ✅ ẩn (aria-label giữ) | ✅ 1 | ✅ click → `/orders?…&payment=PAID` |

### Screenshots

**Trước (C2 Visual QA):**  
`docs/admin/visual-qa-c2/mobile-375x812.png` (overflow + role chip)  
`docs/admin/visual-qa-c2/desktop-1440x900.png`

**Sau (C2.1):**  
- `docs/admin/visual-qa-c2/c21-after-mobile-375.png`  
- `docs/admin/visual-qa-c2/c21-after-tablet-768.png`  
- `docs/admin/visual-qa-c2/c21-after-desktop-1440.png`

---

## 5. Regression

- Period / Refresh / Health / backlog / Pay-NCC / Agents / Activity: không đổi logic.  
- Desktop/tablet topbar vẫn hiện email + role.  
- Không `overflow-x-hidden` che lỗi.

---

## 6. Issues còn lại

| ID | Ghi chú |
|----|---------|
| Nested `Link`>`Button` ở section actions (Health/eSIM/…) | Ngoài scope VQA-3 (chỉ StatCard); có thể polish sau |
| Health đã scan / 403 / backlog số >0 | Vẫn NOT VERIFIED từ C2 Visual QA — thuộc C3 |

---

## 7. Xác nhận giới hạn

| | |
|--|--|
| LOCAL ONLY | ✅ |
| Chỉ FE 3 issue | ✅ |
| Không BE / Prisma / payment logic | ✅ |
| Không commit / push / PR / deploy / C3 | ✅ |
