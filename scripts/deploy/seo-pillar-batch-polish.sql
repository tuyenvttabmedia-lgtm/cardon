-- Batch polish for GSC "crawled – currently not indexed" pillars.
-- Safe to re-run: title/meta upserts are idempotent; CTA append is guarded by marker.

BEGIN;

-- 1) Titles + excerpt (sentence case / strip outline leftovers)
UPDATE cms_pages SET title = 'Mua thẻ Garena online và cách nhận mã', updated_at = NOW()
WHERE slug = 'mua-the-garena-online-nhanh-tien-va-an-toan' AND title LIKE '1.%';

UPDATE cms_pages SET title = 'Chọn mệnh giá thẻ game bao nhiêu là vừa đủ?', updated_at = NOW()
WHERE slug = 'chon-menh-gia-the-game-bao-nhieu-la-vua-du';

UPDATE cms_pages SET title = 'Nạp game bằng mã thẻ hay nạp trực tiếp?', updated_at = NOW()
WHERE slug = 'nap-game-bang-ma-the-hay-nap-truc-tiep';

UPDATE cms_pages SET title = 'Mã thẻ và số serial khác nhau thế nào?', updated_at = NOW()
WHERE slug = 'ma-the-va-so-serial-khac-nhau-the-nao';

UPDATE cms_pages SET title = 'Cách kiểm tra số điện thoại thuộc nhà mạng nào', updated_at = NOW()
WHERE slug = 'cach-kiem-tra-so-dien-thoai-thuoc-nha-mang-nao';

UPDATE cms_pages SET title = 'Mua thẻ Viettel không cần ra cửa hàng', updated_at = NOW()
WHERE slug = 'mua-the-viettel-khong-can-ra-cua-hang';

UPDATE cms_pages SET title = 'Mua thẻ Mobifone chiết khấu cao mọi mệnh giá', updated_at = NOW()
WHERE slug = 'mua-the-mobifone-chiet-khau-cao-moi-menh-gia';

UPDATE cms_pages SET title = 'Mua thẻ Vcoin chính hãng cho game VTC', updated_at = NOW()
WHERE slug = 'mua-the-vcoin-chinh-hang-cho-game-vtc';

UPDATE cms_pages SET title = 'Nạp tiền cho thuê bao Vinaphone trong vài phút', updated_at = NOW()
WHERE slug = 'nap-tien-cho-thue-bao-vinaphone-trong-vai-phut';

UPDATE cms_pages SET title = 'Nạp tiền Viettel mọi lúc mọi nơi', updated_at = NOW()
WHERE slug = 'nap-tien-viettel-moi-luc-moi-noi-cardonvn';

