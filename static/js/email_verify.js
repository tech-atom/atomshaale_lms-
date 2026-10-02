document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector(".verify-form");
  const password1 = document.getElementById("id_new_password1");
  const password2 = document.getElementById("id_new_password2");

  const popupHost = document.createElement("div");
  popupHost.className = "verify-popup-host";
  document.body.appendChild(popupHost);

  function normalizeLevel(level) {
    if (!level) return "info";
    if (level.includes("error") || level.includes("danger")) return "error";
    if (level.includes("success")) return "success";
    if (level.includes("warning")) return "warning";
    return "info";
  }

  function showPopup(message, level = "info", duration = 2600) {
    const toast = document.createElement("div");
    toast.className = `verify-popup popup-${normalizeLevel(level)}`;
    toast.textContent = message;
    popupHost.appendChild(toast);

    setTimeout(() => toast.classList.add("show"), 30);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 220);
    }, duration);
  }

  const serverPopups = document.querySelectorAll("#server-popups .popup-message");
  serverPopups.forEach((item, index) => {
    const text = (item.textContent || "").trim();
    if (!text) return;
    setTimeout(() => showPopup(text, item.dataset.level || "info"), index * 260);
  });

  document.querySelectorAll(".toggle-password").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const targetId = toggle.getAttribute("data-target");
      const input = document.getElementById(targetId);
      if (!input) return;

      const nextType = input.type === "password" ? "text" : "password";
      input.type = nextType;
      toggle.textContent = nextType === "password" ? "Show" : "Hide";
      toggle.setAttribute("aria-label", nextType === "password" ? "Show password" : "Hide password");
    });
  });

  const rules = {
    length: (value) => value.length >= 8,
    upper: (value) => /[A-Z]/.test(value),
    lower: (value) => /[a-z]/.test(value),
    number: (value) => /\d/.test(value),
    special: (value) => /[^A-Za-z0-9]/.test(value),
    match: (value) => value.length > 0 && value === (password2 ? password2.value : ""),
  };

  function setRuleState(ruleName, isValid) {
    const el = document.querySelector(`[data-rule="${ruleName}"]`);
    if (!el) return;
    el.classList.toggle("valid", !!isValid);
    el.classList.toggle("invalid", !isValid);
  }

  function validatePassword(showSubmitPopup = false) {
    if (!password1 || !password2) return true;

    const p1 = password1.value || "";
    const allValid = Object.keys(rules).every((ruleName) => {
      const valid = rules[ruleName](p1);
      setRuleState(ruleName, valid);
      return valid;
    });

    if (showSubmitPopup && !allValid) {
      showPopup("Please satisfy all password rules before submitting.", "error");
    }

    return allValid;
  }

  if (password1 && password2) {
    password1.addEventListener("input", () => validatePassword(false));
    password2.addEventListener("input", () => validatePassword(false));
    validatePassword(false);
  }

  if (form) {
    form.addEventListener("submit", (event) => {
      if (!validatePassword(true)) {
        event.preventDefault();
      }
    });
  }
});
