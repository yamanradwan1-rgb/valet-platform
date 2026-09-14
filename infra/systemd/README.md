# Production systemd services

The Customer application is built and served independently from the API. Its
server-only `API_ORIGIN` points at the existing private API listener; browsers
use the Customer origin's `/api/v1/guest/*` same-origin proxy.

From `/workspace/valet-platform`, build and install it with:

```sh
API_ORIGIN=http://127.0.0.1:3001 corepack pnpm --filter @valet/customer build
install -m 0644 infra/systemd/vaylet-customer.service /etc/systemd/system/vaylet-customer.service
systemctl daemon-reload
systemctl enable --now vaylet-customer.service
```

The service binds only to `127.0.0.1:3002`. A managed Cloudflare Tunnel must
map the dedicated Customer hostname to `http://127.0.0.1:3002`. Keep the API
ingress mapping intact. Do not use a Quick Tunnel hostname as the production
Customer origin because it is ephemeral.

After creating the controlled DNS/tunnel route, verify the public HTTPS origin
and use that exact bare origin for both `NEXT_PUBLIC_CUSTOMER_APP_ORIGIN` and
`EXPO_PUBLIC_CUSTOMER_APP_ORIGIN` during their respective production builds.