-- 2) Unique meta (match title polish; keep within 256)
UPDATE cms_seo s
SET meta_title = p.title,
    meta_description = CASE p.slug
      WHEN 'mua-the-garena-online-nhanh-tien-va-an-toan' THEN
        'Hướng dẫn mua thẻ Garena online trên CardOn: chọn mệnh giá, thanh toán QR, nhận mã PIN và nạp vào tài khoản an toàn.'
      WHEN 'mua-the-zing-online-nhanh-tien-va-de-kiem-tra' THEN
        'Mua thẻ Zing trên CardOn: nhiều mệnh giá, giao mã nhanh, kiểm tra đơn và nạp game trong vài phút.'
      WHEN 'nap-game-bang-ma-the-hay-nap-truc-tiep' THEN
        'So sánh nạp game bằng mã thẻ và nạp trực tiếp: ưu nhược điểm, khi nào nên mua thẻ trên CardOn.'
      WHEN 'chon-menh-gia-the-game-bao-nhieu-la-vua-du' THEN
        'Cách chọn mệnh giá thẻ game phù hợp nhu cầu nạp, tránh mua thừa hoặc thiếu khi mua trên CardOn.'
      WHEN 'cach-tranh-lua-dao-khi-mua-the-game-online' THEN
        'Dấu hiệu website bán thẻ game không uy tín và cách mua an toàn trên CardOn.vn.'
      WHEN 'mua-the-viettel-khong-can-ra-cua-hang' THEN
        'Mua thẻ cào Viettel online trên CardOn: nhận mã PIN tức thì, không cần ra cửa hàng, thanh toán QR.'
      WHEN 'cach-kiem-tra-so-dien-thoai-thuoc-nha-mang-nao' THEN
        'Cách nhận biết số Viettel, Mobifone, Vinaphone… trước khi mua thẻ hoặc nạp cước trên CardOn.'
      WHEN 'nap-tien-dien-thoai-online-co-an-toan-khong' THEN
        'Nạp tiền điện thoại online có an toàn không? Tiêu chí website uy tín và quy trình nạp trên CardOn.'
      WHEN 'nap-tien-cho-thue-bao-vinaphone-trong-vai-phut' THEN
        'Nạp tiền Vinaphone nhanh trên CardOn: chọn mệnh giá, thanh toán, cộng cước tự động 24/7.'
      WHEN 'ma-the-va-so-serial-khac-nhau-the-nao' THEN
        'Phân biệt mã thẻ (PIN) và số serial khi mua thẻ game / thẻ điện thoại trên CardOn.'
      WHEN 'nap-tien-viettel-moi-luc-moi-noi-cardonvn' THEN
        'Nạp tiền Viettel mọi lúc trên CardOn: thanh toán QR, cộng cước tự động, theo dõi trạng thái đơn.'
      WHEN 'mua-the-mobifone-chiet-khau-cao-moi-menh-gia' THEN
        'Mua thẻ Mobifone online nhiều mệnh giá trên CardOn, giao mã điện tử nhanh sau thanh toán.'
      WHEN 'mua-the-vcoin-chinh-hang-cho-game-vtc' THEN
        'Mua thẻ Vcoin chính hãng cho game VTC trên CardOn: chọn mệnh giá, nhận mã và nạp an toàn.'
      ELSE s.meta_description
    END,
    og_title = p.title,
    og_description = CASE p.slug
      WHEN 'mua-the-garena-online-nhanh-tien-va-an-toan' THEN
        'Hướng dẫn mua thẻ Garena online trên CardOn: chọn mệnh giá, thanh toán QR, nhận mã PIN và nạp vào tài khoản an toàn.'
      WHEN 'mua-the-zing-online-nhanh-tien-va-de-kiem-tra' THEN
        'Mua thẻ Zing trên CardOn: nhiều mệnh giá, giao mã nhanh, kiểm tra đơn và nạp game trong vài phút.'
      WHEN 'nap-game-bang-ma-the-hay-nap-truc-tiep' THEN
        'So sánh nạp game bằng mã thẻ và nạp trực tiếp: ưu nhược điểm, khi nào nên mua thẻ trên CardOn.'
      WHEN 'chon-menh-gia-the-game-bao-nhieu-la-vua-du' THEN
        'Cách chọn mệnh giá thẻ game phù hợp nhu cầu nạp, tránh mua thừa hoặc thiếu khi mua trên CardOn.'
      WHEN 'cach-tranh-lua-dao-khi-mua-the-game-online' THEN
        'Dấu hiệu website bán thẻ game không uy tín và cách mua an toàn trên CardOn.vn.'
      WHEN 'mua-the-viettel-khong-can-ra-cua-hang' THEN
        'Mua thẻ cào Viettel online trên CardOn: nhận mã PIN tức thì, không cần ra cửa hàng, thanh toán QR.'
      WHEN 'cach-kiem-tra-so-dien-thoai-thuoc-nha-mang-nao' THEN
        'Cách nhận biết số Viettel, Mobifone, Vinaphone… trước khi mua thẻ hoặc nạp cước trên CardOn.'
      WHEN 'nap-tien-dien-thoai-online-co-an-toan-khong' THEN
        'Nạp tiền điện thoại online có an toàn không? Tiêu chí website uy tín và quy trình nạp trên CardOn.'
      WHEN 'nap-tien-cho-thue-bao-vinaphone-trong-vai-phut' THEN
        'Nạp tiền Vinaphone nhanh trên CardOn: chọn mệnh giá, thanh toán, cộng cước tự động 24/7.'
      WHEN 'ma-the-va-so-serial-khac-nhau-the-nao' THEN
        'Phân biệt mã thẻ (PIN) và số serial khi mua thẻ game / thẻ điện thoại trên CardOn.'
      WHEN 'nap-tien-viettel-moi-luc-moi-noi-cardonvn' THEN
        'Nạp tiền Viettel mọi lúc trên CardOn: thanh toán QR, cộng cước tự động, theo dõi trạng thái đơn.'
      WHEN 'mua-the-mobifone-chiet-khau-cao-moi-menh-gia' THEN
        'Mua thẻ Mobifone online nhiều mệnh giá trên CardOn, giao mã điện tử nhanh sau thanh toán.'
      WHEN 'mua-the-vcoin-chinh-hang-cho-game-vtc' THEN
        'Mua thẻ Vcoin chính hãng cho game VTC trên CardOn: chọn mệnh giá, nhận mã và nạp an toàn.'
      ELSE s.og_description
    END
