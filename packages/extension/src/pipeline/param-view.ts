import type { FinalParam } from "@skillwright/shared";

/** A secret param per the hardened floor in `reconcileParams`: `confidence
 * === "high"` is set ONLY for params forced by `secretNames` in the shared
 * reconciler (see packages/shared/src/parameterize/reconcile.ts, step 5). It
 * can never be demoted to a constant from this UI. */
function isSecret(param: FinalParam): boolean {
  return param.confidence === "high";
}

export interface ParamViewHandlers {
  onApprove(params: FinalParam[]): void;
}

/**
 * Renders one editable row per `FinalParam` plus a single approve button.
 *
 * Pure/injectable: takes the container and data as arguments, wires no
 * global/chrome API, and is fully unit-testable (see
 * test/panel-parameterize.test.ts). `panel.ts` is responsible for supplying
 * the container element and handling the emitted `onApprove` payload.
 *
 * Security: every interpolated value is untrusted (LLM-authored) and is set
 * via `textContent` / `createElement`, never via innerHTML string
 * concatenation, so a param name/rationale containing markup can never
 * execute as HTML.
 *
 * Secret hardening: a param with `confidence === "high"` is a secret (the
 * shared reconciler's hardened floor sets exactly this for a param it forced
 * in). Its `.param-include` checkbox is rendered checked + disabled so it
 * cannot be demoted to a constant from the UI, and `onApprove` recomputes
 * inclusion from the source `params` array for secrets — it never trusts a
 * disabled input's live DOM state, which could be tampered with via
 * devtools/JS regardless of the `disabled` attribute.
 */
export function renderParamApproval(container: HTMLElement, params: FinalParam[], handlers: ParamViewHandlers): void {
  container.innerHTML = "";

  const includeInputs: HTMLInputElement[] = [];
  const requiredInputs: HTMLInputElement[] = [];

  params.forEach((param, i) => {
    const secret = isSecret(param);

    const row = document.createElement("div");
    row.className = secret ? "param-row param-secret" : "param-row";

    const nameEl = document.createElement("span");
    nameEl.className = "param-name";
    nameEl.textContent = param.name;
    row.appendChild(nameEl);

    const typeEl = document.createElement("span");
    typeEl.className = "param-type";
    typeEl.textContent = param.type;
    row.appendChild(typeEl);

    const demoEl = document.createElement("span");
    demoEl.className = "param-demo";
    demoEl.textContent = param.demoValue;
    row.appendChild(demoEl);

    const rationaleEl = document.createElement("span");
    rationaleEl.className = "param-rationale";
    rationaleEl.textContent = param.rationale;
    row.appendChild(rationaleEl);

    const requiredLabel = document.createElement("label");
    requiredLabel.className = "param-required-label";
    const requiredInput = document.createElement("input");
    requiredInput.type = "checkbox";
    requiredInput.className = "param-required";
    requiredInput.checked = param.required;
    requiredLabel.appendChild(requiredInput);
    requiredLabel.appendChild(document.createTextNode("required"));
    row.appendChild(requiredLabel);

    const includeLabel = document.createElement("label");
    includeLabel.className = "param-include-label";
    const includeInput = document.createElement("input");
    includeInput.type = "checkbox";
    includeInput.className = "param-include";
    includeInput.checked = true;
    if (secret) includeInput.disabled = true;
    includeLabel.appendChild(includeInput);
    includeLabel.appendChild(document.createTextNode("variable"));
    row.appendChild(includeLabel);

    container.appendChild(row);
    includeInputs[i] = includeInput;
    requiredInputs[i] = requiredInput;
  });

  const approveButton = document.createElement("button");
  approveButton.id = "approve-params";
  approveButton.textContent = "Approve";
  approveButton.addEventListener("click", () => {
    const edited = params
      .map((param, i) => ({ ...param, required: requiredInputs[i]!.checked }))
      // Recompute inclusion from source `params`, not the (possibly
      // tampered) DOM: a secret is ALWAYS included, regardless of the
      // disabled checkbox's live `.checked` state.
      .filter((param, i) => isSecret(param) || includeInputs[i]!.checked);
    handlers.onApprove(edited);
  });
  container.appendChild(approveButton);
}
