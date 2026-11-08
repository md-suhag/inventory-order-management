import { execSync } from 'node:child_process';
import type { TestProject } from 'vitest/node';

/** Applies all migrations to the test database once per integration run. */
export default function setup(project: TestProject): void {
  const url = project.config.env.DATABASE_URL as string;
  const dbName = new URL(url).pathname.slice(1);
  if (!/test/i.test(dbName)) {
    throw new Error(`Refusing to run integration tests against "${dbName}": database name must contain "test".`);
  }
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url } });
}
