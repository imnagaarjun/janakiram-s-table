# HSJ Print Agent

A lightweight Node.js agent that runs on your Windows hub PC and relays print jobs from Supabase to connected thermal printers (USB or network/IP).

## How it works

```
Any device (phone/tablet/PC)
  → inserts row into Supabase print_jobs table
    → agent picks it up via Realtime (<1 second)
      → renders ESC/POS bytes → sends to correct printer
```

No polling, no browser dialogs, works from any device on any network.

---

## Prerequisites

- Windows 10/11
- Node.js 18+ installed ([nodejs.org](https://nodejs.org))
- Thermal printer(s) connected via USB or network (IP)
- Supabase project with the three printer tables created (see SQL below)

---

## Step 1 — Run the SQL in Supabase

Open your Supabase project → SQL Editor → paste and run:

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

---

## Step 2 — Set up the agent on the Windows PC

```cmd
cd hsj-print-agent
copy .env.example .env
npm install
```

Edit `.env` with your values:
```
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
RESTAURANT_ID=your-restaurant-uuid-here
```

- **SUPABASE_URL**: Supabase project → Settings → API → Project URL
- **SUPABASE_SERVICE_ROLE_KEY**: Supabase project → Settings → API → service_role key (keep secret!)
- **RESTAURANT_ID**: the UUID of your restaurant row in the `restaurants` table

---

## Step 3 — Test it

```cmd
node index.js
```

You should see:
```
HSJ Print Agent starting — restaurant <your-id>
Realtime subscription: SUBSCRIBED
Agent running. Waiting for print jobs...
```

---

## Step 4 — Register printers in the app

1. Open the POS app → Settings → **Printers**
2. Under **Devices**, click **Add device**:
   - **USB thermal**: enter the Windows printer name exactly as it appears in Control Panel → Devices and Printers (e.g. `TVS-E RP3200 Star`)
   - **Network thermal**: enter the printer's IP address and port (default 9100)
3. Under **Assignments**, for each print type (Dining KOT, Dining Bill, etc.) pick the device and set copies

---

## Step 5 — Auto-start on Windows boot (optional)

Run **once as Administrator**:

```cmd
node install-service.js
```

To uninstall the service:

```cmd
node install-service.js --uninstall
```

---

## Finding the Windows USB printer name

1. Open **Control Panel → Devices and Printers**
2. Find your thermal printer, note the exact name shown (e.g. `EPSON TM-T82III`)
3. Use that name exactly in the **USB Name** field when adding the device in Settings

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "Device not found" | Check the Windows printer name — must match exactly |
| Network printer times out | Verify the printer IP and that port 9100 is reachable (`telnet <ip> 9100`) |
| Jobs stuck at "pending" | Check the agent console for errors; ensure `.env` values are correct |
| Agent won't start | Run `npm install` again; check Node.js version (`node --version` ≥ 18) |
