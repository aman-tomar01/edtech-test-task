import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function withUserContext<T>(
  userId: string,
  fn: () => Promise<T>
): Promise<T> {
  await prisma.$executeRawUnsafe(
    `SELECT set_config('app.current_user_id', $1, true)`,
    userId
  );
  return fn();
}
