// =============================================================
// tpo_base.js
// Handles: Logout confirmation, User Dropdown, Theme Toggle
// =============================================================

document.addEventListener("DOMContentLoaded", function () {
  const logoutBtn = document.getElementById("logoutBtn");

  // Logout confirmation
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function (e) {
      if (!confirm("Are you sure you want to logout?")) {
        e.preventDefault();
      }
    });
  }

  // Dark / Light Mode Toggle
  const themeToggleBtns = document.querySelectorAll(".theme-toggle");
  if (themeToggleBtns.length > 0) {
    const savedTheme = localStorage.getItem("theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);

    const applyTheme = (theme) => {
      if (theme === "dark") {
        document.body.classList.add("dark-mode");
        themeToggleBtns.forEach(btn => btn.classList.add("active"));
      } else {
        document.body.classList.remove("dark-mode");
        themeToggleBtns.forEach(btn => btn.classList.remove("active"));
      }
    };

    applyTheme(savedTheme);

    themeToggleBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const currentTheme = document.documentElement.getAttribute("data-theme");
        const newTheme = currentTheme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem("theme", newTheme);
        applyTheme(newTheme);
        window.dispatchEvent(new CustomEvent("themechange", { detail: { theme: newTheme } }));
      });
    });
  }
});
