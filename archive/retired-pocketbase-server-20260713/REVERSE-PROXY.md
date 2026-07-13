# DriverLog — expose PocketBase at https://api.driverlog.link

Goal: make your self-hosted PocketBase reachable over public HTTPS so all your
devices (and the Play Store app) can sync to it. Caddy handles the certificate
automatically — you don't touch TLS.

---

## Step 0 — Figure out your network (you said "not sure")

Run these **on the machine that will run PocketBase**:

```bash
# Your public IP (as the internet sees you)
curl -4 https://ifconfig.me ; echo

# Your machine's local IP
#   macOS:  ipconfig getifaddr en0
#   Linux:  hostname -I
```

**How to read it:**
- If this is a **VPS / cloud server** (DigitalOcean, Hetzner, Hostinger VPS, etc.) →
  you have a public IP and ports are open. **Use Path A.**
- If it's a **home computer**: compare the two IPs. If the public IP starts with
  `100.64`–`100.127` you're behind **CGNAT** (can't port-forward) → **Path B**.
  Otherwise you *may* be able to port-forward on your router → try **Path A**;
  if it doesn't work, fall back to **Path B**.

Quick reachability test (after you start the stack): from your **phone on mobile
data** (not home wifi) open `https://api.driverlog.link/api/health`. A JSON
`{"code":200,...}` means it's public.

---

## Path A — Public IP + ports 80/443 (VPS, or home with port-forwarding)

1. **DNS:** point `api.driverlog.link` at the machine. Tell me your public IP and I'll
   add the Hostinger A record for you, or add it yourself:
   - Type `A`, Name `api`, Content `<your public IP>`, TTL `300`.
2. **(Home only)** In your router, forward external ports **80 → machine:80** and
   **443 → machine:443**.
3. **Start it:**
   ```bash
   cd pocketbase
   cp .env.example .env          # set a strong PB_ADMIN_PASSWORD
   docker compose up -d          # starts pocketbase + caddy
   ```
4. Caddy fetches a Let's Encrypt cert automatically (needs port 80 reachable + DNS live).
   Verify:
   ```bash
   curl https://api.driverlog.link/api/health     # → {"code":200,...}
   ```
5. Import the schema (Admin UI → Settings → Import collections → paste `schema.pb.json`).

Admin UI is then at `https://api.driverlog.link/_/`.

---

## Path B — Home / behind CGNAT (no public IP, can't open ports)

Use a **Cloudflare Tunnel** — it dials **out** from your machine, so no ports or
public IP are needed. This needs the domain's DNS on Cloudflare (free), which is a
one-time move from Hostinger:

1. Create a free Cloudflare account, add `driverlog.link`, and update the
   nameservers at Hostinger to the two Cloudflare gives you. (I can help re-create
   your current records on Cloudflare so nothing breaks.)
2. Install `cloudflared` on the machine and run:
   ```bash
   cloudflared tunnel login
   cloudflared tunnel create driverlog
   cloudflared tunnel route dns driverlog api.driverlog.link
   cloudflared tunnel run --url http://localhost:8090 driverlog
   ```
3. Because Cloudflare terminates TLS at its edge, you **don't need Caddy** on this
   path — run PocketBase directly (publish `8090` to localhost only) and let the
   tunnel reach it.

Cloudflare gives you HTTPS on `api.driverlog.link` with no router changes.

> If you'd rather not move DNS to Cloudflare, tell me — there are paid static-IP /
> VPS alternatives, but for a home box the tunnel is the cleanest free option.

---

## Notes
- **Cross-origin is fine:** the app on `driverlog.link` calling `api.driverlog.link`
  is cross-origin; PocketBase allows it by default (no extra CORS config).
- **Persist volumes:** keep `pb_data/` (your database) and the `caddy_data` volume
  (your TLS certs) — both are already mounted in `docker-compose.yml`.
- **Firewall (VPS):** allow inbound 80 and 443.
