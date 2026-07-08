import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "bskill recorder",
  version: "0.0.1",
  description: "Record a browser task once; replay it as a portable Agent Skill.",
  action: { default_title: "bskill" },
  background: { service_worker: "src/background.ts", type: "module" },
  side_panel: { default_path: "src/panel.html" },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content.ts"],
      run_at: "document_start",
      all_frames: true,
    },
  ],
  permissions: [
    "debugger",
    "tabs",
    "downloads",
    "storage",
    "sidePanel",
    "webNavigation",
    "scripting",
  ],
  host_permissions: ["<all_urls>"],
});
