import { Injectable } from '@nestjs/common';
import * as paypal from '@paypal/checkout-server-sdk';

@Injectable()
export class PaypalService {
  private client: paypal.core.PayPalHttpClient;
  private clientId: string;

  constructor() {
    const useSandbox =
      process.env.PAYPAL_USE_SANDBOX === 'true' || process.env.NODE_ENV === 'development';
    let environment: paypal.core.LiveEnvironment | paypal.core.SandboxEnvironment;
    if (useSandbox) {
      this.clientId = process.env.PAYPAL_SANDBOX_CLIENT_ID || process.env.PAYPAL_CLIENT_ID || '';
      environment = new paypal.core.SandboxEnvironment(
        this.clientId,
        process.env.PAYPAL_SANDBOX_SECRET || process.env.PAYPAL_SECRET || '',
      );
    } else {
      this.clientId = process.env.PAYPAL_CLIENT_ID || '';
      environment = new paypal.core.LiveEnvironment(
        this.clientId,
        process.env.PAYPAL_SECRET || '',
      );
    }
    this.client = new paypal.core.PayPalHttpClient(environment);
  }

  getClientId(): string {
    return this.clientId;
  }

  async checkSubscriptionStatus(subscriptionId: string): Promise<boolean> {
    const url = `/v1/billing/subscriptions/${subscriptionId}`;
    const request = {
      path: url,
      verb: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    };
    try {
      const response = await this.client.execute(request);
      const status = (response.result as { status?: string }).status;
      return status === 'ACTIVE';
    } catch {
      return false;
    }
  }

  async cancelSubscription(subscriptionId: string) {
    const url = `/v1/billing/subscriptions/${subscriptionId}/cancel`;
    const request = {
      path: url,
      verb: 'POST',
      body: {
        reason: 'User requested cancellation',
      },
      headers: {
        'Content-Type': 'application/json',
      },
    };
    await this.client.execute(request);
  }
}
