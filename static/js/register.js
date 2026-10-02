document.addEventListener("DOMContentLoaded", function () {
  console.log("Atom Shaale Register JS loaded");

  // === Password Visibility Toggles ===
  const togglePasswordVisibility = (toggleIconId, passwordFieldId) => {
    const toggleIcon = document.getElementById(toggleIconId);
    const passwordField = document.getElementById(passwordFieldId);

    if (toggleIcon && passwordField) {
      toggleIcon.addEventListener("click", function () {
        // Toggle input type
        const isPassword = passwordField.type === "password";
        passwordField.type = isPassword ? "text" : "password";

        // Toggle icon style
        toggleIcon.classList.toggle("fa-eye", !isPassword);
        toggleIcon.classList.toggle("fa-eye-slash", isPassword);
      });
    }
  };

  // Bind to fields
  togglePasswordVisibility("togglePassword", "id_password");
  togglePasswordVisibility("toggleConfirmPassword", "id_confirm_password");

  // === Mandatory @gmail.com Email Validation ===
  const emailInput = document.getElementById("id_email");
  if (emailInput) {
    const validateEmailDomain = () => {
      const val = emailInput.value.trim().toLowerCase();
      if (val && !val.endsWith("@gmail.com")) {
        emailInput.setCustomValidity("Email address must end with @gmail.com");
      } else {
        emailInput.setCustomValidity("");
      }
    };

    emailInput.addEventListener("input", validateEmailDomain);
    emailInput.addEventListener("blur", validateEmailDomain);
  }

  // === Mandatory Alphabetical Name Validation ===
  const nameInput = document.getElementById("id_first_name");
  if (nameInput) {
    const validateName = () => {
      const val = nameInput.value.trim();
      const regex = /^[a-zA-Z\s]+$/;
      if (val && !regex.test(val)) {
        nameInput.setCustomValidity("Name must contain only alphabetic characters and spaces.");
      } else {
        nameInput.setCustomValidity("");
      }
    };

    nameInput.addEventListener("input", validateName);
    nameInput.addEventListener("blur", validateName);
  }

  // === Auto-select Year based on Semester selection ===
  const semesterInput = document.getElementById("id_semester");
  const yearInput = document.getElementById("id_year");
  if (semesterInput && yearInput) {
    const updateYearFromSemester = () => {
      const semesterVal = parseInt(semesterInput.value, 10);
      if (!isNaN(semesterVal)) {
        // Map semesters to years:
        // Sem 1, 2 -> Year 1
        // Sem 3, 4 -> Year 2
        // Sem 5, 6 -> Year 3
        // Sem 7, 8 -> Year 4
        const calculatedYear = Math.ceil(semesterVal / 2);
        yearInput.value = calculatedYear;
      }
    };

    semesterInput.addEventListener("change", updateYearFromSemester);
    // Run initially in case there's a pre-selected value
    updateYearFromSemester();
  }

  // === Floating Particles Background (Safe Fallback) ===
  const canvas = document.getElementById("particleCanvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    let particles = [];
    const numParticles = 60;

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
        r: Math.random() * 2 + 1.5,
        dx: (Math.random() - 0.5) * 0.9,
        dy: (Math.random() - 0.5) * 0.9,
        alpha: Math.random() * 0.6 + 0.4,
      });
    }

    function drawParticles() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#008037";
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.globalAlpha = p.alpha;
        ctx.fill();
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
      drawParticles();
      updateParticles();
      requestAnimationFrame(animate);
    }

    animate();
  } else {
    console.info("particleCanvas not found — skipping particle animation.");
  }
});
