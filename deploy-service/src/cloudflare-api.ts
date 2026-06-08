// Cloudflare API client for deployment service
import { CloudflareAccount, CloudflareKVNamespace, CloudflareWorker } from "./types.ts";

export class CloudflareAPI {
  constructor(private token: string, private accountId: string) {}

  private async request(path: string, method = "GET", body?: unknown): Promise<Response> {
    const url = `https://api.cloudflare.com/client/v4${path}`;
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    return response;
  }

  async getAccounts(): Promise<CloudflareAccount[]> {
    const response = await this.request("/accounts");
    const data = await response.json();
    if (!data.success) throw new Error(data.errors?.[0]?.message || "Failed to get accounts");
    return data.result;
  }

  async createKVNamespace(name: string): Promise<CloudflareKVNamespace> {
    const response = await this.request(`/accounts/${this.accountId}/storage/kv/namespaces`, "POST", {
      title: name,
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.errors?.[0]?.message || "Failed to create KV namespace");
    return data.result;
  }

  async uploadWorkerScript(
    scriptName: string,
    scriptContent: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    // Upload script via multipart/form-data
    const formData = new FormData();
    formData.append("metadata", JSON.stringify(metadata));
    formData.append("script", new Blob([scriptContent], { type: "application/javascript+module" }), "index.ts");

    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/workers/scripts/${scriptName}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${this.token}`,
      },
      body: formData as unknown as BodyInit,
    });

    const data = await response.json();
    if (!data.success) throw new Error(data.errors?.[0]?.message || "Failed to upload worker");
  }

  async setWorkerSecret(scriptName: string, secretName: string, secretValue: string): Promise<void> {
    const formData = new FormData();
    formData.append("value", secretValue);

    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/workers/scripts/${scriptName}/secrets/${secretName}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${this.token}`,
      },
      body: formData as unknown as BodyInit,
    });

    const data = await response.json();
    if (!data.success) throw new Error(data.errors?.[0]?.message || "Failed to set secret");
  }

  async getWorker(scriptName: string): Promise<CloudflareWorker | null> {
    try {
      const response = await this.request(`/accounts/${this.accountId}/workers/scripts/${scriptName}`);
      if (response.status === 404) return null;
      const data = await response.json();
      if (!data.success) throw new Error(data.errors?.[0]?.message || "Failed to get worker");
      return {
        id: data.result.id,
        name: data.result.name,
        hostname: `https://${data.result.subdomain}.workers.dev`,
      };
    } catch (e) {
      if ((e as Error).message.includes("404")) return null;
      throw e;
    }
  }

  async getWorkerRoutes(scriptName: string): Promise<string[]> {
    try {
      const response = await this.request(`/accounts/${this.accountId}/workers/routes`);
      const data = await response.json();
      if (!data.success) return [];
      return (data.result as Array<{ script: string; pattern: string }>)
        .filter((r) => r.script === scriptName)
        .map((r) => r.pattern);
    } catch {
      return [];
    }
  }

  async listWorkers(): Promise<{ id: string; name: string }[]> {
    try {
      const response = await this.request(`/accounts/${this.accountId}/workers/scripts`);
      const data = await response.json();
      if (!data.success) return [];
      return data.result;
    } catch {
      return [];
    }
  }

  async healthCheck(workerName: string): Promise<boolean> {
    try {
      const url = `https://${workerName}.${this.accountId}.workers.dev/health`;
      const res = await fetch(url, { method: "GET" });
      return res.ok;
    } catch {
      return false;
    }
  }
}
