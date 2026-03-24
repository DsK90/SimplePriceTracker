declare module '@paypal/checkout-server-sdk' {
  export namespace core {
    class SandboxEnvironment {
      constructor(clientId: string, clientSecret: string);
    }
    class LiveEnvironment {
      constructor(clientId: string, clientSecret: string);
    }
    class PayPalHttpClient {
      constructor(env: SandboxEnvironment | LiveEnvironment);
      execute(request: unknown): Promise<{ result: { status?: string } }>;
    }
  }
}
