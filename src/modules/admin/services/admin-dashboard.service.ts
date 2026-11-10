import { Injectable } from '@nestjs/common';
import { AdminRepository } from '../repositories/admin.repository';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly repository: AdminRepository) {}

  getDashboard(period?: string | null) {
    return this.repository.getDashboardStats(period);
  }
}
