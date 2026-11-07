import 'reflect-metadata';
import { PERMISSIONS_KEY } from '../../../common/decorators/permissions.decorator';
import { CMS_PERMISSION } from '../entities/cms.constants';
import { CmsAdminController } from './cms-admin.controller';

describe('CMS admin translation permissions', () => {
  it('keeps translation routes behind the existing CMS permission', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CmsAdminController)).toEqual([CMS_PERMISSION]);
    expect(CmsAdminController.prototype.savePageTranslation).toEqual(expect.any(Function));
    expect(CmsAdminController.prototype.saveCategoryTranslation).toEqual(expect.any(Function));
    expect(CmsAdminController.prototype.saveTagTranslation).toEqual(expect.any(Function));
  });
});
