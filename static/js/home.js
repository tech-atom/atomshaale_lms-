const launchDate = new Date();
const baseCounts = { student: 31245, client: 40, trainingYears: 9, visitors: 38 };

function calculateCounts() {
  const now = new Date();
  const msElapsed = now - launchDate;
  return {
    studentCount: baseCounts.student + Math.floor(msElapsed / (1000 * 60 * 60 * 24)) * 20,
    clientCount: baseCounts.client + Math.floor(msElapsed / (1000 * 60 * 60 * 24 * 30)),
    yearCount: baseCounts.trainingYears + Math.floor(msElapsed / (1000 * 60 * 60 * 24 * 365)),
    visitorCount: baseCounts.visitors + Math.floor(msElapsed / (1000 * 60 * 60 * 3)) * (10 + Math.floor(Math.random() * 6))
  };
}

function animateCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return; // element not present
  let start = 0;
  const steps = 60;
  const step = Math.max(1, Math.ceil(target / steps));
  const suffix = el.dataset.suffix !== undefined ? el.dataset.suffix : '+';
  const interval = setInterval(() => {
    start += step;
    if (start >= target) {
      start = target;
      clearInterval(interval);
    }
    // format with grouping separators
    el.innerText = start.toLocaleString() + suffix;
  }, 20);
}

document.addEventListener('DOMContentLoaded', () => {
  const { studentCount, clientCount, yearCount, visitorCount } = calculateCounts();
  animateCount('studentCount', studentCount);
  animateCount('clientCount', clientCount);
  animateCount('yearCount', yearCount);
  animateCount('visitorCount', visitorCount);
});

