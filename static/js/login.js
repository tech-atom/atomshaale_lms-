document.addEventListener("DOMContentLoaded", function () {
  console.log(" Atom Shaale Login JS initialized");

  // ==========================================
  // 1. Popup Notifications (Django Messages)
  // ==========================================
  const popupHost = document.getElementById("loginPopupHost") || (() => {
    const host = document.createElement("div");
    host.id = "loginPopupHost";
    host.className = "login-popup-host";
    document.body.appendChild(host);
    return host;
  })();

  function normalizeLevel(level) {
    if (!level) return "info";
    if (level.includes("error") || level.includes("danger")) return "error";
    if (level.includes("success")) return "success";
    if (level.includes("warning")) return "warning";
    return "info";
  }

  function showPopup(message, level, delay) {
    const toast = document.createElement("div");
    const normLevel = normalizeLevel(level);
    toast.className = `login-popup popup-${normLevel}`;

    let iconClass = "fa-circle-info";
    if (normLevel === "error") iconClass = "fa-circle-exclamation";
    if (normLevel === "warning") iconClass = "fa-triangle-exclamation";
    if (normLevel === "success") iconClass = "fa-circle-check";

    toast.innerHTML = `<i class="fas ${iconClass}"></i><span>${message}</span>`;
    popupHost.appendChild(toast);

    setTimeout(() => toast.classList.add("show"), 30);

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 350);
    }, delay || 2800);
  }

  const popupSource = document.getElementById("server-popups");
  const redirectUrl = (document.body.dataset.loginRedirectUrl || "").trim();
  const messages = popupSource
    ? Array.from(popupSource.querySelectorAll(".popup-message")).map((el) => ({
      text: (el.textContent || "").trim(),
      level: el.dataset.level || "info",
    }))
    : [];

  messages.forEach((msg, index) => {
    const level = normalizeLevel(msg.level);
    setTimeout(() => {
      showPopup(msg.text, level, level === "success" ? 5000 : 2800);
    }, index * 300);
  });

  if (redirectUrl) {
    window.location.href = redirectUrl;
  }

  // ==========================================
  // 2. Password Visibility Toggle
  // ==========================================
  const togglePasswordBtn = document.getElementById("togglePassword");
  if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener("click", function (e) {
      e.preventDefault();
      const inputControl = this.closest(".input-control");
      const pwdInput = inputControl ? inputControl.querySelector('input') : null;
      if (!pwdInput) return;

      const isPassword = pwdInput.getAttribute("type") === "password";
      pwdInput.setAttribute("type", isPassword ? "text" : "password");

      const icon = this.querySelector("i");
      if (icon) {
        if (isPassword) {
          icon.classList.remove("fa-eye", "far");
          icon.classList.add("fa-eye-slash", "fas");
        } else {
          icon.classList.remove("fa-eye-slash", "fas");
          icon.classList.add("fa-eye", "far");
        }
      }
      this.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
    });
  }

  // ==========================================
  // 3. Halftone Dot Grid & Particle Canvas
  // ==========================================
  const canvas = document.getElementById("particleCanvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    let particles = [];
    const numParticles = 75;

    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    for (let i = 0; i < numParticles; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.8 + 1,
        dx: (Math.random() - 0.5) * 0.4,
        dy: (Math.random() - 0.5) * 0.4,
        color: Math.random() > 0.4 ? "#008037" : "#cccccc",
        alpha: Math.random() * 0.35 + 0.15,
      });
    }

    function drawHalftoneBackground() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw subtle background particle grid
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();

        // Connect nearby particles with delicate green/gray lines
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (dist < 110) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = "#008037";
            ctx.globalAlpha = (1 - dist / 110) * 0.12;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1.0;
    }

    function updateParticles() {
      for (const p of particles) {
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
      }
    }

    function animate() {
      drawHalftoneBackground();
      updateParticles();
      requestAnimationFrame(animate);
    }

    animate();
  }
});
