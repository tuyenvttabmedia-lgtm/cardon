import { redirect } from 'next/navigation';

export default function OrdersRootPage() {
  redirect('/orders/search');
}
