FLUX HAVEN — COMPLETE NEW-FEATURE UPDATE

Website files to upload/replace in GitHub/Vercel:
- index.html
- app.js
- styles.css
- manifest.json
- sw.js
- icons/icon-192.png
- icons/icon-512.png

Supabase:
Run only:
- supabase/SUPABASE_WEALTH_LUCKYHEART_WITHDRAWAL_UPDATE.sql

The earlier REPAIR_GIFT_HISTORY_ONLY_FINAL_V2.sql was already used to repair Surprise Gift History and is NOT included as a required second step here.

Current feature specification in this update:
- F/H Wealth Center: 3 plans, VIP1–VIP6 access, circular progress, server-side calculations.
- Lucky Heart: 24/7, VIP1–VIP6, one spin earned per direct referral that newly activates VIP1–VIP6 on that calendar day, actual eligible displayed rewards ₦699/₦1,999/₦2,999, server-side spin/reward and History record.
- Withdrawal: adds ₦5,000 and enforces one withdrawal request per Lagos calendar day while preserving the one-pending safety protection.
- PWA: install manifest, service worker, icons, and install prompt when supported.

Important: This package was statically cross-checked and syntax-checked. The live Supabase SQL still needs to be executed in your project to install the new database functions/tables.
