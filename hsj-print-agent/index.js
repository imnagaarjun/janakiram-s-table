"use strict";
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const { renderKOT, renderBill } = require("./escpos-renderer");

const SUPABASE_URL            = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESTAURANT_ID           = process.env.RESTAURANT_ID;
const HUB_ID                  = process.env.HUB_ID || null;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !RESTAURANT_ID) {
  console.error("Missing env vars. Copy .env.example → .env and fill in the values.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ──────────────────────────────────────────────────────────────────────────────
// Printer drivers (lazy-loaded so agent starts even if USB not plugged in yet)
// ──────────────────────────────────────────────────────────────────────────────

let escposUsb, escposNetwork, escpos;

function loadDrivers() {
  if (!escpos) {
    try { escpos = require("escpos"); escpos.USB = require("escpos-usb"); } catch {}
    try { escposNetwork = require("escpos-network"); } catch {}
  }
}

async function fetchDevice(deviceId) {
  const { data, error } = await supabase
    .from("printer_devices")
    .select("*")
    .eq("id", deviceId)
    .maybeSingle();
  if (error || !data) throw new Error(`Device ${deviceId} not found: ${error?.message}`);
  return data;
}

async function sendRaw(device, buffer) {
  loadDrivers();

  if (device.type === "network_thermal") {
    const Network = escposNetwork || require("escpos-network");
    const dev = new Network(device.net_host, device.net_port ?? 9100);
    await new Promise((resolve, reject) => {
      dev.open((err) => {
        if (err) return reject(err);
        const printer = new (require("escpos").Printer)(dev);
        dev.write(buffer);
        printer.cut().close();
        resolve();
      });
    });
    return;
  }

  // USB: use Windows printer name via raw socket to \\.\printername
  // escpos-usb on Windows enumerates by USB descriptor. Simpler: use net.createConnection to LPT
  // Fallback: write raw bytes through a named pipe / Windows spooler via child_process
  const { execSync } = require("child_process");
  const os = require("os");
  const fs = require("fs");
  const path = require("path");
  const tmpFile = path.join(os.tmpdir(), `hsj_print_${Date.now()}.bin`);
  fs.writeFileSync(tmpFile, buffer);
  try {
    // Raw print to Windows printer name (works for ESC/POS receipt printers)
    execSync(`copy /b "${tmpFile}" "\\\\\\\\localhost\\\\${device.usb_name}"`, { shell: "cmd.exe" });
  } catch {
    // Fallback: try using PRINT command
    execSync(`print /D:"${device.usb_name}" "${tmpFile}"`, { shell: "cmd.exe" });
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Job processor
// ──────────────────────────────────────────────────────────────────────────────

async function processJob(job) {
  console.log(`Processing job ${job.id} (${job.job_type})`);

  // Mark as printing
  await supabase.from("print_jobs").update({ status: "printing" }).eq("id", job.id);

  try {
    const device = await fetchDevice(job.device_id);

    // Multi-hub: if this agent has a HUB_ID set, skip jobs whose device belongs to a different hub
    if (HUB_ID && device.hub_id && device.hub_id !== HUB_ID) {
      console.log(`Job ${job.id} is for hub "${device.hub_id}", this hub is "${HUB_ID}" — skipping`);
      await supabase.from("print_jobs").update({ status: "pending" }).eq("id", job.id);
      return;
    }
    const payload = job.payload;
    const copies  = job.copies ?? 1;

    let buffer;
    if (job.job_type.endsWith("_kot")) {
      buffer = renderKOT(payload);
      if (copies > 1) buffer = Buffer.concat(Array.from({ length: copies }, () => buffer));
    } else {
      buffer = renderBill(payload, copies);
    }

    await sendRaw(device, buffer);

    await supabase.from("print_jobs").update({
      status: "done",
      processed_at: new Date().toISOString(),
    }).eq("id", job.id);

    console.log(`Job ${job.id} done`);
  } catch (err) {
    console.error(`Job ${job.id} failed:`, err.message);
    await supabase.from("print_jobs").update({
      status: "error",
      error_message: err.message,
      processed_at: new Date().toISOString(),
    }).eq("id", job.id);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main: subscribe + catch-up pending jobs
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`HSJ Print Agent starting — restaurant ${RESTAURANT_ID}`);

  // Subscribe to new print jobs
  supabase
    .channel("print-jobs")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "print_jobs",
        filter: `restaurant_id=eq.${RESTAURANT_ID}`,
      },
      async (payload) => {
        const job = payload.new;
        if (job.status !== "pending") return;
        await processJob(job);
      },
    )
    .subscribe((status) => {
      console.log("Realtime subscription:", status);
    });

  // Pick up any pending jobs from before agent started (e.g. after reboot)
  const { data: pending } = await supabase
    .from("print_jobs")
    .select("*")
    .eq("restaurant_id", RESTAURANT_ID)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (pending && pending.length > 0) {
    console.log(`Catching up ${pending.length} pending job(s)...`);
    for (const job of pending) {
      await processJob(job);
    }
  }

  console.log("Agent running. Waiting for print jobs...");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
