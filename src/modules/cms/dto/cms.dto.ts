import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CmsBannerPosition, CmsBannerStatus, CmsPageLayout, CmsPageStatus, CmsPageType } from '@prisma/client';
import { CMS_ROBOTS_TXT_MAX_LENGTH } from '../entities/cms.constants';

export class CmsPageSeoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  metaTitle!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  metaDescription!: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  metaKeywords?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  focusKeyword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  ogTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  ogDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  ogImage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  canonicalUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  robots?: string;
}

export class CreateCmsPageDto {
  @IsEnum(CmsPageType)
  type!: CmsPageType;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  excerpt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  category?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(512)
  featuredImage?: string;

  @IsOptional()
  @IsEnum(CmsPageStatus)
  status?: CmsPageStatus;

  @IsOptional()
  @IsEnum(CmsPageLayout)
  pageLayout?: CmsPageLayout;

  @IsOptional()
  @IsBoolean()
  showInNav?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  navSortOrder?: number;

  @IsOptional()
  seo?: CmsPageSeoDto;
}

export class UpdateCmsPageDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  slug?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  excerpt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  category?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(512)
  featuredImage?: string;

  @IsOptional()
  @IsEnum(CmsPageStatus)
  status?: CmsPageStatus;

  @IsOptional()
  @IsEnum(CmsPageLayout)
  pageLayout?: CmsPageLayout;

  @IsOptional()
  @IsBoolean()
  showInNav?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  navSortOrder?: number;

  @IsOptional()
  seo?: CmsPageSeoDto;
}

export class CreateCmsBannerDto {
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsString()
  @MaxLength(512)
  imageUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  linkUrl?: string;

  @IsEnum(CmsBannerPosition)
  position!: CmsBannerPosition;

  @IsOptional()
  sortOrder?: number;

  @IsOptional()
  startAt?: string;

  @IsOptional()
  endAt?: string;

  @IsOptional()
  @IsEnum(CmsBannerStatus)
  status?: CmsBannerStatus;
}

export class UpdateCmsBannerDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  linkUrl?: string;

  @IsOptional()
  @IsEnum(CmsBannerPosition)
  position?: CmsBannerPosition;

  @IsOptional()
  sortOrder?: number;

  @IsOptional()
  startAt?: string;

  @IsOptional()
  endAt?: string;

  @IsOptional()
  @IsEnum(CmsBannerStatus)
  status?: CmsBannerStatus;
}

export class UpdateCmsSeoSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  siteTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  metaDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  googleAnalyticsId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  googleTagManagerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  searchConsoleVerification?: string;

  @IsOptional()
  @IsString()
  @MaxLength(CMS_ROBOTS_TXT_MAX_LENGTH)
  robotsTxt?: string;

  @IsOptional()
  @IsBoolean()
  sitemapEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  sitemapBaseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  ogImageUrl?: string;
}

export class ListCmsPagesQueryDto {
  @IsOptional()
  @IsEnum(CmsPageType)
  type?: CmsPageType;

  @IsOptional()
  @IsEnum(CmsPageStatus)
  status?: CmsPageStatus;
}

export class UpsertCmsCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  metaDescription?: string;

  @IsOptional()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  intro?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  canonicalUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  ogImageUrl?: string;
}

export class UpsertCmsTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  metaDescription?: string;

  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;
}

export class UpdateCmsThemeDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  logoDesktop?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  logoMobile?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  favicon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  ogDefaultImage?: string;

  @IsOptional()
  headerMenu?: Array<{ label: string; href: string; sortOrder?: number }>;

  @IsOptional()
  footerColumns?: Array<{ title: string; links: Array<{ label: string; href: string }> }>;

  @IsOptional()
  companyInfo?: {
    companyName?: string;
    taxCode?: string;
    address?: string;
    hotline?: string;
    email?: string;
  };

  @IsOptional()
  contactChannels?: Array<{
    key: 'email' | 'hotline' | 'zalo' | 'fanpage' | 'address';
    enabled?: boolean;
    value?: string;
    href?: string;
  }>;

  @IsOptional()
  mobileNav?: Array<{
    label: string;
    icon: string;
    url: string;
    sortOrder?: number;
    requireLogin?: boolean;
    active?: boolean;
  }>;
}

export class ListBlogQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  take?: number;
}

export class ListCmsMediaQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  folder?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  mimeType?: string;
}

export class UpsertCmsFaqItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  question!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  answer!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  category!: string;

  @IsOptional()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  status?: string;
}

export class UpdateCmsFaqItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertCmsFaqItemDto)
  items!: UpsertCmsFaqItemDto[];
}
