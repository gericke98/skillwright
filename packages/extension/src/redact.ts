/**
 * Capture-time secret redaction (D17, §5.2). The implementation now lives in
 * `@bskill/shared` so the extension's capture pass and the CLI distiller's
 * second-pass net (§9) share exactly one redaction policy. Re-exported here so
 * existing capture/session imports keep working.
 */
export { redactValue, redactUrl, valueLooksSecret, PLACEHOLDER, type FieldMeta } from "@bskill/shared";
