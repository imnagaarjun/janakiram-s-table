"use strict";
/**
 * Installs hsj-print-agent as a Windows service so it starts automatically on boot.
 * Run once as Administrator: node install-service.js
 * To uninstall: node install-service.js --uninstall
 */

const { Service } = require("node-windows");
const path = require("path");

const svc = new Service({
  name: "HSJ Print Agent",
  description: "Hotel Sri Janakiram — thermal printer relay agent",
  script: path.join(__dirname, "index.js"),
  nodeOptions: [],
  workingDirectory: __dirname,
});

const uninstall = process.argv.includes("--uninstall");

svc.on("install", () => {
  console.log("Service installed. Starting...");
  svc.start();
});
svc.on("start", () => console.log("Service started. HSJ Print Agent is running."));
svc.on("uninstall", () => console.log("Service uninstalled."));
svc.on("error", (err) => console.error("Service error:", err));

if (uninstall) {
  svc.uninstall();
} else {
  svc.install();
}
