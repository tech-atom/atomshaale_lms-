document.addEventListener("DOMContentLoaded", function () {
  const widgets = document.querySelectorAll(".star-radio");

  widgets.forEach((widget) => {
    const stars = widget.querySelectorAll("label");
    const radios = widget.querySelectorAll('input[type="radio"]');

    function updateStars(highlightIndex) {
      const isDarkMode = document.body.classList.contains("dark-mode");
      const goldColor = "#f5b301";
      const unselectedColor = isDarkMode ? "#555555" : "#cccccc";

      stars.forEach((s, i) => {
        if (i <= highlightIndex) {
          s.style.setProperty("color", goldColor, "important");
          s.style.textShadow = "0 0 10px rgba(245, 179, 1, 0.7)";
        } else {
          s.style.setProperty("color", unselectedColor, "important");
          s.style.textShadow = "none";
        }
      });
    }

    stars.forEach((star, index) => {
      star.addEventListener("mouseenter", () => {
        updateStars(index);
      });

      star.addEventListener("mouseleave", () => {
        const checkedIndex = Array.from(radios).findIndex((r) => r.checked);
        updateStars(checkedIndex);
      });

      star.addEventListener("click", () => {
        radios[index].checked = true;
        updateStars(index);
      });
    });

    // Initial check on load
    const initialChecked = Array.from(radios).findIndex((r) => r.checked);
    if (initialChecked >= 0) {
      updateStars(initialChecked);
    }
  });

  // Watch for dark-mode toggle on body to re-color unselected stars dynamically
  const observer = new MutationObserver(() => {
    widgets.forEach((widget) => {
      const stars = widget.querySelectorAll("label");
      const radios = widget.querySelectorAll('input[type="radio"]');
      const checkedIndex = Array.from(radios).findIndex((r) => r.checked);
      const isDarkMode = document.body.classList.contains("dark-mode");
      const unselectedColor = isDarkMode ? "#555555" : "#cccccc";

      stars.forEach((s, i) => {
        if (i <= checkedIndex) {
          s.style.setProperty("color", "#f5b301", "important");
          s.style.textShadow = "0 0 10px rgba(245, 179, 1, 0.7)";
        } else {
          s.style.setProperty("color", unselectedColor, "important");
          s.style.textShadow = "none";
        }
      });
    });
  });

  observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
});
