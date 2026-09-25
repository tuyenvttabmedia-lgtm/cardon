import { CARD_GAME_PATH, CARD_PHONE_PATH } from '@/lib/checkout-services';

export type HubSeoCopy = {
  path: string;
  title: string;
  intro: string;
  paragraphs: string[];
  bullets: string[];
  breadcrumbLabel?: string | null;
  description: string;
};

export const HOME_SEO: HubSeoCopy = {
  path: '/',
  title: 'Mua thẻ game, thẻ điện thoại & nạp cước online',
  intro:
    'CardOn.vn là nền tảng mua thẻ game, thẻ điện thoại, nạp cước và nạp data 4G/5G trực tuyến tại Việt Nam. Giao mã PIN hoặc cộng cước tự động 24/7 sau khi thanh toán thành công.',
  paragraphs: [
    'Bạn có thể chọn thẻ Garena, Zing, Steam, Viettel, Mobifone, Vinaphone và nhiều nhà mạng / NPH khác, thanh toán bằng QR ngân hàng an toàn. Đơn hàng được xử lý tự động, hỗ trợ tra cứu và chăm sóc khách hàng khi cần.',
  ],
  bullets: [
    'Giao mã / cộng cước tự động 24/7',
    'Thanh toán QR an toàn, không lưu thẻ ngân hàng trên web',
    'Nhiều mệnh giá — giá bán công khai trên từng sản phẩm',
    'Hỗ trợ đổi trả theo chính sách CardOn',
  ],
  breadcrumbLabel: null,
  description:
    'CardOn.vn cung cấp thẻ game, thẻ điện thoại, nạp cước và nạp data 4G/5G trực tuyến nhanh chóng, an toàn, giao tự động 24/7.',
};

export const THE_GAME_SEO: HubSeoCopy = {
  path: CARD_GAME_PATH,
  title: 'Mua thẻ game giá rẻ — Garena, Zing, Steam',
  intro:
    'Mua thẻ Garena, Zing, Võ Lâm, Steam và nhiều nhà phát hành khác trên CardOn. Nhận mã PIN tự động sau thanh toán, dùng ngay trên game hoặc ví NPH.',
  paragraphs: [
    'Chọn đúng loại thẻ và mệnh giá, thanh toán QR, hệ thống giao mã tức thì vào trang đơn hàng / email (nếu có). Phù hợp nạp nhanh, mua số lượng nhỏ hoặc tặng bạn bè.',
  ],
  bullets: [
    'Mã PIN giao tự động 24/7',
    'Đầy đủ mệnh giá phổ biến',
    'Thanh toán QR an toàn tại CardOn.vn',
    'Hỗ trợ khi mã lỗi theo chính sách',
  ],
  breadcrumbLabel: 'Thẻ game',
  description:
    'Mua thẻ game Garena, Zing, Võ Lâm, Steam… giao mã tự động 24/7. Thanh toán QR an toàn tại CardOn.vn.',
};

export const THE_PHONE_SEO: HubSeoCopy = {
  path: CARD_PHONE_PATH,
  title: 'Mua thẻ điện thoại Viettel, Mobifone, Vinaphone',
  intro:
    'Mua thẻ cào Viettel, Mobifone, Vinaphone, Vietnamobile trên CardOn. Nhận mã PIN tức thì, nhiều mệnh giá, thanh toán online an toàn.',
  paragraphs: [
    'Dùng thẻ để nạp tài khoản di động hoặc các dịch vụ chấp nhận thẻ nhà mạng. Đơn hàng xử lý tự động; kiểm tra mã trên trang kết quả đơn ngay sau khi thanh toán.',
  ],
  bullets: [
    'PIN thẻ cào giao tự động',
    'Viettel, Mobifone, Vinaphone, Vietnamobile',
    'Nhiều mệnh giá từ thấp đến cao',
    'Thanh toán QR — hỗ trợ 24/7',
  ],
  breadcrumbLabel: 'Thẻ điện thoại',
  description:
    'Mua thẻ cào điện thoại Viettel, Mobifone, Vinaphone, Vietnamobile giá tốt. Nhận mã PIN tức thì tại CardOn.vn.',
};

export const NAP_CUOC_SEO: HubSeoCopy = {
  path: '/nap-cuoc',
  title: 'Nạp cước điện thoại',
  intro:
    'Nạp tiền điện thoại Viettel, Mobifone, Vinaphone, Vietnamobile trực tuyến trên CardOn. Cộng cước tự động sau thanh toán, không cần thẻ cào vật lý.',
  paragraphs: [
    'Nhập số thuê bao, chọn mệnh giá, thanh toán QR — hệ thống gửi yêu cầu nạp đến nhà cung cấp và cập nhật trạng thái đơn. Phù hợp nạp nhanh cho chính mình hoặc người thân.',
  ],
  bullets: [
    'Nạp tự động 24/7',
    'Hỗ trợ các nhà mạng phổ biến',
    'Chiết khấu / giá bán công khai theo mệnh giá',
    'Thanh toán QR an toàn',
  ],
  breadcrumbLabel: 'Nạp cước',
  description:
    'Nạp cước Viettel, Mobifone, Vinaphone, Vietnamobile tự động 24/7. Chiết khấu tốt, thanh toán an toàn.',
};

export const NAP_DATA_SEO: HubSeoCopy = {
  path: '/nap-data',
  title: 'Nạp data 3G/4G/5G',
  intro:
    'Mua gói data 3G/4G/5G Viettel, Mobifone, Vinaphone trên CardOn. Kích hoạt tự động sau thanh toán, nhiều gói ngày/tháng.',
  paragraphs: [
    'Chọn nhà mạng và gói data phù hợp nhu cầu lướt web, xem phim hoặc công việc. Đơn được xử lý tự động; theo dõi kết quả trên trang đơn hàng.',
  ],
  bullets: [
    'Kích hoạt gói tự động',
    'Gói ngày / tuần / tháng',
    'Thanh toán QR an toàn',
    'Hỗ trợ khi giao dịch lỗi theo chính sách',
  ],
  breadcrumbLabel: 'Nạp data',
  description:
    'Mua gói data Viettel, Mobifone, Vinaphone tự động 24/7. Thanh toán an toàn trên CardOn.',
};

/** Resolve hub/home SEO copy from pathname (checkout chrome / hero). */
export function resolveHubSeoByPath(pathname: string): HubSeoCopy | null {
  if (pathname === '/') return HOME_SEO;
  if (pathname.startsWith(CARD_GAME_PATH)) return THE_GAME_SEO;
  if (pathname.startsWith(CARD_PHONE_PATH)) return THE_PHONE_SEO;
  if (pathname.startsWith('/nap-cuoc')) return NAP_CUOC_SEO;
  if (pathname.startsWith('/nap-data')) return NAP_DATA_SEO;
  return null;
}
