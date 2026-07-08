/**
 * The fixture "invoice app" as a self-contained HTML string.
 *
 * Two responsibilities beyond being a realistic record target:
 *  1. Distinct effect surfaces — a readonly search, a mutating status edit, and
 *     a destructive delete — so effect-tagging and the safety gate have real
 *     cases to bite on.
 *  2. Selector variance via `variant` — variant "b" renames test attributes and
 *     drops ids so a skill recorded on "a" fails its primary selectors on "b".
 *     That is the deterministic break the M3 heal path needs.
 */
export type Variant = "a" | "b";

export function renderPage(variant: Variant = "a"): string {
  // Variant b shifts the fragile selectors (ids + test attributes) while
  // keeping ARIA names stable — mirroring a real UI refactor that a heal
  // should survive by falling back down the selector stack.
  const testAttr = variant === "a" ? "data-testid" : "data-qa";
  const searchId = variant === "a" ? 'id="invoice-search"' : "";
  const deleteTestId = variant === "a" ? "delete-invoice" : "row-delete";

  const fillerRow = (inv, status) => `
        <tr data-invoice="${inv}">
          <td class="mono">${inv}</td>
          <td><span class="status status-${status}">${status}</span></td>
          <td class="actions">
            <button type="button" aria-label="Approve invoice ${inv}" ${testAttr}="approve-invoice">Approve</button>
            <button type="button" class="danger" aria-label="Delete invoice ${inv}" ${testAttr}="${deleteTestId}">Delete</button>
          </td>
        </tr>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Acme Billing · Invoices</title>
  <style>
    :root { --bg:#eef1f7; --card:#fff; --ink:#1a2230; --muted:#6b7688; --line:#e6e9f0;
            --brand:#3b5bfd; --danger:#e5484d; --ok:#30a46c; --warn:#f5a623; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--ink);
           font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
    main { max-width:860px; margin:36px auto; background:var(--card); border-radius:16px;
           box-shadow:0 10px 40px rgba(20,30,60,.10); overflow:hidden; }
    header { display:flex; align-items:center; justify-content:space-between;
             padding:20px 28px; border-bottom:1px solid var(--line); }
    header h1 { font-size:20px; margin:0; letter-spacing:-.02em; }
    header h1 b { color:var(--brand); }
    .login { display:flex; gap:10px; align-items:center; }
    .login input { border:1px solid var(--line); border-radius:8px; padding:7px 10px; font-size:13px; width:120px; }
    .login button { border:0; background:var(--ink); color:#fff; border-radius:8px; padding:8px 14px; font-size:13px; cursor:pointer; }
    .toolbar { padding:18px 28px 6px; }
    .toolbar input { width:100%; border:1px solid var(--line); border-radius:10px; padding:11px 14px; font-size:14px; }
    table { width:100%; border-collapse:collapse; margin-top:8px; }
    thead th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.08em;
               color:var(--muted); padding:12px 28px; border-bottom:1px solid var(--line); }
    tbody td { padding:16px 28px; border-bottom:1px solid var(--line); vertical-align:middle; }
    .mono { font-family:ui-monospace,Menlo,monospace; font-weight:600; }
    .status { font-size:12px; font-weight:600; padding:3px 10px; border-radius:999px; }
    .status-pending { background:#fff4e0; color:#9a6400; }
    .status-approved { background:#e6f6ee; color:var(--ok); }
    .status-paid { background:#eaf0ff; color:var(--brand); }
    .actions { text-align:right; white-space:nowrap; }
    .actions button { border:1px solid var(--line); background:#fff; color:var(--ink);
                      border-radius:8px; padding:7px 14px; font-size:13px; font-weight:500; cursor:pointer; margin-left:8px; }
    .actions button:hover { border-color:var(--brand); color:var(--brand); }
    .actions button.danger:hover { border-color:var(--danger); color:var(--danger); background:#fff5f5; }
    #result { margin:0; padding:14px 28px; color:var(--muted); font-size:13px; min-height:20px;
              background:#fafbff; border-top:1px solid var(--line); }
    #result:not(:empty)::before { content:"✓ "; color:var(--ok); font-weight:700; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1><b>Acme</b> Billing · Invoices</h1>
      <form class="login" aria-label="Session login" id="login-form">
        <input type="text" name="username" aria-label="Username" ${testAttr}="username" placeholder="user" />
        <input type="password" name="password" aria-label="Password" ${testAttr}="password" placeholder="password" />
        <button type="button" aria-label="Sign in" ${testAttr}="sign-in">Sign in</button>
      </form>
    </header>

    <div class="toolbar">
      <input type="text" ${searchId} aria-label="Search invoices" ${testAttr}="search" placeholder="Search by invoice number…" />
      <select aria-label="Status filter" ${testAttr}="status-filter">
        <option value="all">All</option>
        <option value="pending">Pending</option>
        <option value="paid">Paid</option>
      </select>
    </div>

    <table>
      <thead><tr><th>Invoice</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody id="invoice-rows">
        <tr data-invoice="INV-001">
          <td class="mono">INV-001</td>
          <td><span class="status status-pending">pending</span></td>
          <td class="actions">
            <button type="button" aria-label="Approve invoice INV-001" ${testAttr}="approve-invoice">Approve</button>
            <button type="button" class="danger" aria-label="Delete invoice INV-001" ${testAttr}="${deleteTestId}">Delete</button>
          </td>
        </tr>${fillerRow("INV-1042", "pending")}${fillerRow("INV-2251", "paid")}
      </tbody>
    </table>

    <p id="result" role="status" aria-live="polite"></p>

    <iframe src="/frame" title="Embedded panel" style="width:100%;height:80px;border:1px solid var(--line);border-radius:10px;margin-top:16px"></iframe>
  </main>

  <script>
    // Actions mutate the DOM synchronously (so replay/assertions have observable
    // state) AND fire a fire-and-forget backend call, so there is real network
    // traffic whose HTTP method is the ground-truth effect (GET/POST/DELETE).
    var api = function (method, path) {
      try { fetch(path, { method: method }).catch(function () {}); } catch (e) {}
    };
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const label = t.getAttribute("aria-label") || "";
      const result = document.getElementById("result");
      if (label.startsWith("Approve invoice")) {
        const inv = label.replace("Approve invoice ", "");
        api("POST", "/api/invoices/" + inv + "/approve");
        const row = t.closest("tr");
        if (row) row.querySelector(".status").textContent = "approved";
        result.textContent = "Approved " + inv;
      } else if (label.startsWith("Delete invoice")) {
        const row = t.closest("tr");
        const inv = row && row.getAttribute("data-invoice");
        api("DELETE", "/api/invoices/" + inv);
        if (row) row.remove();
        result.textContent = "Deleted " + inv;
      } else if (label === "Sign in") {
        api("POST", "/api/session");
        result.textContent = "Signed in";
      }
    });
    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t instanceof HTMLElement && (t.getAttribute("aria-label") || "").startsWith("Search")) {
        api("GET", "/api/invoices?q=" + encodeURIComponent(t.value || ""));
      }
    });
    document.addEventListener("keydown", (e) => {
      const t = e.target;
      if (e.key === "Enter" && t instanceof HTMLElement && (t.getAttribute("aria-label") || "").startsWith("Search")) {
        document.getElementById("result").textContent = "Searched " + (t.value || "");
      }
    });
  </script>
</body>
</html>`;
}
