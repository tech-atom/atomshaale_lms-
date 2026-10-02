document.addEventListener("DOMContentLoaded", function () {
  console.log("student_feedback.js loaded");

  // === Smooth scroll to alerts ===
  const alertBox = document.querySelector(".toast-alert, .alert-banner, .alert");
  if (alertBox) {
    alertBox.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // === Prevent double form submission ===
  const form = document.getElementById("studentFeedbackForm");
  if (form) {
    form.addEventListener("submit", function (e) {
      const submitBtn = form.querySelector(".btn-submit-form, .btn-submit-eval, .submit-feedback-btn, .submit-btn");
      if (submitBtn) {
        if (submitBtn.disabled) {
          e.preventDefault();
          return false;
        }
        submitBtn.disabled = true;
        const btnText = submitBtn.querySelector("span");
        if (btnText) {
          btnText.innerText = "Submitting Evaluation...";
        } else {
          submitBtn.innerText = "Submitting...";
        }
      }
    });
  }

  // === Star rating interactive logic ===
  document.querySelectorAll(".star-rating-widget").forEach(function (widget) {
    const radios = widget.querySelectorAll('input[type="radio"]');
    const labels = widget.querySelectorAll("label");

    // Hover effect: highlight stars up to current
    labels.forEach(function (label, idx) {
      label.addEventListener("mouseenter", function () {
        labels.forEach(function (l, j) {
          if (j <= idx) l.classList.add("hovered");
          else l.classList.remove("hovered");
        });
      });

      label.addEventListener("mouseleave", function () {
        labels.forEach(function (l) {
          l.classList.remove("hovered");
        });
      });

      // Click effect: mark as checked
      label.addEventListener("click", function () {
        radios[idx].checked = true;
        labels.forEach(function (l, j) {
          if (j <= idx) l.classList.add("checked");
          else l.classList.remove("checked");
        });
      });
    });

    // On load: reflect any pre-selected radio values
    radios.forEach(function (radio, idx) {
      if (radio.checked) {
        labels.forEach(function (l, j) {
          if (j <= idx) l.classList.add("checked");
          else l.classList.remove("checked");
        });
      }
    });
  });

  console.log("Feedback JS initialized successfully");
});
