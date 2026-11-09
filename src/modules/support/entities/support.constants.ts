export const SUPPORT_PERMISSION = 'support.manage';

export const SUPPORT_UPLOAD_FOLDER = 'support';
export const SUPPORT_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
/** Client-declared MIME allowlist — magic bytes still required. GIF removed (W2). */
export const SUPPORT_UPLOAD_MIME = ['image/jpeg', 'image/png', 'image/webp'];

export const SUPPORT_OPEN_CAP_DEFAULT = 5;
export const SUPPORT_ATTACHMENT_URL_PREFIX = '/uploads/support/';
export const SUPPORT_FILES_API_PREFIX = '/account/support/files/';
export const SUPPORT_ADMIN_FILES_API_PREFIX = '/admin/support/files/';
