document.addEventListener("DOMContentLoaded", function () {
  const body = document.body;
  const sidebar = document.getElementById("sidebar");
  const toggle = document.getElementById("mobileNavToggle");
  const backdrop = document.getElementById("sidebarBackdrop");

  if (!sidebar || !toggle || !backdrop) {
    return;
  }

  const setOpen = (open) => {
    body.classList.toggle("sidebar-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  };

  toggle.addEventListener("click", function () {
    setOpen(!body.classList.contains("sidebar-open"));
  });

  backdrop.addEventListener("click", function () {
    setOpen(false);
  });

  sidebar.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", function () {
      if (window.innerWidth <= 991) {
        setOpen(false);
      }
    });
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      setOpen(false);
    }
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth > 991) {
      setOpen(false);
    }
  });
});