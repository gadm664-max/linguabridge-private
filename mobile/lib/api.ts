import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { requireApiBaseUrl } from "./config";
import { getSessionToken } from "./session";

let client: any;

export function getApi() {
  if (client) return client;
  client = createTRPCProxyClient<any>({
    links: [
      httpBatchLink({
        url: `${requireApiBaseUrl()}/api/trpc`,
        transformer: superjson,
        async headers() {
          const token = await getSessionToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  }) as any;
  return client;
}
