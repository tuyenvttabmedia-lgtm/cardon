/** Canonical build label — override via BUILD_VERSION / NEXT_PUBLIC_BUILD_VERSION. */
export const CARDON_BUILD_VERSION = '6035.2 AGENT REGISTRATION & KYC CENTER';

/**
 * Single build version provider for Admin, Partner, Customer, Public, and API runtime.
 */
export class BuildInfoService {
  static resolveVersion(): string {
    return (
      process.env.NEXT_PUBLIC_BUILD_VERSION ??
      process.env.BUILD_VERSION ??
      process.env.NEXT_PUBLIC_WEB_BUILD_VERSION ??
      process.env.WEB_BUILD_VERSION ??
      process.env.NEXT_PUBLIC_PARTNER_BUILD_VERSION ??
      process.env.PARTNER_BUILD_VERSION ??
      process.env.NEXT_PUBLIC_ADMIN_BUILD_VERSION ??
      process.env.ADMIN_BUILD_VERSION ??
      CARDON_BUILD_VERSION
    );
  }

  static footerLabel(): string {
    return `Build ${this.resolveVersion()}`;
  }

  static htmlComment(product = 'CardOn'): string {
    return `<!-- ${product} build ${this.resolveVersion()} -->`;
  }
}
