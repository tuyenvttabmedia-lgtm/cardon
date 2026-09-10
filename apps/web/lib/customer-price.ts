import { calculateCustomerPaid } from './payment-fee';

export type CustomerPriceView = {
  faceValue: number;
  sellPrice: number;
  discountAmount: number;
  /** Always 0 for customer — gateway fee is absorbed by CardOn. */
  paymentFee: number;
  /** Estimated gateway settlement fee (admin/accounting; not charged). */
  estimatedGatewayFee: number;
  totalPayment: number;
  /** Customer-facing: transaction fee waived. */
  paymentFeeWaived: true;
};

export function buildCustomerPriceView(params: {
  faceValue: number;
  sellPrice: number;
  percentageFee?: number;
  fixedFee?: number;
}): CustomerPriceView {
  const discountAmount = Math.max(0, params.faceValue - params.sellPrice);
  const { paymentFee: estimatedGatewayFee, totalPayment } = calculateCustomerPaid(
    params.sellPrice,
    params.percentageFee ?? 0,
    params.fixedFee ?? 0,
  );

  return {
    faceValue: params.faceValue,
    sellPrice: params.sellPrice,
    discountAmount,
    paymentFee: 0,
    estimatedGatewayFee,
    totalPayment,
    paymentFeeWaived: true,
  };
}

export function buildCustomerPriceViewFromVariant(
  variant: { faceValue: string; sellPrice: string },
  quantity: number,
  paymentMethod?: { percentageFee: number; fixedFee: number } | null,
): CustomerPriceView {
  const unitFace = parseFloat(variant.faceValue);
  const unitSell = parseFloat(variant.sellPrice);
  return buildCustomerPriceView({
    faceValue: unitFace * quantity,
    sellPrice: unitSell * quantity,
    percentageFee: paymentMethod?.percentageFee,
    fixedFee: paymentMethod?.fixedFee,
  });
}
