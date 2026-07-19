export const API_LOG_RETENTION_DAYS_DEFAULT = 90;

export const API_LOG_GATEWAY = 'partner_api';

export const API_LOG_EXPORT_MAX_IMMEDIATE = 500;

export type ApiLogType =
  | 'REQUEST'
  | 'AUTH_SUCCESS'
  | 'AUTH_401'
  | 'AUTH_403'
  | 'AUTH_429'
  | 'INVALID_KEY'
  | 'INVALID_SIGNATURE'
  | 'BLOCKED_IP'
  | 'EXPIRED_KEY'
  | 'FORBIDDEN'
  | 'ERROR';

export const API_ERROR_CODES = [
  {
    code: 'INVALID_SIGNATURE',
    meaning: 'Chữ ký HMAC không hợp lệ',
    cause: 'Secret key sai hoặc payload ký không khớp method/path/body',
    solution: 'Kiểm tra công thức ký: METHOD:path:requestId:sha256(body)',
  },
  {
    code: 'INVALID_IP',
    meaning: 'IP nguồn không được phép',
    cause: 'IP gọi API không nằm trong IP Whitelist',
    solution: 'Thêm IP server vào IP Whitelist hoặc gọi từ IP đã đăng ký',
  },
  {
    code: 'INSUFFICIENT_BALANCE',
    meaning: 'Số dư ví không đủ',
    cause: 'Available balance thấp hơn giá đơn hàng',
    solution: 'Nạp thêm số dư hoặc giảm số lượng mua',
  },
  {
    code: 'PRODUCT_UNAVAILABLE',
    meaning: 'Sản phẩm không khả dụng',
    cause: 'SKU không tồn tại, inactive hoặc hết hàng provider',
    solution: 'Gọi GET /products để lấy danh sách SKU hợp lệ',
  },
  {
    code: 'PROVIDER_TIMEOUT',
    meaning: 'Provider phản hồi chậm',
    cause: 'Nhà cung cấp thẻ timeout hoặc đang bảo trì',
    solution: 'Tra cứu lại giao dịch bằng cùng request_id — không tạo request_id mới',
  },
  {
    code: 'RATE_LIMIT',
    meaning: 'Vượt giới hạn gọi API',
    cause: 'Quá nhiều request trong một phút',
    solution: 'Chờ reset hoặc liên hệ CardOn nâng rate limit',
  },
  {
    code: 'ORDER_NOT_FOUND',
    meaning: 'Không tìm thấy giao dịch',
    cause: 'request_id chưa từng được sử dụng hoặc thuộc agent khác',
    solution: 'Kiểm tra request_id và agent API key',
  },
  {
    code: 'INVALID_API_KEY',
    meaning: 'API Key không hợp lệ',
    cause: 'Key sai, đã xoay hoặc hết hạn',
    solution: 'Lấy key mới từ Partner Portal → Khóa API',
  },
  {
    code: 'MISSING_REQUEST_ID',
    meaning: 'Thiếu header X-REQUEST-ID',
    cause: 'Request không có idempotency key',
    solution: 'Thêm header X-REQUEST-ID unique cho mỗi request',
  },
  {
    code: 'SERVICE_UNAVAILABLE',
    meaning: 'Dịch vụ tạm thời không khả dụng',
    cause: 'Settlement pending hoặc bảo trì',
    solution: 'Retry với cùng request_id sau vài giây',
  },
] as const;

export const API_SENSITIVE_HEADER_KEYS = [
  'authorization',
  'x-api-key',
  'x-signature',
  'cookie',
  'set-cookie',
] as const;
