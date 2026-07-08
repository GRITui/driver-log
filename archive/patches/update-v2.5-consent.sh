#!/usr/bin/env bash
#
# DriverLog — Update v2.5 (shell-driven, per FRAMEWORK.md)
#   Adopt Google's EU User Consent Policy on the code side:
#     • Google Consent Mode v2 — all ad/analytics signals default to "denied"
#       until a certified CMP records the user's choice (loaded BEFORE AdSense).
#     • privacy.html consent disclosure (EEA/UK/CH + opt-out).
#   ACCOUNT STEP (not code): publish AdSense → Privacy & messaging → European
#   regulations (GDPR) message (Google's certified CMP). See MONETIZATION.md.
#
# Safety: only READS/WRITES site/index.html, site/privacy.html, site/sw.js under
# its own folder. No destructive commands. Idempotent (re-run = safe no-op).
#
# Usage: chmod +x update-v2.5-consent.sh && ./update-v2.5-consent.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "==> DriverLog v2.5 (consent) update in: $ROOT"
python3 - "$ROOT" <<'PYEOF'
#!/usr/bin/env python3
# Patcher for DriverLog v2.5 — adopt Google EU User Consent Policy (Consent Mode v2 + disclosure).
import sys, io, re
ROOT = sys.argv[1]
IDX = ROOT + "/site/index.html"
PRIV = ROOT + "/site/privacy.html"
SW  = ROOT + "/site/sw.js"

s = io.open(IDX, encoding="utf-8").read()
if "gtag('consent'" in s:
    print("Already applied (found consent mode). Skipping index.html."); sys.exit(0)

# 1) Consent Mode v2 default-denied BEFORE the AdSense loader.
old_loader = '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3349895945204021" crossorigin="anonymous"></script>'
new_block = '''<!-- Google Consent Mode v2 (EU User Consent Policy): everything denied by default until
     Google's certified CMP records the user's choice. Required for EEA / UK / Switzerland. -->
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500
  });
</script>
''' + old_loader
assert old_loader in s, "AdSense loader anchor not found"
s = s.replace(old_loader, new_block, 1)
io.open(IDX, "w", encoding="utf-8").write(s)
print("index.html: Consent Mode v2 added.")

# 2) Privacy policy: consent disclosure
p = io.open(PRIV, encoding="utf-8").read()
old_ads = '''  for details and opt-out options. DriverLog does not share your account email or driving
  entries with advertisers.</p>'''
new_ads = old_ads + '''
  <p><strong>Consent (EEA, UK &amp; Switzerland).</strong> For visitors in these regions, ads
  follow Google's EU User Consent Policy. We use a Google-certified Consent Management Platform
  (integrated with the IAB Transparency &amp; Consent Framework) to request your consent before
  any personalized ads or non-essential cookies are used; by default consent is set to
  "denied" until you choose. You can change or withdraw consent any time from the privacy /
  consent prompt, and manage Google ad personalization at
  <a href="https://myadcenter.google.com">myadcenter.google.com</a>.</p>'''
if new_ads.split('\n',1)[1][:40] in p:
    print("privacy.html already has consent note (skipped).")
elif old_ads in p:
    p = p.replace(old_ads, new_ads, 1); io.open(PRIV,"w",encoding="utf-8").write(p); print("privacy.html: consent note added.")
else:
    print("privacy.html anchor not found (skipped).")

# 3) bump service worker
sw = io.open(SW, encoding="utf-8").read()
sw2 = re.sub(r"const SW_VERSION = 'v[0-9.]+';", "const SW_VERSION = 'v1.4.2';", sw, count=1)
if sw2 != sw: io.open(SW,"w",encoding="utf-8").write(sw2); print("sw.js bumped to v1.4.2.")
print("DONE.")
PYEOF
echo "==> Done. Publish the AdSense GDPR message, then deploy site/."
