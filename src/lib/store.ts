import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "./env";
import type { Circle } from "./types";

/** Minimal persistence interface: Upstash Redis when configured, else JSON file (+ memory). */
export interface Store {
  getCircle(id: string): Promise<Circle | null>;
  putCircle(c: Circle): Promise<void>;
  listCircles(): Promise<Circle[]>;
}

class FileStore implements Store {
  private cache: Map<string, Circle> | null = null;
  private file = path.join(process.cwd(), env.dataDir, "circles.json");

  private async load() {
    if (this.cache) return this.cache;
    this.cache = new Map();
    try {
      const raw = await fs.readFile(this.file, "utf8");
      for (const c of JSON.parse(raw) as Circle[]) this.cache.set(c.id, c);
    } catch {
      /* first run */
    }
    return this.cache;
  }
  private async flush() {
    const m = await this.load();
    try {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      await fs.writeFile(this.file, JSON.stringify([...m.values()], null, 2));
    } catch {
      /* read-only FS (e.g. serverless): memory only */
    }
  }
  async getCircle(id: string) {
    return (await this.load()).get(id) ?? null;
  }
  async putCircle(c: Circle) {
    (await this.load()).set(c.id, c);
    await this.flush();
  }
  async listCircles() {
    return [...(await this.load()).values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

class UpstashStore implements Store {
  private redis: import("@upstash/redis").Redis;
  constructor(redis: import("@upstash/redis").Redis) {
    this.redis = redis;
  }
  async getCircle(id: string) {
    return (await this.redis.get<Circle>(`circle:${id}`)) ?? null;
  }
  async putCircle(c: Circle) {
    await this.redis.set(`circle:${c.id}`, c);
    await this.redis.zadd("circles", { score: Date.parse(c.createdAt), member: c.id });
  }
  async listCircles() {
    const ids = await this.redis.zrange<string[]>("circles", 0, -1, { rev: true });
    const out: Circle[] = [];
    for (const id of ids) {
      const c = await this.getCircle(id);
      if (c) out.push(c);
    }
    return out;
  }
}

let store: Store | null = null;
export async function getStore(): Promise<Store> {
  if (store) return store;
  if (env.upstashUrl && env.upstashToken) {
    const { Redis } = await import("@upstash/redis");
    store = new UpstashStore(new Redis({ url: env.upstashUrl, token: env.upstashToken }));
  } else {
    store = new FileStore();
  }
  return store;
}
