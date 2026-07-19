export interface EsaleApiResponse<T = Record<string, unknown>> {
  retCode: number;
  retType?: string;
  retMsg: string;
  data?: T | null;
}

export interface EsaleCardListItem {
  cardId: number;
  cardCode: string;
  cardName: string;
  supplierCode: string;
  unitPrice: number;
  discount: number;
  priceDiscount: number;
}

export interface EsaleCardListData {
  info: EsaleCardListItem[];
}

export interface EsalePurchasedCard {
  serial: string;
  cardCode: string;
  expiredDate: string;
}

export interface EsaleBuyCardData {
  transId: string;
  eSaleTransId: string;
  cardsList: EsalePurchasedCard[];
  discount?: number;
  totalAmount?: number;
  signature?: string;
}

export interface EsaleCheckTransactionData extends EsaleBuyCardData {
  supplierCode?: string;
  unitPrice?: number;
  quantity?: number;
  transactionDate?: string;
}

export interface EsaleBalanceData {
  agencyCode: string;
  balance: number;
  signature?: string;
}

export interface EsaleTopupData {
  transId: string;
  eSaleTransId?: string;
  discount?: number;
  totalAmount?: number;
  monthYear?: string;
  topupType?: string;
  phoneNumber?: string;
  amount?: number;
  transDate?: string;
  providerCode?: number;
  providerMessage?: string;
}

export interface ParsedEsaleProductCode {
  supplierCode: string;
  cardId: number;
}
