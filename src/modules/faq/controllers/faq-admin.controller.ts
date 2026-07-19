import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { CMS_PERMISSION } from '../entities/faq.constants';
import {
  BulkUpdateFaqDto,
  CreateFaqCategoryDto,
  CreateFaqDto,
  ListFaqAdminQueryDto,
  UpdateFaqCategoryDto,
  UpdateFaqDto,
} from '../dto/faq.dto';
import { FaqService } from '../services/faq.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions(CMS_PERMISSION)
export class FaqAdminController {
  constructor(private readonly faqService: FaqService) {}

  @Get('faq/categories')
  listCategories() {
    return this.faqService.listCategoriesAdmin();
  }

  @Post('faq/categories')
  createCategory(@Body() dto: CreateFaqCategoryDto) {
    return this.faqService.createCategory(dto);
  }

  @Patch('faq/categories/:id')
  updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFaqCategoryDto) {
    return this.faqService.updateCategory(id, dto);
  }

  @Delete('faq/categories/:id')
  deleteCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.faqService.deleteCategory(id);
  }

  @Get('faqs')
  listFaqs(@Query() query: ListFaqAdminQueryDto) {
    return this.faqService.listFaqsAdmin(query);
  }

  @Patch('faqs/bulk')
  bulkUpdate(@Body() dto: BulkUpdateFaqDto) {
    return this.faqService.bulkUpdateFaqs(dto);
  }

  @Post('faqs/migrate-legacy')
  migrateLegacy() {
    return this.faqService.migrateFromLegacyJson();
  }

  @Post('faqs')
  createFaq(@Body() dto: CreateFaqDto) {
    return this.faqService.createFaq(dto);
  }

  @Get('faqs/:id')
  getFaq(@Param('id', ParseUUIDPipe) id: string) {
    return this.faqService.getFaqAdmin(id);
  }

  @Patch('faqs/:id')
  updateFaq(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFaqDto) {
    return this.faqService.updateFaq(id, dto);
  }

  @Delete('faqs/:id')
  deleteFaq(@Param('id', ParseUUIDPipe) id: string) {
    return this.faqService.deleteFaq(id);
  }
}
