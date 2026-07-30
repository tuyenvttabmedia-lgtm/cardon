import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HomeServiceType } from '@prisma/client';
import { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto';
import { filterPublicCatalogByHomeService } from '../entities/catalog-availability';
import { HOME_SERVICE_ROOT_NAMES, HOME_SERVICE_ROOT_SLUGS } from '../entities/home-service';
import { mapCategories, mapCategory } from '../entities/product.mapper';
import { CategoryRepository } from '../repositories/category.repository';
import { ProductRepository } from '../repositories/product.repository';
import { SettingsStoreService } from '../../settings/services/settings-store.service';
import { ProductUsageService } from './product-usage.service';

@Injectable()
export class CategoryService {
  constructor(
    private readonly categoryRepository: CategoryRepository,
    private readonly productRepository: ProductRepository,
    private readonly usage: ProductUsageService,
    private readonly settingsStore: SettingsStoreService,
  ) {}

  async ensureRootCategories() {
    const dataEnabled = this.settingsStore.resolveSystemConfig().customerDataEnabled;
    for (const service of Object.values(HomeServiceType)) {
      // DATA has no eSale API yet — do not recreate root when feature is off.
      if (service === HomeServiceType.DATA && !dataEnabled) {
        continue;
      }
      const slug = HOME_SERVICE_ROOT_SLUGS[service];
      const existing = await this.categoryRepository.findBySlug(slug);
      if (!existing) {
        await this.categoryRepository.create({
          slug,
          name: HOME_SERVICE_ROOT_NAMES[service],
          homeService: service,
          sortOrder: Object.values(HomeServiceType).indexOf(service),
        });
      } else if (existing.homeService !== service) {
        await this.categoryRepository.update(existing.id, { homeService: service });
      }
    }
  }

  async createCategory(dto: CreateCategoryDto) {
    const existing = await this.categoryRepository.findBySlug(dto.slug);
    if (existing) {
      throw new ConflictException(`Slug "${dto.slug}" đã tồn tại`);
    }

    const rootSlug = HOME_SERVICE_ROOT_SLUGS[dto.homeService];
    if (dto.slug === rootSlug) {
      throw new ConflictException(
        `Slug "${rootSlug}" dành riêng cho root ${dto.homeService}`,
      );
    }

    if (!dto.parentId) {
      const existingRoot = await this.categoryRepository.findRootByHomeService(dto.homeService);
      if (existingRoot) {
        throw new ConflictException(
          `Root category cho ${dto.homeService} đã tồn tại: "${existingRoot.name}" (${existingRoot.slug})`,
        );
      }
    }

    const duplicateName = await this.categoryRepository.findByNameAndParent(
      dto.name,
      dto.parentId ?? null,
    );
    if (duplicateName) {
      throw new ConflictException(
        `Tên "${dto.name}" đã tồn tại trong cùng nhóm parent`,
      );
    }

    if (dto.parentId) {
      const parent = await this.categoryRepository.findById(dto.parentId);
      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }
      if (parent.homeService !== dto.homeService) {
        throw new ConflictException(
          `Parent category homeService (${parent.homeService}) does not match ${dto.homeService}`,
        );
      }
    }

    const category = await this.categoryRepository.create({
      slug: dto.slug,
      name: dto.name,
      homeService: dto.homeService,
      iconUrl: dto.iconUrl,
      parent: dto.parentId ? { connect: { id: dto.parentId } } : undefined,
      sortOrder: dto.sortOrder ?? 0,
    });

    return mapCategory(category);
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const category = await this.categoryRepository.findById(id);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (Object.values(HOME_SERVICE_ROOT_SLUGS).includes(category.slug) && dto.homeService) {
      throw new ConflictException('Cannot change homeService on service root categories');
    }

    if (dto.name && dto.name !== category.name) {
      const duplicateName = await this.categoryRepository.findByNameAndParent(
        dto.name,
        dto.parentId !== undefined ? dto.parentId : category.parentId,
      );
      if (duplicateName && duplicateName.id !== id) {
        throw new ConflictException(
          `Tên "${dto.name}" đã tồn tại trong cùng nhóm parent`,
        );
      }
    }

    if (dto.homeService && dto.homeService !== category.homeService && !category.parentId) {
      const existingRoot = await this.categoryRepository.findRootByHomeService(dto.homeService);
      if (existingRoot && existingRoot.id !== id) {
        throw new ConflictException(
          `Root category cho ${dto.homeService} đã tồn tại: "${existingRoot.name}"`,
        );
      }
    }

    if (dto.parentId) {
      const parent = await this.categoryRepository.findById(dto.parentId);
      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }
      const targetService = dto.homeService ?? category.homeService;
      if (parent.homeService !== targetService) {
        throw new ConflictException('Parent category homeService mismatch');
      }
    }

    const updated = await this.categoryRepository.update(id, {
      name: dto.name,
      sortOrder: dto.sortOrder,
      iconUrl: dto.iconUrl,
      homeService: dto.homeService,
      parent: dto.parentId ? { connect: { id: dto.parentId } } : undefined,
    });

    if (dto.homeService && dto.homeService !== category.homeService) {
      await this.productRepository.syncHomeServiceForCategory(id, dto.homeService);
    }

    return mapCategory(updated);
  }

  async disableCategory(id: string) {
    const category = await this.categoryRepository.findById(id);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const isRoot = Object.values(HOME_SERVICE_ROOT_SLUGS).includes(category.slug);
    // Allow disabling empty DATA root when Nạp data is turned off (no eSale API).
    if (isRoot && category.homeService !== HomeServiceType.DATA) {
      throw new ConflictException(
        'Không thể tắt danh mục gốc trang chủ (Thẻ game / Thẻ ĐT / Nạp cước)',
      );
    }
    if (isRoot && category.homeService === HomeServiceType.DATA) {
      const productCount = await this.usage.categoryProductCount(id);
      if (productCount > 0) {
        throw new ConflictException('Danh mục Nạp Data còn sản phẩm — xóa/tắt sản phẩm trước');
      }
    }

    const updated = await this.categoryRepository.disable(id);
    return mapCategory(updated);
  }

  async restoreCategory(id: string) {
    const category = await this.categoryRepository.findById(id);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const updated = await this.categoryRepository.restore(id);
    return mapCategory(updated);
  }

  async listActiveCategories() {
    const rows = await this.categoryRepository.findManyActive();
    const dataEnabled = this.settingsStore.resolveSystemConfig().customerDataEnabled;
    return mapCategories(filterPublicCatalogByHomeService(rows, dataEnabled));
  }

  async listAllCategories() {
    const rows = await this.categoryRepository.findManyAll();
    return mapCategories(rows);
  }

  async deleteCategory(id: string) {
    const category = await this.categoryRepository.findById(id);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const isRoot = Object.values(HOME_SERVICE_ROOT_SLUGS).includes(category.slug);
    const dataEnabled = this.settingsStore.resolveSystemConfig().customerDataEnabled;
    // DATA root may be removed when feature is off and catalog is empty (no eSale data API).
    const allowDeleteDataRoot =
      isRoot &&
      category.homeService === HomeServiceType.DATA &&
      !dataEnabled;

    if (isRoot && !allowDeleteDataRoot) {
      if (category.homeService === HomeServiceType.DATA && dataEnabled) {
        throw new ConflictException(
          'Tắt “Cho phép khách hàng mua Nạp data” trong Cấu hình hệ thống trước khi xóa danh mục này',
        );
      }
      throw new ConflictException(
        'Không thể xóa danh mục gốc trang chủ (Thẻ game / Thẻ ĐT / Nạp cước)',
      );
    }

    const productCount = await this.usage.categoryProductCount(id);
    if (productCount > 0) {
      throw new ConflictException('Danh mục còn sản phẩm — xóa sản phẩm trước');
    }

    if (await this.usage.categoryHasUsage(id)) {
      throw new ConflictException('Danh mục đã dùng trong đơn hàng — chỉ được tắt, không xóa cứng');
    }

    await this.categoryRepository.hardDelete(id);
    return { deleted: true, id };
  }
}
