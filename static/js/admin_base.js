// =============================================================
// admin_base.js
// Handles: Dark Mode Toggle, User Dropdown
// =============================================================

document.addEventListener("DOMContentLoaded", function () {
  // const toggleBtn = document.getElementById("darkModeToggle");
  const dropdown = document.getElementById("userDropdown");
  const userToggle = document.getElementById("userToggle");

  // =============================================================
  // Initialize Dark Mode from localStorage
  // =============================================================
  // const savedTheme = localStorage.getItem("theme") || "light";
  // document.documentElement.setAttribute("data-theme", savedTheme);

  // if (savedTheme === "dark") {
  //   document.body.classList.add("dark-mode");
  //   if (toggleBtn) toggleBtn.textContent = "☀️ Light Mode";
  // } else {
  //   document.body.classList.remove("dark-mode");
  //   if (toggleBtn) toggleBtn.textContent = "🌙 Dark Mode";
  // }

  // =============================================================
  // Dark Mode Toggle Logic
  // =============================================================
  // if (toggleBtn) {
  //   toggleBtn.addEventListener("click", () => {
  //     const currentTheme = document.documentElement.getAttribute("data-theme");
  //     const newTheme = currentTheme === "dark" ? "light" : "dark";
  //     document.documentElement.setAttribute("data-theme", newTheme);
  //     localStorage.setItem("theme", newTheme);

  //     // Apply class & update button icon/text
  //     if (newTheme === "dark") {
  //       document.body.classList.add("dark-mode");
  //       toggleBtn.textContent = "☀️ Light Mode";
  //     } else {
  //       document.body.classList.remove("dark-mode");
  //       toggleBtn.textContent = "🌙 Dark Mode";
  //     }
  //   });
  // }

  // =============================================================
  // Dropdown Toggle Logic
  // =============================================================
  if (userToggle && dropdown) {
    userToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      dropdown.classList.toggle("show");
    });

    // Close dropdown on outside click
    window.addEventListener("click", function (e) {
      if (!e.target.closest("#userDropdown") && !e.target.closest("#userToggle")) {
        dropdown.classList.remove("show");
      }
    });
  }
});
(function () {
  const mq = window.matchMedia('(max-width: 1024px)');
  const body = document.body;

  document.querySelectorAll('#sidebar .sidebar-nav a, #sidebar ul a').forEach(a => {
    a.addEventListener('click', () => {
      if (mq.matches) body.classList.remove('sidebar-open');
    });
  });

  // Ensure closed on initial load for mobile
  if (mq.matches) body.classList.remove('sidebar-open');
})();
