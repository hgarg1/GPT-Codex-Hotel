(function () {
  const searchInput = document.querySelector('[data-staff-search]');
  const roster = document.querySelectorAll('[data-staff-roster] .staff-card');
  if (!searchInput || !roster.length) return;

  const filterRoster = () => {
    const query = searchInput.value.trim().toLowerCase();
    roster.forEach((card) => {
      const matches = !query ||
        card.dataset.name.includes(query) ||
        card.dataset.role.includes(query);
      card.hidden = !matches;
    });
  };

  searchInput.addEventListener('input', filterRoster);
})();
