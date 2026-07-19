import { Injectable } from '@nestjs/common';
import { AdminRepository } from '../repositories/admin.repository';

export interface AdminSearchScope {
  orders: boolean;
  users: boolean;
  payments: boolean;
  providerTransactions: boolean;
}

@Injectable()
export class AdminSearchService {
  constructor(private readonly repository: AdminRepository) {}

  async search(q: string, permissions: string[]) {
    const has = (code: string) => permissions.includes(code);

    const scope: AdminSearchScope = {
      orders: has('orders.read'),
      users: has('customers.read') || has('users.read'),
      payments: has('payments.view'),
      providerTransactions: has('providers.manage'),
    };

    const [orders, users, payments, providerTransactions] =
      await this.repository.globalSearch(q, scope);

    return {
      query: q,
      orders: scope.orders ? orders : [],
      customers: has('customers.read')
        ? users.filter((u) => u.role === 'CUSTOMER')
        : [],
      staff: has('users.read')
        ? users.filter((u) => u.role !== 'CUSTOMER' && u.role !== 'AGENT')
        : [],
      payments: scope.payments ? payments : [],
      providerTransactions: scope.providerTransactions ? providerTransactions : [],
      finance: has('finance.view') ? [] : [],
    };
  }
}
