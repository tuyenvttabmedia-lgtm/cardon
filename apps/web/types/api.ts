export type ProductVariantType = 'CARD' | 'TOPUP' | 'DATA' | 'SOFTWARE';

export type OrderPaymentStatus =
  | 'WAITING_PAYMENT'
  | 'PAID'
  | 'FAILED'
  | 'EXPIRED'
  | 'REFUNDED';

export type FulfillmentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'WAITING_ADMIN_RETRY';

export type PaymentGatewayCode = 'MEGAPAY' | 'SEPAY';

export type PaymentRecordStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    limit?: number;
    current?: number;
    [key: string]: unknown;
  };
}

export type HomeServiceType = 'GAME_CARD' | 'PHONE_CARD' | 'TOPUP' | 'DATA';

export interface Category {
  id: string;
  slug: string;
  name: string;
  iconUrl?: string | null;
  parentId: string | null;
  sortOrder: number;
  status: string;
  homeService?: HomeServiceType | null;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  name: string;
  type: ProductVariantType;
  faceValue: string;
  sellPrice: string;
  status: string;
  metadata?: Record<string, unknown>;
}

export interface Product {
  id: string;
  categoryId: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  sortOrder?: number;
  status: string;
  createdAt?: string;
  category?: {
    id: string;
    slug: string;
    name: string;
    homeService?: HomeServiceType | null;
  };
  homeService?: HomeServiceType | null;
  variants?: ProductVariant[];
}

export interface OrderItem {
  id: string;
  variantId: string;
  quantity: number;
  unitPrice: string;
  discount: string;
  totalAmount: string;
  status: string;
  variant?: {
    sku: string;
    name: string;
  };
}

export interface Order {
  id: string;
  orderCode: string;
  channel: string;
  isGuestOrder: boolean;
  guestEmail: string | null;
  guestPhone: string | null;
  invoiceRequired: boolean;
  customerNote: string | null;
  totalAmount: string;
  faceValue: string;
  sellAmount: string;
  discountAmount: string;
  paymentMethodCode: string | null;
  paymentGateway: string | null;
  paymentFeePercent: string;
  paymentFeeFixed: string;
  paymentFeeAmount: string;
  customerPaid: string;
  providerCost: string;
  profit: string;
  paymentStatus: OrderPaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  customerStatus?: string;
  customerStatusLabel?: string;
  paymentExpiresAt: string | null;
  createdAt: string;
  items: OrderItem[];
}

export interface Payment {
  id: string;
  orderId: string;
  gateway: PaymentGatewayCode;
  paymentReference: string;
  amount: string;
  status: PaymentRecordStatus;
  paymentUrl?: string;
  checkoutUrl?: string;
  checkoutFormFields?: Record<string, string>;
  displayMode?: 'qr_inline' | 'redirect';
  bankInfo?: {
    bankCode?: string | null;
    bankName?: string | null;
    accountNumber?: string | null;
    accountName?: string | null;
  } | null;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface DeliveredCard {
  id?: string;
  serial: string;
  pin?: string;
  pinMasked?: string;
  pinViewCount?: number;
  pinFirstViewedAt?: string | null;
}

export interface CardSummary {
  id: string;
  productName: string;
  serial: string;
  serialMasked: boolean;
  pinMasked: string;
  pinRevealed: boolean;
  pinViewCount: number;
  pinFirstViewedAt: string | null;
}

export interface OrderTimelineStep {
  key: string;
  label: string;
  state: 'completed' | 'active' | 'pending';
  at: string | null;
}

export interface OrderDeliveryResponse {
  order: Order;
  timeline: OrderTimelineStep[];
  delivery: {
    cards: CardSummary[];
    hasCards: boolean;
  };
}

export interface RevealPinResponse {
  cardId: string;
  pin: string;
  pinViewCount: number;
  pinFirstViewedAt: string;
}

export interface OrderCardsResponse {
  orderCode: string;
  cards: DeliveredCard[];
}

export interface AuthUser {
  id: string;
  username?: string | null;
  fullName?: string | null;
  email: string;
  role: string;
  emailVerified: boolean;
}

export interface RegisterPayload {
  username: string;
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  identityNumber?: string;
  acceptTerms: boolean;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface CreateOrderPayload {
  items: Array<{ variantId: string; quantity: number }>;
  guestEmail?: string;
  guestPhone?: string;
  customerNote?: string;
  paymentMethodCode?: string;
  clientDeviceInfo?: Record<string, unknown>;
}

export interface CreatePaymentPayload {
  orderId: string;
  gateway: PaymentGatewayCode;
}

export interface AccountProfile {
  id: string;
  username: string | null;
  fullName: string | null;
  email: string;
  phone: string | null;
  role: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface AccountOrderItem {
  productName: string;
  variantName: string;
  variantType: string;
  faceValue: string | null;
  quantity: number;
}

export interface AccountOrder {
  id: string;
  orderCode: string;
  totalAmount: unknown;
  paymentStatus: string;
  fulfillmentStatus: string;
  customerStatus?: string;
  createdAt: string;
  items?: AccountOrderItem[];
}

export interface AccountCard {
  orderId: string;
  orderCode: string;
  productName: string;
  cardId: string;
  serial: string;
  pinViewCount: number;
  faceValue?: string;
}

export interface AccountTopup {
  phone: string;
  network: string;
  amount: string;
  status: string;
  orderCode?: string;
  createdAt?: string;
}

export interface AccountDataOrder {
  orderCode: string;
  productName: string;
  amount: string;
  status: string;
  createdAt?: string;
}

export interface PaginatedList<T> {
  items: T[];
  total: number;
  skip: number;
  take: number;
}

export type SupportTicketStatus = 'OPEN' | 'PROCESSING' | 'RESOLVED';
export type SupportTicketPriority = 'LOW' | 'NORMAL' | 'HIGH';

export interface SupportTicketMessage {
  id: string;
  authorType: 'CUSTOMER' | 'STAFF';
  body: string;
  attachmentUrl?: string | null;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  ticketCode: string;
  subject: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  createdAt: string;
  order?: {
    id?: string;
    orderCode: string;
    paymentStatus?: string;
    fulfillmentStatus?: string;
  } | null;
  messages?: SupportTicketMessage[];
}

export interface UserNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface CmsFaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
}
