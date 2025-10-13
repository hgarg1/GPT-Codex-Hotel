(() => {
  const dataElement = document.getElementById('room-matrix-data');
  const table = document.querySelector('[data-room-matrix-table]');
  const tableBody = document.querySelector('[data-room-matrix-body]');
  if (!dataElement || !table || !tableBody) {
    return;
  }

  const searchInput = document.querySelector('[data-room-matrix-search]');
  const quickFilterButtons = Array.from(document.querySelectorAll('[data-quick-filter]'));
  const filterToggle = document.querySelector('[data-room-matrix-filter-toggle]');
  const filterPanel = document.querySelector('[data-room-matrix-filter-panel]');
  const activeFiltersContainer = document.querySelector('[data-room-matrix-active-filters]');
  const columnFilterInputs = Array.from(document.querySelectorAll('[data-column-filter]'));
  const wrapper = document.querySelector('[data-room-matrix-wrapper]');

  let rooms = [];
  try {
    rooms = JSON.parse(dataElement.textContent.trim());
  } catch (error) {
    console.error('Unable to parse room matrix data', error);
    return;
  }

  const state = {
    search: '',
    columnFilters: {},
    quickFilters: new Set(),
    sort: []
  };

  const quickFilterMeta = {
    luxury: {
      label: 'Ultra-luxe',
      predicate: (room) => room.pricePerNight >= 850 || /villa|pavilion|gallery/i.test(room.name)
    },
    wellness: {
      label: 'Wellness-forward',
      predicate: (room) =>
        /spa|wellness|therapy|meditation|pulse|tide|dream/i.test(
          [room.view, room.vibe, room.features.join(' ')].join(' ')
        )
    },
    solo: {
      label: 'Solo retreats',
      predicate: (room) => room.capacity <= 2
    }
  };

  const getColumnOrder = () =>
    Array.from(table.tHead?.rows?.[0]?.cells || []).map((cell) => cell.dataset.key).filter(Boolean);

  const normalise = (value) =>
    value
      ? String(value)
          .toLowerCase()
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
      : '';

  const nextDirection = (direction) => {
    if (direction === 'asc') return 'desc';
    if (direction === 'desc') return null;
    return 'asc';
  };

  const applySearch = (room) => {
    if (!state.search) return true;
    const haystack = normalise(
      [room.name, room.view, room.vibe, room.bedConfig, room.features.join(' '), room.addOns.map((addOn) => addOn.name).join(' ')]
        .join(' ')
    );
    return haystack.includes(normalise(state.search));
  };

  const matchesColumnFilters = (room) => {
    return Object.entries(state.columnFilters).every(([key, filterValue]) => {
      if (!filterValue) return true;
      switch (key) {
        case 'name':
          return normalise(room.name).includes(normalise(filterValue));
        case 'capacity': {
          if (filterValue === '6+') return room.capacity >= 6;
          const numeric = Number(filterValue);
          return Number.isFinite(numeric) ? room.capacity === numeric : true;
        }
        case 'squareFeet':
          if (filterValue === '<700') return room.squareFeet < 700;
          if (filterValue === '700-1000') return room.squareFeet >= 700 && room.squareFeet <= 1000;
          if (filterValue === '>1000') return room.squareFeet > 1000;
          return true;
        case 'view':
          return room.view === filterValue;
        case 'pricePerNight':
          if (filterValue === '<500') return room.pricePerNight < 500;
          if (filterValue === '500-800') return room.pricePerNight >= 500 && room.pricePerNight <= 800;
          if (filterValue === '>800') return room.pricePerNight > 800;
          return true;
        default:
          return true;
      }
    });
  };

  const matchesQuickFilters = (room) => {
    if (!state.quickFilters.size) return true;
    for (const key of state.quickFilters) {
      const filter = quickFilterMeta[key];
      if (!filter?.predicate(room)) {
        return false;
      }
    }
    return true;
  };

  const applySort = (dataset) => {
    if (!state.sort.length) {
      return dataset.slice();
    }
    const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
    return dataset.slice().sort((a, b) => {
      for (const { key, direction } of state.sort) {
        let aValue = a[key];
        let bValue = b[key];
        if (key === 'pricePerNight' || key === 'capacity' || key === 'squareFeet' || key === 'availability') {
          aValue = Number(aValue);
          bValue = Number(bValue);
        }
        let comparison = 0;
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue;
        } else {
          comparison = collator.compare(String(aValue ?? ''), String(bValue ?? ''));
        }
        if (comparison !== 0) {
          return direction === 'asc' ? comparison : -comparison;
        }
      }
      return 0;
    });
  };

  const formatNumber = (value) => Number(value ?? 0).toLocaleString();
  const formatCurrency = (value) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value));

  const getAvailabilityTone = (availability) => {
    if (availability >= 8) return 'plenty';
    if (availability >= 4) return 'limited';
    return 'low';
  };

  const renderCell = (key, room) => {
    switch (key) {
      case 'name': {
        const highlight = [room.bedConfig, room.features[0]].filter(Boolean).join(' • ');
        return `
          <td data-key="name">
            <a href="#${room.slug}">${room.name}</a>
            <span class="cell-subtext">${highlight || 'Signature amenity spotlight'}</span>
          </td>
        `;
      }
      case 'capacity':
        return `
          <td data-key="capacity">
            <span class="cell-value">${room.capacity}</span>
            <span class="cell-subtext">guests</span>
          </td>
        `;
      case 'squareFeet':
        return `
          <td data-key="squareFeet">
            <span class="cell-value">${formatNumber(room.squareFeet)}</span>
            <span class="cell-subtext">sq ft habitat</span>
          </td>
        `;
      case 'view': {
        const viewHighlight = room.features[1] || room.addOns[0]?.name;
        return `
          <td data-key="view">
            <span class="cell-value">${room.view}</span>
            <span class="cell-subtext">${viewHighlight || 'Immersive vantage'}</span>
          </td>
        `;
      }
      case 'pricePerNight':
        return `
          <td data-key="pricePerNight">
            <span class="cell-value">${formatCurrency(room.pricePerNight)}</span>
            <span class="cell-subtext">per night</span>
          </td>
        `;
      case 'availability': {
        const tone = getAvailabilityTone(room.availability);
        return `
          <td data-key="availability">
            <span class="availability-pill" data-availability="${tone}">${room.availability} ready</span>
            <span class="cell-subtext">live inventory</span>
          </td>
        `;
      }
      default:
        return `<td data-key="${key}">${room[key]}</td>`;
    }
  };

  const renderTableBody = () => {
    const order = getColumnOrder();
    const filtered = rooms.filter((room) => applySearch(room) && matchesColumnFilters(room) && matchesQuickFilters(room));
    const sorted = applySort(filtered);
    if (!sorted.length) {
      tableBody.innerHTML = `
        <tr class="matrix-empty">
          <td colspan="${order.length}">
            <div class="matrix-empty-state">
              <span aria-hidden="true">✦</span>
              <p>No habitats match your filters yet. Try adjusting the matrix.</p>
            </div>
          </td>
        </tr>
      `;
      updateSortIndicators();
      updateActiveFilters();
      return;
    }
    const rows = sorted
      .map((room) => {
        const cells = order.map((key) => renderCell(key, room)).join('');
        return `<tr data-room="${room.slug}">${cells}</tr>`;
      })
      .join('');
    tableBody.innerHTML = rows;
    sorted.forEach((room) => {
      const row = tableBody.querySelector(`tr[data-room="${room.slug}"]`);
      if (row) {
        row.dataset.preview = [room.bedConfig, room.features[0], room.addOns[0]?.name]
          .filter(Boolean)
          .join(' • ');
      }
    });
    updateSortIndicators();
    updateActiveFilters();
  };

  const updateSortIndicators = () => {
    const headers = Array.from(table.tHead?.rows?.[0]?.cells || []);
    headers.forEach((header) => {
      const key = header.dataset.key;
      const indicator = header.querySelector('.sort-indicator');
      const orderLabel = header.querySelector('[data-sort-order]');
      header.removeAttribute('aria-sort');
      if (!indicator) return;
      const sortIndex = state.sort.findIndex((item) => item.key === key);
      if (sortIndex === -1) {
        indicator.textContent = '↕';
        indicator.dataset.direction = '';
        indicator.dataset.position = '';
        if (orderLabel) {
          orderLabel.textContent = 'Not sorted';
        }
        return;
      }
      const { direction } = state.sort[sortIndex];
      const arrow = direction === 'asc' ? '↑' : '↓';
      indicator.textContent = `${arrow}${sortIndex + 1}`;
      indicator.dataset.direction = direction;
      indicator.dataset.position = String(sortIndex + 1);
      if (orderLabel) {
        orderLabel.textContent = `Sorted ${direction === 'asc' ? 'ascending' : 'descending'} priority ${sortIndex + 1}`;
      }
      header.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
    });
  };

  const describeFilterValue = (key, value) => {
    switch (key) {
      case 'name':
        return `Name contains “${value}”`;
      case 'capacity':
        return value === '6+' ? 'Capacity 6+' : `Capacity ${value}`;
      case 'squareFeet':
        if (value === '<700') return 'Under 700 sq ft';
        if (value === '700-1000') return '700-1000 sq ft';
        if (value === '>1000') return 'Over 1000 sq ft';
        return value;
      case 'view':
        return `View: ${value}`;
      case 'pricePerNight':
        if (value === '<500') return 'Under $500';
        if (value === '500-800') return '$500-$800';
        if (value === '>800') return 'Over $800';
        return value;
      default:
        return value;
    }
  };

  const updateActiveFilters = () => {
    if (!activeFiltersContainer) return;
    const chips = [];
    if (state.search) {
      chips.push({ type: 'search', key: 'search', label: `Search: “${state.search}”` });
    }
    Object.entries(state.columnFilters).forEach(([key, value]) => {
      if (!value) return;
      chips.push({ type: 'column', key, label: describeFilterValue(key, value) });
    });
    state.quickFilters.forEach((key) => {
      const meta = quickFilterMeta[key];
      if (meta) {
        chips.push({ type: 'quick', key, label: meta.label });
      }
    });

    if (!chips.length) {
      activeFiltersContainer.innerHTML = '<span class="filters-empty">No filters active</span>';
      return;
    }

    activeFiltersContainer.innerHTML = chips
      .map(
        (chip) =>
          `<button type="button" class="filter-chip" data-remove-type="${chip.type}" data-remove-key="${chip.key}">
            ${chip.label}<span aria-hidden="true"> ×</span>
          </button>`
      )
      .join('');
  };

  const cycleSort = (key, multi) => {
    const existingIndex = state.sort.findIndex((item) => item.key === key);
    const currentDirection = existingIndex === -1 ? null : state.sort[existingIndex].direction;
    const next = nextDirection(currentDirection);
    if (!multi) {
      state.sort = [];
      if (next) {
        state.sort.push({ key, direction: next });
      }
      return;
    }
    if (existingIndex === -1) {
      if (next) {
        state.sort.push({ key, direction: next });
      }
      return;
    }
    if (!next) {
      state.sort.splice(existingIndex, 1);
    } else {
      state.sort[existingIndex].direction = next;
    }
  };

  const handleSortClick = (event) => {
    const trigger = event.target.closest('[data-sort-trigger]');
    if (!trigger) return;
    const header = trigger.closest('th');
    const key = header?.dataset.key;
    if (!key) return;
    const multi = event.shiftKey;
    cycleSort(key, multi);
    renderTableBody();
  };

  const handleSearchInput = (event) => {
    state.search = event.target.value.trim();
    renderTableBody();
  };

  const handleColumnFilterChange = (event) => {
    const key = event.target.dataset.columnFilter;
    if (!key) return;
    const value = event.target.tagName === 'INPUT' ? event.target.value.trim() : event.target.value;
    if (!value) {
      delete state.columnFilters[key];
    } else {
      state.columnFilters[key] = value;
    }
    renderTableBody();
  };

  const handleQuickFilterToggle = (event) => {
    const button = event.currentTarget;
    const key = button.dataset.quickFilter;
    if (!key) return;
    const isActive = state.quickFilters.has(key);
    if (isActive) {
      state.quickFilters.delete(key);
    } else {
      state.quickFilters.add(key);
    }
    button.classList.toggle('is-active', !isActive);
    button.setAttribute('aria-pressed', String(!isActive));
    renderTableBody();
  };

  const handleActiveFilterClick = (event) => {
    const button = event.target.closest('[data-remove-type]');
    if (!button) return;
    const { removeType, removeKey } = button.dataset;
    if (removeType === 'search') {
      state.search = '';
      if (searchInput) {
        searchInput.value = '';
      }
    } else if (removeType === 'column') {
      delete state.columnFilters[removeKey];
      const input = columnFilterInputs.find((element) => element.dataset.columnFilter === removeKey);
      if (input) {
        input.value = '';
      }
    } else if (removeType === 'quick') {
      state.quickFilters.delete(removeKey);
      const buttonToReset = quickFilterButtons.find((element) => element.dataset.quickFilter === removeKey);
      if (buttonToReset) {
        buttonToReset.classList.remove('is-active');
        buttonToReset.setAttribute('aria-pressed', 'false');
      }
    }
    renderTableBody();
  };

  const toggleFilterPanel = () => {
    if (!filterToggle || !filterPanel) return;
    const expanded = filterToggle.getAttribute('aria-expanded') === 'true';
    filterToggle.setAttribute('aria-expanded', String(!expanded));
    filterPanel.hidden = expanded;
    if (!expanded) {
      filterPanel.querySelector('[data-column-filter]')?.focus({ preventScroll: true });
    }
  };

  const attachColumnDragHandlers = () => {
    const headerCells = Array.from(table.tHead?.rows?.[0]?.cells || []);
    let dragged = null;

    headerCells.forEach((cell) => {
      cell.addEventListener('dragstart', (event) => {
        dragged = cell;
        cell.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', cell.dataset.key || '');
      });

      cell.addEventListener('dragend', () => {
        cell.classList.remove('is-dragging');
        dragged = null;
      });

      cell.addEventListener('dragover', (event) => {
        if (!dragged || dragged === cell) return;
        event.preventDefault();
        cell.classList.add('is-drop-target');
      });

      cell.addEventListener('dragleave', () => {
        cell.classList.remove('is-drop-target');
      });

      cell.addEventListener('drop', (event) => {
        if (!dragged || dragged === cell) return;
        event.preventDefault();
        cell.classList.remove('is-drop-target');
        const headerRow = cell.parentElement;
        if (!headerRow) return;
        const children = Array.from(headerRow.children);
        const draggedIndex = children.indexOf(dragged);
        const targetIndex = children.indexOf(cell);
        if (draggedIndex < targetIndex) {
          headerRow.insertBefore(dragged, cell.nextSibling);
        } else {
          headerRow.insertBefore(dragged, cell);
        }
        renderTableBody();
      });
    });
  };

  const setupHoverEffects = () => {
    if (!wrapper) return;
    wrapper.addEventListener('pointermove', (event) => {
      const row = event.target.closest('tbody tr');
      if (!row) return;
      wrapper.style.setProperty('--hover-x', `${event.clientX}px`);
      wrapper.style.setProperty('--hover-y', `${event.clientY}px`);
    });
    wrapper.addEventListener('pointerleave', () => {
      wrapper.style.removeProperty('--hover-x');
      wrapper.style.removeProperty('--hover-y');
    });
  };

  table.addEventListener('click', handleSortClick);
  searchInput?.addEventListener('input', handleSearchInput);
  quickFilterButtons.forEach((button) => {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', handleQuickFilterToggle);
  });
  columnFilterInputs.forEach((input) => {
    state.columnFilters[input.dataset.columnFilter] = '';
    const eventName = input.tagName === 'INPUT' ? 'input' : 'change';
    input.addEventListener(eventName, handleColumnFilterChange);
  });
  activeFiltersContainer?.addEventListener('click', handleActiveFilterClick);
  filterToggle?.addEventListener('click', toggleFilterPanel);

  attachColumnDragHandlers();
  setupHoverEffects();
  renderTableBody();
})();
