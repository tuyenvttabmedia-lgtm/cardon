import OrderDeliveryClient from './OrderDeliveryClient';

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderDeliveryClient orderId={id} />;
}
