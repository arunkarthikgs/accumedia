import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const accounts = [
  {
    email: "superadmin@macula.health",
    password: process.env.DEMO_SUPERADMIN_PASSWORD || "MaculaAdmin@2026!",
    isSuperAdmin: true,
  },
  {
    email: "admin@hospital.in",
    password: process.env.DEMO_ADMIN_PASSWORD || "MaculaAdmin@2026!",
    isSuperAdmin: false,
  },
  {
    email: "doctor@hospital.in",
    password: process.env.DEMO_DOCTOR_PASSWORD || "MaculaDoctor@2026!",
    isSuperAdmin: false,
  },
  {
    email: "jj@mail.com",
    password: process.env.DEMO_DOCTOR_PASSWORD || "MaculaDoctor@2026!",
    isSuperAdmin: false,
  },
];

async function main() {
  for (const account of accounts) {
    const passwordHash = await bcrypt.hash(account.password, 12);
    const user = await db.user.findUnique({ where: { email: account.email }, select: { id: true } });
    if (!user) {
      console.log(`Skipped missing user ${account.email}`);
      continue;
    }
    await db.user.update({ where: { id: user.id }, data: { passwordHash, isSuperAdmin: account.isSuperAdmin } });
    console.log(`Provisioned password for ${account.email}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());