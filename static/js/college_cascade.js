document.addEventListener("DOMContentLoaded", () => {
  console.log("🔗 Shared College Cascade JS loaded");

  const collegeSelect = document.getElementById("id_college");
  const courseSelect = document.getElementById("id_course");
  const sectionSelect = document.getElementById("id_section");

  if (collegeSelect && courseSelect && sectionSelect) {
    const isEditMode = courseSelect.value !== "";

    // If not in edit mode (meaning it is new registration/creation), disable dependent selects initially
    if (!isEditMode) {
      if (!collegeSelect.value) {
        courseSelect.disabled = true;
        courseSelect.innerHTML = '<option value="">--Select College First--</option>';
      }
      if (!courseSelect.value) {
        sectionSelect.disabled = true;
        sectionSelect.innerHTML = '<option value="">--Select Course First--</option>';
      }
    }

    collegeSelect.addEventListener("change", async () => {
      const collegeId = collegeSelect.value;
      if (!collegeId) {
        courseSelect.disabled = true;
        courseSelect.innerHTML = '<option value="">--Select College First--</option>';
        sectionSelect.disabled = true;
        sectionSelect.innerHTML = '<option value="">--Select Course First--</option>';
        return;
      }

      courseSelect.disabled = true;
      courseSelect.innerHTML = '<option value="">Loading courses...</option>';
      sectionSelect.disabled = true;
      sectionSelect.innerHTML = '<option value="">--Select Course First--</option>';

      try {
        const res = await fetch(`/college/courses/api/list/?college_id=${collegeId}`);
        const courses = await res.json();

        courseSelect.innerHTML = '<option value="">--Select Course--</option>';
        courses.forEach(c => {
          courseSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
        });
        courseSelect.disabled = false;
      } catch (err) {
        console.error("Error loading courses:", err);
        courseSelect.innerHTML = '<option value="">Error loading courses</option>';
      }
    });

    courseSelect.addEventListener("change", async () => {
      const collegeId = collegeSelect.value;
      const courseId = courseSelect.value;
      if (!collegeId || !courseId) {
        sectionSelect.disabled = true;
        sectionSelect.innerHTML = '<option value="">--Select Course First--</option>';
        return;
      }

      sectionSelect.disabled = true;
      sectionSelect.innerHTML = '<option value="">Loading sections...</option>';

      try {
        const res = await fetch(`/college/get-sections/?college_id=${collegeId}&course_id=${courseId}`);
        const sections = await res.json();

        sectionSelect.innerHTML = '<option value="">--Select Section--</option>';
        sections.forEach(s => {
          sectionSelect.innerHTML += `<option value="${s.name}">${s.name}</option>`;
        });
        sectionSelect.disabled = false;
      } catch (err) {
        console.error("Error loading sections:", err);
        sectionSelect.innerHTML = '<option value="">Error loading sections</option>';
      }
    });
  }
});