FROM cms_pages p
WHERE s.page_id = p.id
  AND p.slug IN (
    'mua-the-garena-online-nhanh-tien-va-an-toan',
    'mua-the-zing-online-nhanh-tien-va-de-kiem-tra',
    'nap-game-bang-ma-the-hay-nap-truc-tiep',
    'chon-menh-gia-the-game-bao-nhieu-la-vua-du',
    'cach-tranh-lua-dao-khi-mua-the-game-online',
    'mua-the-viettel-khong-can-ra-cua-hang',
    'cach-kiem-tra-so-dien-thoai-thuoc-nha-mang-nao',
    'nap-tien-dien-thoai-online-co-an-toan-khong',
    'nap-tien-cho-thue-bao-vinaphone-trong-vai-phut',
    'ma-the-va-so-serial-khac-nhau-the-nao',
    'nap-tien-viettel-moi-luc-moi-noi-cardonvn',
    'mua-the-mobifone-chiet-khau-cao-moi-menh-gia',
    'mua-the-vcoin-chinh-hang-cho-game-vtc'
  );

-- 3) Append crawlable internal-link CTA once (UI also adds ArticleHubCta; this helps in body HTML)
UPDATE cms_pages
SET content = content || $cta$
<section class="cms-seo-cta" data-cardon-seo-cta="1">
<p><strong>Mua / nạp trên CardOn:</strong>
<a href="/the-game">Thẻ game</a> ·
<a href="/the-dien-thoai">Thẻ điện thoại</a> ·
<a href="/nap-cuoc">Nạp cước</a> ·
<a href="/tin-tuc">Tin tức &amp; hướng dẫn</a></p>
</section>
$cta$,
    updated_at = NOW()
WHERE type = 'BLOG_POST'
  AND status = 'PUBLISHED'
  AND slug IN (
    'mua-the-garena-online-nhanh-tien-va-an-toan',
    'mua-the-zing-online-nhanh-tien-va-de-kiem-tra',
    'nap-game-bang-ma-the-hay-nap-truc-tiep',
    'chon-menh-gia-the-game-bao-nhieu-la-vua-du',
    'cach-tranh-lua-dao-khi-mua-the-game-online',
    'mua-the-viettel-khong-can-ra-cua-hang',
    'cach-kiem-tra-so-dien-thoai-thuoc-nha-mang-nao',
    'nap-tien-dien-thoai-online-co-an-toan-khong',
    'nap-tien-cho-thue-bao-vinaphone-trong-vai-phut',
    'ma-the-va-so-serial-khac-nhau-the-nao',
    'nap-tien-viettel-moi-luc-moi-noi-cardonvn',
    'mua-the-mobifone-chiet-khau-cao-moi-menh-gia',
    'mua-the-vcoin-chinh-hang-cho-game-vtc'
  )
  AND content NOT LIKE '%data-cardon-seo-cta%';

COMMIT;
