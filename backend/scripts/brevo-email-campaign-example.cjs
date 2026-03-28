/**
 * Optional: Brevo *marketing* campaigns (lists), not used by the Pricefly API.
 * Transactional mail (welcome, price alerts) uses BrevoClient.transactionalEmails in MailService.
 *
 * Env: BREVO_API_KEY (Settings → SMTP & API → API keys, v3 transactional scope works for both).
 * Run: node scripts/brevo-email-campaign-example.cjs
 *
 * Replace listIds with IDs from Brevo → Contacts → Lists; scheduledAt optional (ISO or their format).
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const SibApiV3Sdk = require('sib-api-v3-sdk');

async function main() {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    console.error('Set BREVO_API_KEY in the environment.');
    process.exit(1);
  }
  const defaultClient = SibApiV3Sdk.ApiClient.instance;
  const auth = defaultClient.authentications['api-key'];
  auth.apiKey = key;

  const apiInstance = new SibApiV3Sdk.EmailCampaignsApi();
  const campaign = new SibApiV3Sdk.CreateEmailCampaign();
  campaign.name = 'Campaign sent via the API (example)';
  campaign.subject = 'My subject';
  campaign.sender = { name: 'Reikalabs', email: 'noreply@reikalabs.com' };
  campaign.type = 'classic';
  campaign.htmlContent =
    '<p>Congratulations! You successfully sent this example campaign via the Brevo API.</p>';
  campaign.recipients = { listIds: [2, 7] };
  // campaign.scheduledAt = '2018-01-01 00:00:01';

  const data = await apiInstance.createEmailCampaign(campaign);
  console.log('API called successfully. Returned data:', data);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
