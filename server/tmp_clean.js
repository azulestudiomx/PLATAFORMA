const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanConfig() {
  const config = await prisma.systemConfig.findFirst();
  if (config) {
    let nt = JSON.parse(config.needTypes);
    console.log('Current types:', nt);
    nt = nt.filter(t => t.trim().length > 0);
    console.log('Cleaned types:', nt);
    await prisma.systemConfig.update({
      where: { id: config.id },
      data: { needTypes: JSON.stringify(nt) }
    });
    console.log('Config cleaned.');
  }
}

cleanConfig();
