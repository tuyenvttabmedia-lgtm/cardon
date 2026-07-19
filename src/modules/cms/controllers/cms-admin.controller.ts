import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SystemAuditAction, SystemAuditResource } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { Audit } from '../../audit-log/decorators/audit.decorator';
import { AuditSnapshotKey } from '../../audit-log/entities/audit-log.constants';
import {
  CreateCmsBannerDto,
  CreateCmsPageDto,
  ListCmsPagesQueryDto,
  ListCmsMediaQueryDto,
  UpdateCmsBannerDto,
  UpdateCmsPageDto,
  UpdateCmsSeoSettingsDto,
  UpdateCmsThemeDto,
  UpsertCmsCategoryDto,
  UpsertCmsTagDto,
} from '../dto/cms.dto';
import { CMS_PERMISSION } from '../entities/cms.constants';
import { CmsMediaService } from '../services/cms-media.service';
import { CmsService } from '../services/cms.service';
import { UpsertEmailTemplateDto, UpsertEmailTemplatesDto } from '../../email-template/dto/email-template.dto';
import { EmailTemplateService } from '../../email-template/services/email-template.service';

@Controller('admin/cms')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions(CMS_PERMISSION)
export class CmsAdminController {
  constructor(
    private readonly cmsService: CmsService,
    private readonly mediaService: CmsMediaService,
    private readonly emailTemplateService: EmailTemplateService,
  ) {}

  @Get('pages')
  listPages(@Query() query: ListCmsPagesQueryDto) {
    return this.cmsService.listPages(query);
  }

  @Get('pages/:id')
  getPage(@Param('id', ParseUUIDPipe) id: string) {
    return this.cmsService.getPage(id);
  }

  @Post('pages')
  createPage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCmsPageDto,
  ) {
    return this.cmsService.createPage(user.id, dto);
  }

  @Patch('pages/:id')
  updatePage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCmsPageDto,
  ) {
    return this.cmsService.updatePage(id, dto);
  }

  @Post('pages/:id/publish')
  publishPage(@Param('id', ParseUUIDPipe) id: string) {
    return this.cmsService.publishPage(id);
  }

  @Get('banners')
  listBanners() {
    return this.cmsService.listBanners();
  }

  @Post('banners')
  createBanner(@Body() dto: CreateCmsBannerDto) {
    return this.cmsService.createBanner(dto);
  }

  @Patch('banners/:id')
  updateBanner(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCmsBannerDto,
  ) {
    return this.cmsService.updateBanner(id, dto);
  }

  @Post('banners/:id/disable')
  disableBanner(@Param('id', ParseUUIDPipe) id: string) {
    return this.cmsService.disableBanner(id);
  }

  @Delete('banners/:id')
  deleteBanner(@Param('id', ParseUUIDPipe) id: string) {
    return this.cmsService.deleteBanner(id);
  }

  @Get('seo-settings')
  getSeoSettings() {
    return this.cmsService.getSeoSettings();
  }

  @Put('seo-settings')
  @Audit({
    resource: SystemAuditResource.SEO,
    action: SystemAuditAction.UPDATE,
    snapshot: AuditSnapshotKey.CMS_SEO,
  })
  updateSeoSettings(@Body() dto: UpdateCmsSeoSettingsDto) {
    return this.cmsService.updateSeoSettings(dto);
  }

  @Get('theme')
  getThemeSettings() {
    return this.cmsService.getThemeSettings();
  }

  @Put('theme')
  updateThemeSettings(@Body() dto: UpdateCmsThemeDto) {
    return this.cmsService.updateThemeSettings(dto);
  }

  @Get('categories')
  listCategories() {
    return this.cmsService.listCategories();
  }

  @Post('categories')
  createCategory(@Body() dto: UpsertCmsCategoryDto) {
    return this.cmsService.createCategory(dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertCmsCategoryDto,
  ) {
    return this.cmsService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.cmsService.deleteCategory(id);
  }

  @Get('tags')
  listTags() {
    return this.cmsService.listTags();
  }

  @Post('tags')
  createTag(@Body() dto: UpsertCmsTagDto) {
    return this.cmsService.createTag(dto);
  }

  @Patch('tags/:id')
  updateTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertCmsTagDto,
  ) {
    return this.cmsService.updateTag(id, dto);
  }

  @Delete('tags/:id')
  deleteTag(@Param('id', ParseUUIDPipe) id: string) {
    return this.cmsService.deleteTag(id);
  }

  @Patch('tags/:id/visibility')
  toggleTagVisibility(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isHidden') isHidden: boolean,
  ) {
    return this.cmsService.toggleTagVisibility(id, isHidden);
  }

  @Get('media')
  listMedia(@Query() query: ListCmsMediaQueryDto) {
    return this.mediaService.listMedia(query);
  }

  @Post('media/upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadMedia(
    @UploadedFile() file: Express.Multer.File,
    @Body('alt') alt?: string,
    @Body('title') title?: string,
    @Body('folder') folder?: string,
  ) {
    return this.mediaService.upload(file, { alt, title, folder });
  }

  @Delete('media/:id')
  deleteMedia(@Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.deleteMedia(id);
  }

  @Get('email-templates')
  listEmailTemplates() {
    return this.emailTemplateService.list();
  }

  @Put('email-templates')
  saveEmailTemplates(@Body() dto: UpsertEmailTemplatesDto) {
    return Promise.all(
      dto.templates.map((template: UpsertEmailTemplateDto) =>
        this.emailTemplateService.upsert(template),
      ),
    ).then(() => this.emailTemplateService.list());
  }
}
