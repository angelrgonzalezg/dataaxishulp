import bcrypt from 'bcryptjs';
import { disconnectDb, prisma } from '../config/db';

const admin = {
  username: process.env.ADMIN_USERNAME ?? 'admin',
  email: process.env.ADMIN_EMAIL ?? 'admin@dataaxis.local',
  password: process.env.ADMIN_PASSWORD ?? 'Admin!2026',
  fullName: process.env.ADMIN_FULL_NAME ?? 'System Administrator',
  role: 'admin',
};

async function seedAdmin(): Promise<void> {
  const passwordHash = await bcrypt.hash(admin.password, 12);

  await prisma.user.upsert({
    where: { username: admin.username },
    update: {
      email: admin.email,
      passwordHash,
      fullName: admin.fullName,
      role: admin.role,
      isActive: true,
    },
    create: {
      username: admin.username,
      email: admin.email,
      passwordHash,
      fullName: admin.fullName,
      role: admin.role,
    },
  });

  console.log(`Admin user ready: ${admin.username}`);
}

seedAdmin()
  .catch((error) => {
    console.error('Failed to seed admin user:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDb();
  });
