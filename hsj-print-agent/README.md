# HSJ Print Agent — Setup Guide

This agent runs on your Windows PC and relays print jobs from the POS app to your connected thermal printers. Once set up, pressing "Print KOT" or "Settle & Print" on any phone, tablet, or PC will print directly on the physical printer — no browser dialog, no USB cable needed on the device.

```
Phone/Tablet → Supabase (cloud) → This agent on Windows PC → Thermal printer
```

---

## What you need

- [ ] A Windows 10 or Windows 11 PC that stays on during service hours
- [ ] Thermal printer(s) connected to that PC via USB **or** connected to the local network (IP printer)
- [ ] Internet connection on the PC
- [ ] The `hsj-print-agent` folder (from the GitHub repository)

---

## Step 1 — Install Node.js on the Windows PC

1. Open a browser on the Windows PC and go to **https://nodejs.org**
2. Click the big **LTS** button (the recommended version) to download the installer
3. Run the downloaded `.msi` file and click through the installer (all defaults are fine)
4. When it finishes, open **Command Prompt** (press `Windows key + R`, type `cmd`, press Enter)
5. Type `node --version` and press Enter — you should see something like `v22.x.x`

---

## Step 2 — Copy the agent folder to the PC

Copy the `hsj-print-agent` folder from the repository to the Windows PC. You can:
- Download a ZIP from GitHub and extract it
- Copy it via USB drive or shared network folder

Place it somewhere easy to find, for example: `C:\hsj-print-agent\`

---

## Step 3 — Get your Supabase credentials

You need three values from Supabase. Open your Supabase project dashboard:

**Supabase URL and Service Role Key:**
1. Click **Project Settings** (gear icon, bottom-left)
2. Click **API** in the left menu
3. Copy **Project URL** — looks like `https://abcdefgh.supabase.co`
4. Scroll down to **Project API keys**
5. Copy the **service_role** key (click "Reveal" first) — starts with `eyJ...`

> ⚠️ Keep the service_role key secret. It bypasses all security rules.

**Restaurant ID:**
1. In Supabase, click **SQL Editor** (left menu)
2. Paste this and click **Run**:
   ```sql
   SELECT id FROM restaurants LIMIT 1;
   ```
3. Copy the UUID shown in the result (looks like `b977ffe7-82fe-4b05-...`)

---

## Step 4 — Configure the agent

1. In the `hsj-print-agent` folder, find the file called `.env.example`
2. Make a copy of it and name the copy `.env` (no `.example` at the end)
3. Open `.env` with Notepad and fill in your three values:

```
SUPABASE_URL=https://abcdefgh.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...your-key-here...
RESTAURANT_ID=b977ffe7-82fe-4b05-bac4-a9cc69ddc4a1
HUB_ID=
```

Leave `HUB_ID=` blank for now (only needed if you have more than one hub PC — see below).

Save and close the file.

---

## Step 5 — Install packages

1. Open **Command Prompt**
2. Navigate to the agent folder:
   ```cmd
   cd C:\hsj-print-agent
   ```
3. Run:
   ```cmd
   npm install
   ```
   This downloads the required libraries. It may take 1–2 minutes.

---

## Step 6 — Test run

In the same Command Prompt window, run:

```cmd
node index.js
```

You should see:
```
HSJ Print Agent starting — restaurant b977ffe7-...
Realtime subscription: SUBSCRIBED
Agent running. Waiting for print jobs...
```

If you see this, the agent is connected and ready. Leave this window open.

To stop it, press `Ctrl + C`.

---

## Step 7 — Register your printers in the POS app

Now tell the app which printers are connected to this PC:

1. Open the POS app → **Settings** → scroll down to **Printers**
2. Under **Registered printers**, click **Add printer**
3. Fill in the details:
   - **Printer name**: any label you choose (e.g. "Kitchen Printer" or "Counter Printer")
   - **Type**: choose USB Thermal or Network / IP Thermal
   - **For USB**: enter the Windows printer name (see "Finding the USB printer name" below)
   - **For Network**: enter the printer's IP address (e.g. `192.168.1.100`) and port (`9100`)
   - **Paper width**: 58mm or 80mm depending on your roll
4. Click **Add printer**
5. Under **Print type assignments**, select which printer handles each type:
   - Dining — KOT → Kitchen Printer
   - Dining — Bill → Counter Printer
   - etc.

---

## Step 8 — Auto-start on Windows boot (recommended)

So the agent starts automatically whenever the PC is turned on:

