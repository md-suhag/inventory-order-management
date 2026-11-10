import { describe, expect, it } from 'vitest';
import { getJwtExpirationMs, isJwtExpiringSoon } from '@/lib/auth/cookies';
import { hasAnyPermission, hasPermission, PERMISSIONS } from '@/lib/permissions';
import { changePasswordFormSchema, loginFormSchema, passwordRuleSchema } from '@/lib/schemas';
import { NAV_GROUPS } from '@/components/layout/nav-config';

function makeJwt(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'user-1', exp: expSeconds })).toString('base64url');
  return `${header}.${payload}.signature`;
}

describe('RBAC permissions and nav filtering', () => {
  it('matches permission checks and filters navigation items by user role permissions', () => {
    const staffPerms = ['dashboard.read', 'products.read', 'orders.read', 'orders.manage'];
    expect(hasPermission(staffPerms, 'orders.read')).toBe(true);
    expect(hasPermission(staffPerms, 'products.view_cost')).toBe(false);
    expect(hasAnyPermission(undefined, ['orders.read'])).toBe(false);

    const visibleNavLabels = NAV_GROUPS.flatMap((g) =>
      g.items.filter((item) => hasAnyPermission(staffPerms, item.anyPermissions)).map((i) => i.label),
    );
    expect(visibleNavLabels).toEqual(['Dashboard', 'Products', 'Orders']);

    const adminNavLabels = NAV_GROUPS.flatMap((g) =>
      g.items.filter((item) => hasAnyPermission([...PERMISSIONS], item.anyPermissions)).map((i) => i.label),
    );
    expect(adminNavLabels).toContain('Settings');
    expect(adminNavLabels).toContain('Audit Logs');
    expect(adminNavLabels).toContain('Reports');
  });
});

describe('JWT expiration helpers', () => {
  it('decodes JWT exp claim and checks proactive refresh buffer', () => {
    const futureSec = Math.floor(Date.now() / 1000) + 120;
    const soonSec = Math.floor(Date.now() / 1000) + 10;

    expect(getJwtExpirationMs(makeJwt(futureSec))).toBe(futureSec * 1000);
    expect(getJwtExpirationMs('not-a-jwt')).toBeNull();

    expect(isJwtExpiringSoon(makeJwt(futureSec), 30)).toBe(false);
    expect(isJwtExpiringSoon(makeJwt(soonSec), 30)).toBe(true);
    expect(isJwtExpiringSoon(undefined)).toBe(true);
  });
});

describe('Form validation schemas', () => {
  it('normalizes email and enforces bcrypt 72-byte and character composition limits', () => {
    const login = loginFormSchema.parse({ email: '  Admin@Example.COM ', password: 'ChangeMe123!' });
    expect(login.email).toBe('admin@example.com');

    expect(passwordRuleSchema.safeParse('short1').success).toBe(false);
    expect(passwordRuleSchema.safeParse('onlyletters').success).toBe(false);
    expect(passwordRuleSchema.safeParse('12345678').success).toBe(false);
    expect(passwordRuleSchema.safeParse('A1' + 'x'.repeat(71)).success).toBe(false); // 73 bytes
    expect(passwordRuleSchema.safeParse('ValidPass1').success).toBe(true);

    const samePw = changePasswordFormSchema.safeParse({
      currentPassword: 'ValidPass1',
      newPassword: 'ValidPass1',
    });
    expect(samePw.success).toBe(false);
  });
});
