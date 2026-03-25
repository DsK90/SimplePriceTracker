const path = require('path');
const { PrismaClient } = require('@prisma/client');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient();

const PAYPAL_PRO_PLAN_ID =
  process.env.PAYPAL_PRO_PLAN_ID || 'P-6TL7122718514241MNHCG5QQ';

/** 3.99 EUR/month net (399 cents); billing cycle follows your PayPal product */
const PRO_MONTHLY_NET_CENTS = 399;

async function main() {
  await prisma.plan.upsert({
    where: { slug: 'pro-monthly' },
    create: {
      name: 'Pro',
      slug: 'pro-monthly',
      description: null,
      priceCents: PRO_MONTHLY_NET_CENTS,
      currency: 'EUR',
      paypalPlanId: PAYPAL_PRO_PLAN_ID,
      maxTrackings: null,
      sortOrder: 10,
    },
    update: {
      paypalPlanId: PAYPAL_PRO_PLAN_ID,
      priceCents: PRO_MONTHLY_NET_CENTS,
      currency: 'EUR',
      description: null,
    },
  });
  await prisma.plan.deleteMany({ where: { slug: 'pro-yearly' } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
