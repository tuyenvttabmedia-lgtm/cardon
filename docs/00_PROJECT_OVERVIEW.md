# CardOn.vn — Project Overview

## What Is CardOn.vn?

CardOn.vn is a **Digital Product Distribution Platform**, not a simple card-selling website.

The platform supports:

- B2C digital product sales
- Game card selling
- Mobile card selling
- Mobile topup
- B2B Agent API Gateway
- Multi-provider integration
- Payment gateway integration
- Financial reconciliation

## User Roles

| Role | Description |
|------|-------------|
| `CUSTOMER` | End user purchasing cards/topup on the website |
| `AGENT` | B2B partner using Agent API to resell products |
| `SUPPORT` | Customer support — orders view, fulfillment retry |
| `MARKETING` | CMS, SEO, banners, content |
| `ACCOUNTANT` | Finance and reconciliation |
| `ADMIN` | Platform administration |
| `SUPER_ADMIN` | Full system access |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js, TailwindCSS |
| Backend | NestJS |
| Database | PostgreSQL |
| ORM | Prisma |
| Queue | Redis + BullMQ |
| Deploy | Docker, Ubuntu, Nginx |

## Development Phases

Implement in order — do not skip phases:

1. Database Schema
2. Auth + RBAC
3. Product Engine
4. Payment Gateway
5. Provider Integration
6. Order Fulfillment
7. Admin Panel
8. Agent Platform
9. Finance Ledger
10. Reconciliation
11. Invoice
12. SEO CMS

## Language Convention

- Documentation and owner communication: **Vietnamese**
- Code, database, API endpoints, variables: **English**

## Related Docs

| # | Document | Topic |
|---|----------|-------|
| 00 | [PROJECT_OVERVIEW](./00_PROJECT_OVERVIEW.md) | Overview, roles, stack, phases |
| 01 | [SYSTEM_ARCHITECTURE](./01_SYSTEM_ARCHITECTURE.md) | Layered architecture, abstractions |
| 02 | [DATABASE_SCHEMA](./02_DATABASE_SCHEMA.md) | Entity design reference |
| 03 | [PAYMENT](./03_PAYMENT.md) | MegaPay, SePay, webhooks |
| 04 | [PROVIDER_ESALE](./04_PROVIDER_ESALE.md) | eSale integration |
| 04a | [ESALE_BUYCARD_API](./04_ESALE_BUYCARD_API.md) | eSale V3 Buy Card API |
| 04b | [ESALE_TOPUP_API](./04_ESALE_TOPUP_API.md) | eSale V3 Topup API |
| 05 | [PROVIDER_IMEDIA](./05_PROVIDER_IMEDIA.md) | iMedia integration |
| 06 | [ORDER_FULFILLMENT](./06_ORDER_FULFILLMENT.md) | Fulfillment flow, queue, retry |
| 07 | [AGENT_API](./07_AGENT_API.md) | B2B Agent API gateway |
| 08 | [AGENT_BALANCE_LEDGER](./08_AGENT_BALANCE_LEDGER.md) | Ledger, balance management |
| 09 | [RECONCILIATION](./09_RECONCILIATION.md) | Financial reconciliation |
| 10 | [INVOICE_SYSTEM](./10_INVOICE_SYSTEM.md) | Invoice generation |
| 11 | [ADMIN_PANEL](./11_ADMIN_PANEL.md) | Admin operations, RBAC |
| 12 | [SECURITY_DEPLOY](./12_SECURITY_DEPLOY.md) | Security, Docker, Nginx |
| 13 | [SEO_CMS](./13_SEO_CMS.md) | SEO, content management |
| 14 | [AUTH_RBAC](./14_AUTH_RBAC.md) | Authentication, roles, permissions |
| 15 | [PRODUCT_ENGINE](./15_PRODUCT_ENGINE.md) | Catalog, pricing, provider routing |
| 16 | [B2C_CHECKOUT_FLOW](./16_B2C_CHECKOUT_FLOW.md) | Customer checkout end-to-end |
| 17 | [QUEUE_REGISTRY](./17_QUEUE_REGISTRY.md) | BullMQ queue registry |
| — | [ARCHITECTURE_REVIEW](./ARCHITECTURE_REVIEW.md) | Initial review (superseded) |
| — | [ARCHITECTURE_REVIEW_V2](./ARCHITECTURE_REVIEW_V2.md) | Conflict resolution record |
| — | [FINAL_ARCHITECTURE_CHECK](./FINAL_ARCHITECTURE_CHECK.md) | Final validation — **FULL PASS** |
