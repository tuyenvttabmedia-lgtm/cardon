# CardOn — Kế hoạch eSIM Airalo + PayPal (localhost-first)

Trạng thái: **nền P1–P3 + P5 stub đã lên localhost** (api/worker rebuild). Chưa sync catalogue Airalo / chưa bật PayPal live. Không deploy VPS.

Tài liệu Airalo: https://developers.partners.airalo.com/

## Quyết định đã chốt

| Hạng mục | Chốt |
|---|---|
| Nhà cung cấp eSIM | **Chỉ Airalo.** Bỏ eSIM Go; xóa mapping cũ khi catalogue Airalo đã sync |
| Google Pay | Không dùng |
| Thẻ game / thẻ ĐT / nạp cước | Không đụng API NCC / MegaPay. SePay đại lý nạp ví giữ nguyên |
| eSIM VN | VND · SePay QR · Airalo |
| eSIM quốc tế | USD · PayPal · Airalo |
| Số dư / rút PayPal | Ngoài website (kế toán) |
| Đa ngôn ngữ | Toàn site (pha sau: i18n + AI draft có duyệt) |

## Ba luồng

- **A** Thẻ/nạp: MegaPay B2C, SePay đại lý — không đổi
- **B** eSIM VN: SePay + Airalo
- **C** eSIM quốc tế: PayPal USD + Airalo (sổ/webhook tách)

Tách khách bằng **market + currency + gateway** (không chỉ IP).

## Pha triển khai

| Pha | Việc | Localhost |
|---|---|---|
| P1 | Airalo adapter, config, wiring `ESIM_PROVIDER_PORT` | Xong (nền) |
| P2 | Ngừng eSIM Go runtime; script deactivate mapping ESIM_GO | Xong (nền + script) |
| P3 | Rule market VN/INTL + cổng SePay/PayPal cho eSIM | Xong (rules + order gate) |
| P4 | i18n toàn site | DONE (P4-C). Form ticket `/account/support` còn tiếng Việt, ngoài checklist đã nghiệm thu |
| P5 | PayPal provider + webhook + hạn mức | P5-A + P5-B + P5-C DONE (admin config, mask, audit). Checkout khách vẫn OFF. Chưa P5-D |
| P6 | Giới hạn thẻ/nạp chỉ VN (tuỳ chọn) | Xong (retail: GAME_CARD/PHONE_CARD/TOPUP/DATA chỉ VN; eSIM không bị luật này) |

## PayPal hạn mức gợi ý (config)

- quantity = 1
- max USD / order: 80 (mở rộng dần)
- max orders / account / day: 3
- max USD / account / day: 150
- tài khoản mới: trần thấp hơn + có thể duyệt tay

## Lưu ý

- Webhook chỉ set `payment_status`; gọi Airalo ở worker.
- Không hoàn tự động sau khi đã phát mã cài.
- Credential Airalo: ENV + settings encrypted (giống pattern eSIM Go cũ).
