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

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Fixture Invoices</title>
</head>
<body>
  <main>
    <h1>Invoices</h1>

    <form aria-label="Session login" id="login-form">
      <label>Username <input type="text" name="username" aria-label="Username" ${testAttr}="username" /></label>
      <label>Password <input type="password" name="password" aria-label="Password" ${testAttr}="password" /></label>
      <button type="button" aria-label="Sign in" ${testAttr}="sign-in">Sign in</button>
    </form>

    <label>Search <input type="text" ${searchId} aria-label="Search invoices" ${testAttr}="search" placeholder="Invoice number" /></label>

    <table>
      <thead><tr><th>Invoice</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody id="invoice-rows">
        <tr data-invoice="INV-001">
          <td>INV-001</td>
          <td class="status">pending</td>
          <td>
            <button type="button" aria-label="Approve invoice INV-001" ${testAttr}="approve-invoice">Approve</button>
            <button type="button" aria-label="Delete invoice INV-001" ${testAttr}="${deleteTestId}">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>

    <p id="result" role="status" aria-live="polite"></p>
  </main>

  <script>
    // Deterministic, no network. Actions mutate the DOM so a replay/assertion
    // has observable state to check.
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const label = t.getAttribute("aria-label") || "";
      const result = document.getElementById("result");
      if (label.startsWith("Approve invoice")) {
        const row = t.closest("tr");
        if (row) row.querySelector(".status").textContent = "approved";
        result.textContent = "Approved " + label.replace("Approve invoice ", "");
      } else if (label.startsWith("Delete invoice")) {
        const row = t.closest("tr");
        const inv = row && row.getAttribute("data-invoice");
        if (row) row.remove();
        result.textContent = "Deleted " + inv;
      } else if (label === "Sign in") {
        result.textContent = "Signed in";
      }
    });
  </script>
</body>
</html>`;
}
