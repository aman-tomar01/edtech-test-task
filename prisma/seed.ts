import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 12);

  const alice = await prisma.user.upsert({
    where: { email: "alice@example.com" },
    update: {},
    create: {
      name: "Alice Owner",
      email: "alice@example.com",
      passwordHash,
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: "bob@example.com" },
    update: {},
    create: {
      name: "Bob Editor",
      email: "bob@example.com",
      passwordHash,
    },
  });

  const carol = await prisma.user.upsert({
    where: { email: "carol@example.com" },
    update: {},
    create: {
      name: "Carol Viewer",
      email: "carol@example.com",
      passwordHash,
    },
  });

  const doc = await prisma.document.upsert({
    where: { id: "seed-doc-001" },
    update: {},
    create: {
      id: "seed-doc-001",
      title: "Welcome to DocSync",
      content:
        "This is a local-first collaborative document.\n\nTry editing offline, then reconnect to sync.\n\nAlice is the owner, Bob can edit, Carol can only view.",
      ownerId: alice.id,
      members: {
        create: [
          { userId: alice.id, role: "OWNER" },
          { userId: bob.id, role: "EDITOR" },
          { userId: carol.id, role: "VIEWER" },
        ],
      },
    },
  });

  await prisma.documentVersion.upsert({
    where: { id: "seed-version-001" },
    update: {},
    create: {
      id: "seed-version-001",
      documentId: doc.id,
      userId: alice.id,
      title: doc.title,
      content: doc.content,
      label: "Initial version",
    },
  });

  console.log("Seed complete:");
  console.log("  alice@example.com / password123 (Owner)");
  console.log("  bob@example.com   / password123 (Editor)");
  console.log("  carol@example.com / password123 (Viewer)");
  console.log(`  Document ID: ${doc.id}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
