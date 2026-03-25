-- Pro: 3.99 EUR/month net (399 cents); slug pro-monthly (legacy pro-yearly row renamed)
UPDATE "Plan" SET "priceCents" = 399, "currency" = 'EUR', "slug" = 'pro-monthly' WHERE "slug" = 'pro-yearly';
