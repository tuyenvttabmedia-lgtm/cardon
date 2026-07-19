import { Injectable } from '@nestjs/common';
import { AdminRepository } from '../repositories/admin.repository';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly repository: AdminRepository) {}

  getDashboard() {
    return this.repository.getDashboardStats();
  }
}