1. Right-click **Command Prompt** and choose **Run as administrator**
2. Navigate to the folder:
   ```cmd
   cd C:\hsj-print-agent
   ```
3. Run:
   ```cmd
   node install-service.js
   ```

That's it. The agent is now installed as a Windows service and will start automatically on boot.

To remove the service later:
```cmd
node install-service.js --uninstall
```

---

## Finding the USB printer name

The Windows printer name must match exactly what Windows calls the printer:

1. Click **Start** → **Settings** → **Bluetooth & devices** → **Printers & scanners**  
   *(or: Control Panel → Devices and Printers)*
2. Find your thermal printer in the list
3. The name shown (e.g. `EPSON TM-T82III`, `TVS-E RP3200 Star`) is what you enter in the app

---

## Multiple hub PCs

If you have **more than one Windows PC** (e.g. one at the counter, one in the kitchen), you need to tell each agent which printers it owns — otherwise both PCs would try to print the same job.

**How to set it up:**

1. **In the app** (Settings → Printers), when adding/editing each printer device, fill in the **Hub label** field:
   - Counter printers → `counter-pc`
   - Kitchen printers → `kitchen-pc`

2. **On each Windows PC**, edit the `.env` file and set `HUB_ID` to match:
   - Counter PC `.env`: `HUB_ID=counter-pc`
   - Kitchen PC `.env`: `HUB_ID=kitchen-pc`

Now each agent will only handle jobs for its own printers. Jobs for other hubs are left for the correct PC to pick up.

> **Single PC**: leave `HUB_ID=` blank and don't set Hub labels — the agent handles everything.

---

## SQL to run in Supabase (one-time setup)

If you haven't already created the printer tables, run this in Supabase → SQL Editor:

```sql
CREATE TABLE public.printer_devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  type          text NOT NULL DEFAULT 'usb_thermal',
  usb_name      text,
  net_host      text,
  net_port      int  DEFAULT 9100,
  paper_width   int  NOT NULL DEFAULT 80,
  is_active     boolean NOT NULL DEFAULT true,
  hub_id        text,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE public.printer_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "restaurant members" ON public.printer_devices
  USING (restaurant_id = (SELECT restaurant_id FROM profiles WHERE id = auth.uid()));

CREATE TABLE public.printer_assignments (
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  job_type      text NOT NULL,
  device_id     uuid REFERENCES printer_devices(id) ON DELETE SET NULL,
  copies        int NOT NULL DEFAULT 1,
  PRIMARY KEY (restaurant_id, job_type)
);
ALTER TABLE public.printer_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "restaurant members" ON public.printer_assignments
  USING (restaurant_id = (SELECT restaurant_id FROM profiles WHERE id = auth.uid()));

CREATE TABLE public.print_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  device_id       uuid REFERENCES printer_devices(id) ON DELETE SET NULL,
  job_type        text NOT NULL,
  payload         jsonb NOT NULL,
  copies          int NOT NULL DEFAULT 1,
  status          text NOT NULL DEFAULT 'pending',
  error_message   text,
  idempotency_key text,
  created_at      timestamptz DEFAULT now(),
  processed_at    timestamptz
);
ALTER TABLE public.print_jobs REPLICA IDENTITY FULL;
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insert" ON public.print_jobs FOR INSERT
  WITH CHECK (restaurant_id = (SELECT restaurant_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "select own" ON public.print_jobs FOR SELECT
  USING (restaurant_id = (SELECT restaurant_id FROM profiles WHERE id = auth.uid()));
```

If the tables already exist and you just need the `hub_id` column:
```sql
ALTER TABLE public.printer_devices ADD COLUMN IF NOT EXISTS hub_id text;
```

---

## Troubleshooting

| Symptom | What to check |
|---------|---------------|
| `node --version` not found | Node.js wasn't installed correctly — re-run the installer from nodejs.org |
| Agent crashes immediately | Check `.env` — all three values must be filled in with no extra spaces |
| "Realtime subscription: CHANNEL_ERROR" | Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are correct |
| Job shows "error" in Supabase | Open the agent console — the error message explains what went wrong |
| USB printer not found | The Windows printer name in Settings must match exactly — check Devices & Printers |
| Network printer times out | Verify the printer's IP address, and that port 9100 is reachable from this PC |
| Two PCs both print | Set `HUB_ID` in each PC's `.env` and Hub label on each printer device in Settings |
| Jobs stay "pending" forever | Check the agent is running; if you set HUB_ID, make sure the device has a matching Hub label |
