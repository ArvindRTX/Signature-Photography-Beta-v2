document.addEventListener("DOMContentLoaded", () => {
  // --- STATE & CONFIG ---
  let state = {
    galleries: { page: 1, search: "" },
    clients: { page: 1, search: "" },
    contacts: { page: 1, search: "" },
    allGalleries: [],
    allClients: [],
  };
  let itemToDelete = { type: null, id: null };

  const typeMap = {
    galleries: "gallery",
    clients: "client",
    contacts: "contact",
  };

  // --- ELEMENT SELECTORS ---
  const loginView = document.getElementById("login-view");
  const dashboardContent = document.getElementById("dashboard-content");
  const loginForm = document.getElementById("login-form");
  const logoutBtn = document.getElementById("header-logout-btn");
  const adminWelcome = document.getElementById("admin-welcome");
  const createGalleryForm = document.getElementById("create-gallery-form");
  const createClientForm = document.getElementById("create-client-form");
  const toastContainer = document.getElementById("toast-container");
  const allTabNavs = document.querySelectorAll(".tab-nav");
  const themeToggle = document.getElementById("admin-theme-toggle");
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebarOverlay = document.getElementById("sidebar-overlay");

  // --- HELPERS ---
  const getToken = () => localStorage.getItem("adminToken");
  const setToken = (token, username) => {
    localStorage.setItem("adminToken", token);
    localStorage.setItem("adminUsername", username);
  };
  const getAuthHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
  });

  // Admin theme
  const getAdminTheme = () => localStorage.getItem("adminTheme") || "light";
  const applyAdminTheme = (theme) => {
    document.body.classList.toggle("admin-dark-theme", theme === "dark");
  };
  applyAdminTheme(getAdminTheme());
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const next = getAdminTheme() === "dark" ? "light" : "dark";
      localStorage.setItem("adminTheme", next);
      applyAdminTheme(next);
    });
  }

  // Collapsible sidebar (mobile)
  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
      document.body.classList.toggle("sidebar-open");
    });
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", () => {
      document.body.classList.remove("sidebar-open");
    });
  }

  const showToast = (message, type = "success") => {
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${
      type === "success" ? "fa-check-circle" : "fa-times-circle"
    }"></i><p>${message}</p>`;

    toast.addEventListener("transitionend", (event) => {
      if (
        event.propertyName === "opacity" &&
        toast.classList.contains("hide")
      ) {
        toast.remove();
      }
    });

    toastContainer.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.add("show");
    });
    setTimeout(() => {
      toast.classList.add("hide");
    }, 4500);
  };

  const showModal = (id) => document.getElementById(id)?.classList.add("show");
  const hideModal = (id) =>
    document.getElementById(id)?.classList.remove("show");
  const showLoading = (loaderId) =>
    document.getElementById(loaderId)?.classList.add("show");
  const hideLoading = (loaderId) =>
    document.getElementById(loaderId)?.classList.remove("show");
  const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), delay);
    };
  };

  // --- RENDER FUNCTIONS ---
  const renderList = (type, { data, total, page, totalPages }) => {
    const singularType = typeMap[type];
    const listEl = document.getElementById(`${singularType}-list`);
    if (!listEl) return;

    listEl.innerHTML =
      data.length === 0
        ? "<p>No items found.</p>"
        : data
            .map((item) => {
              if (type === "galleries") {
                return `<div class="item"><div class="item-info"><div><i class="fas fa-images fa-lg" style="color:#c0a062;"></i></div><div><p><strong>${item.name}</strong></p><a href="/gallery/${item.slug}" target="_blank">View Gallery</a></div></div><div class="item-actions"><button class="btn btn-secondary btn-small" data-action="share-gallery" data-name="${item.name}" data-slug="${item.slug}"><i class="fas fa-share-alt"></i> Share</button><button class="btn btn-danger btn-small" data-action="confirm-delete" data-type="gallery" data-id="${item._id}"><i class="fas fa-trash-alt"></i></button></div></div>`;
              }
              if (type === "clients")
                return `<div class="item"><div class="item-info"><div><i class="fas fa-user fa-lg" style="color:#c0a062;"></i></div><div><p><strong>${
                  item.name
                }</strong></p><p class="item-subtext">Galleries: ${
                  item.galleryIds?.length || 0
                }</p></div></div><div class="actions-cell"><button class="actions-btn" data-action="toggle-dropdown" data-id="${
                  item._id
                }"><i class="fas fa-ellipsis-v"></i></button><div class="dropdown-menu" data-menu-for="${
                  item._id
                }"><button class="dropdown-item" data-action="view-client" data-id="${
                  item._id
                }"><i class="fas fa-eye"></i> View Details</button><button class="dropdown-item" data-action="edit-client" data-id="${
                  item._id
                }"><i class="fas fa-edit"></i> Edit Credentials</button><button class="dropdown-item" data-action="assign-gallery" data-id="${
                  item._id
                }"><i class="fas fa-images"></i> Assign Galleries</button><div class="dropdown-divider"></div><button class="dropdown-item" data-action="confirm-delete" data-type="client" data-id="${
                  item._id
                }"><i class="fas fa-trash-alt"></i> Delete Client</button></div></div></div>`;
              if (type === "contacts")
                return `<div class="item"><div class="item-info"><div><i class="fas fa-address-card fa-lg" style="color:#c0a062;"></i></div><div><p><strong>${item.name}</strong></p><p style="font-size:0.9rem; color:#666;">${item.email}</p></div></div><div class="actions-cell"><button class="btn btn-secondary btn-small" data-action="view-submissions" data-email="${item.email}" data-name="${item.name}"><i class="fas fa-history"></i> History</button><button class="btn btn-danger btn-small" data-action="confirm-delete" data-type="contact" data-id="${item._id}"><i class="fas fa-trash-alt"></i></button></div></div>`;
            })
            .join("");
    renderPagination(type, { total, page, totalPages });
  };

  const renderPagination = (type, { total, page, totalPages }) => {
    const singularType = typeMap[type];
    const pagEl = document.getElementById(`${singularType}-pagination`);
    if (!pagEl) return;
    if (total === 0) {
      pagEl.innerHTML = "";
      return;
    }
    pagEl.innerHTML = `
      <button data-action="prev-page" data-type="${type}" ${
      page === 1 ? "disabled" : ""
    }>Previous</button>
      <span>Page ${page} of ${totalPages}</span>
      <button data-action="next-page" data-type="${type}" ${
      page >= totalPages ? "disabled" : ""
    }>Next</button>
    `;
  };

  // --- SHARE FUNCTION ---
  const shareGallery = async (name, slug) => {
    const galleryUrl = `${window.location.origin}/gallery/${slug}`;
    const shareData = {
      title: `Signature Photography: ${name}`,
      text: `View the "${name}" photo gallery from Signature Photography.`,
      url: galleryUrl,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        /* User cancelled share */
      }
    } else {
      try {
        await navigator.clipboard.writeText(galleryUrl);
        showToast("Gallery link copied to clipboard!", "success");
      } catch (err) {
        showToast("Failed to copy link.", "error");
      }
    }
  };

  // --- API & DATA FETCHING ---
  const fetchStats = async () => {
    try {
      const res = await fetch("/api/dashboard-stats", {
        headers: getAuthHeaders(),
        cache: "no-cache",
      });
      if (res.status === 401) return logout();
      const stats = await res.json();
      document.getElementById("total-galleries").textContent =
        stats.totalGalleries;
      document.getElementById("unassigned-galleries").textContent =
        stats.unassignedGalleries;
      document.getElementById("total-clients").textContent = stats.totalClients;
      document.getElementById("total-selections").textContent =
        stats.totalSelections;
    } catch (error) {
      showToast("Failed to load stats.", "error");
    }
  };

  const fetchList = async (type) => {
    const singularType = typeMap[type];
    if (!singularType) return;
    showLoading(`${singularType}-loader`);
    try {
      const { page, search } = state[type];
      const res = await fetch(`/api/${type}?page=${page}&search=${search}`, {
        headers: getAuthHeaders(),
        cache: "no-cache",
      });
      if (res.status === 401) return logout();
      const result = await res.json();
      renderList(type, result);
    } catch (error) {
      showToast(`Failed to load ${type}.`, "error");
    } finally {
      hideLoading(`${singularType}-loader`);
    }
  };

  const fetchAllClientAndGalleryData = async () => {
    try {
      const fetchOptions = { headers: getAuthHeaders(), cache: "no-cache" };
      const [galleriesRes, clientsRes] = await Promise.all([
        fetch("/api/galleries?limit=1000", fetchOptions),
        fetch("/api/clients?limit=1000", fetchOptions),
      ]);
      if (!galleriesRes.ok || !clientsRes.ok)
        throw new Error("Failed to fetch background data.");
      state.allGalleries = (await galleriesRes.json()).data;
      state.allClients = (await clientsRes.json()).data;
      const clientSelect = document.getElementById("client-select");
      if (clientSelect) {
        clientSelect.innerHTML = '<option value="">-- No Client --</option>';
        state.allClients.forEach((c) => {
          clientSelect.innerHTML += `<option value="${c._id}">${c.name}</option>`;
        });
      }
    } catch (error) {
      showToast("Could not refresh background data for modals.", "error");
    }
  };

  const handleFormSubmit = async (url, method, body, form, successCallback) => {
    const submitBtn = form.querySelector('button[type="submit"]');
    if (!submitBtn) return;
    submitBtn.classList.add("loading");
    submitBtn.disabled = true;
    try {
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.message || "An unknown error occurred.");
      showToast(data.message, "success");
      form.reset();
      const detailsElement = form.closest("details");
      if (detailsElement) detailsElement.open = false;
      if (successCallback) successCallback();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      submitBtn.classList.remove("loading");
      submitBtn.disabled = false;
    }
  };

  const openSubmissionHistoryModal = async (email, name) => {
    const listEl = document.getElementById("submission-history-list");
    document.getElementById(
      "submission-history-title"
    ).textContent = `Submission History for ${name}`;
    listEl.innerHTML = '<div class="spinner"></div>';
    showModal("submission-history-modal");
    try {
      const res = await fetch(`/api/submissions/${email}`, {
        headers: getAuthHeaders(),
        cache: "no-cache",
      });
      const submissions = await res.json();
      if (submissions.length === 0) {
        listEl.innerHTML =
          "<p>No submission history found for this contact.</p>";
        return;
      }
      listEl.innerHTML = submissions
        .map(
          (sub) =>
            `<div class="submission-item"><p><strong>Date:</strong> ${new Date(
              sub.submittedAt
            ).toLocaleString()}</p><p><strong>Gallery:</strong> ${
              sub.gallerySlug || "N/A"
            }</p><p><strong>Selections (${
              sub.selectedPhotos.length
            }):</strong></p><div class="photo-list">${sub.selectedPhotos
              .map((p) => p.name)
              .join("<br>")}</div></div>`
        )
        .join("");
    } catch (error) {
      listEl.innerHTML = "<p>Could not load submission history.</p>";
      showToast("Failed to load history.", "error");
    }
  };

  const openEditClientModal = (clientId) => {
    const client = state.allClients.find((c) => c._id === clientId);
    if (!client) {
      showToast("Client data not found. Please refresh.", "error");
      return;
    }
    document.getElementById("edit-client-id").value = client._id;
    document.getElementById("edit-client-name").value = client.name;
    document.getElementById("edit-client-username").value = client.username;
    document.getElementById("edit-client-password").value = "";
    showModal("edit-client-modal");
  };

  const openAssignGalleryModal = (clientId) => {
    const client = state.allClients.find((c) => c._id === clientId);
    if (!client) {
      showToast("Client data not found. Please refresh.", "error");
      return;
    }
    document.getElementById("assign-client-id").value = client._id;
    document.getElementById(
      "assign-gallery-title"
    ).textContent = `Assign Galleries for ${client.name}`;
    const listEl = document.getElementById("assign-gallery-list");
    listEl.innerHTML = state.allGalleries
      .map(
        (g) =>
          `<label class="gallery-checkbox-item"><input type="checkbox" name="galleryIds" value="${
            g._id
          }" ${client.galleryIds?.includes(g._id) ? "checked" : ""}>${
            g.name
          }</label>`
      )
      .join("");
    showModal("assign-gallery-modal");
  };

  // --- INITIALIZATION & EVENT LISTENERS ---
  const showDashboard = async () => {
    loginView.style.display = "none";
    dashboardContent.classList.add("visible");
    adminWelcome.textContent = `Welcome, ${
      localStorage.getItem("adminUsername") || "Admin"
    }`;
    fetchStats();
    fetchList("galleries");
    fetchList("clients");
    fetchList("contacts");
    await fetchAllClientAndGalleryData();
  };

  const logout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUsername");
    location.reload();
  };

  allTabNavs.forEach((nav) => {
    nav.addEventListener("click", (e) => {
      const tabButton = e.target.closest(".tab-btn");
      if (!tabButton) return;

      const targetTab = tabButton.dataset.tab;

      // Update the active state on ALL tab bars to keep them in sync
      allTabNavs.forEach((navBar) => {
        navBar.querySelectorAll(".tab-btn").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.tab === targetTab);
        });
      });

      // Update the content panels
      document.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.classList.toggle("active", panel.id === `${targetTab}-panel`);
      });
    });
  });

  logoutBtn.addEventListener("click", (e) => {
    e.preventDefault();
    logout();
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = loginForm.username.value;
    const password = loginForm.password.value;
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.classList.add("loading");
    submitBtn.disabled = true;
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setToken(data.token, data.username);
      showDashboard();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      submitBtn.classList.remove("loading");
      submitBtn.disabled = false;
    }
  });

  document.addEventListener("click", (e) => {
    const toggleButton = e.target.closest(".password-toggle");
    if (toggleButton) {
      const parent = toggleButton.parentElement;
      const input = parent.querySelector("input");
      const icon = toggleButton.querySelector("i");
      if (input && icon) {
        if (input.type === "password") {
          input.type = "text";
          icon.classList.replace("fa-eye", "fa-eye-slash");
        } else {
          input.type = "password";
          icon.classList.replace("fa-eye-slash", "fa-eye");
        }
      }
      return;
    }

    let target = e.target.closest("[data-action]");
    if (!target) {
      document
        .querySelectorAll(".dropdown-menu-global")
        .forEach((m) => m.remove());
      return;
    }

    const { action, id, type, email, name, slug } = target.dataset;
    if (action === "toggle-dropdown") {
      const existingMenu = document.querySelector(".dropdown-menu-global");
      if (existingMenu) {
        existingMenu.remove();
        if (existingMenu.dataset.owner === id) return;
      }
      const originalMenu = e.target
        .closest(".actions-cell")
        .querySelector(`.dropdown-menu[data-menu-for="${id}"]`);
      if (!originalMenu) return;
      const clonedMenu = originalMenu.cloneNode(true);
      clonedMenu.classList.add("dropdown-menu-global");
      clonedMenu.dataset.owner = id;
      document.body.appendChild(clonedMenu);
      const btnRect = e.target
        .closest('[data-action="toggle-dropdown"]')
        .getBoundingClientRect();
      clonedMenu.style.position = "fixed";
      clonedMenu.style.top = `${btnRect.bottom + 5}px`;
      clonedMenu.style.right = `${window.innerWidth - btnRect.right}px`;
      clonedMenu.style.display = "flex";
    } else {
      document
        .querySelectorAll(".dropdown-menu-global")
        .forEach((m) => m.remove());
    }

    switch (action) {
      case "prev-page":
        state[type].page--;
        fetchList(type);
        break;
      case "next-page":
        state[type].page++;
        fetchList(type);
        break;
      case "confirm-delete":
        itemToDelete = { type, id };
        document.getElementById(
          "confirm-message"
        ).textContent = `Are you sure you want to delete this ${type}? This action cannot be undone.`;
        showModal("confirm-modal");
        break;
      case "view-submissions":
        openSubmissionHistoryModal(email, name);
        break;
      case "export-clients":
        exportCsv("clients");
        break;
      case "export-contacts":
        exportCsv("contacts");
        break;
      case "edit-client":
        openEditClientModal(id);
        break;
      case "assign-gallery":
        openAssignGalleryModal(id);
        break;
      case "share-gallery":
        shareGallery(name, slug);
        break;
      case "view-client":
        const client = state.allClients.find((c) => c._id === id);
        if (client) {
          document.getElementById("view-client-name").textContent = client.name;
          document.getElementById("view-client-username").textContent =
            client.username;
          const galleryUList = document.getElementById("view-client-galleries");
          const assignedGalleries = state.allGalleries.filter((g) =>
            client.galleryIds.includes(g._id)
          );
          galleryUList.innerHTML =
            assignedGalleries.length > 0
              ? assignedGalleries.map((g) => `<li>${g.name}</li>`).join("")
              : "<li>No galleries assigned.</li>";
          showModal("view-client-modal");
        } else {
          showToast("Client data not found. Please refresh.", "error");
        }
        break;
    }
  });

  Object.keys(typeMap).forEach((type) => {
    const singularType = typeMap[type];
    const searchInput = document.getElementById(`${singularType}-search`);
    if (searchInput) {
      searchInput.addEventListener(
        "keyup",
        debounce((e) => {
          state[type].page = 1;
          state[type].search = e.target.value;
          fetchList(type);
        }, 500)
      );
    }
  });

  if (getToken()) {
    showDashboard();
  } else {
    loginView.style.display = "flex";
  }

  document.querySelectorAll(".modal .close-btn, #confirm-no").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      hideModal(e.target.closest(".modal").id);
    });
  });

  createGalleryForm.addEventListener("submit", (e) => {
    e.preventDefault();
    handleFormSubmit(
      "/api/galleries",
      "POST",
      {
        name: document.getElementById("gallery-name").value,
        folderLink: document.getElementById("folder-link").value,
        clientId: document.getElementById("client-select").value,
      },
      createGalleryForm,
      () => {
        fetchList("galleries");
        fetchStats();
        fetchAllClientAndGalleryData();
      }
    );
  });

  createClientForm.addEventListener("submit", (e) => {
    e.preventDefault();
    handleFormSubmit(
      "/api/clients",
      "POST",
      {
        name: document.getElementById("client-name").value,
        username: document.getElementById("client-username").value,
        password: document.getElementById("client-password").value,
      },
      createClientForm,
      () => {
        fetchList("clients");
        fetchStats();
        fetchAllClientAndGalleryData();
      }
    );
  });

  document
    .getElementById("edit-client-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("edit-client-id").value;
      const body = {
        name: document.getElementById("edit-client-name").value,
        username: document.getElementById("edit-client-username").value,
      };
      const password = document.getElementById("edit-client-password").value;
      if (password) body.password = password;
      try {
        const res = await fetch(`/api/clients/${id}`, {
          method: "PUT",
          headers: getAuthHeaders(),
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        showToast(data.message, "success");
        hideModal("edit-client-modal");
        await fetchList("clients");
        await fetchAllClientAndGalleryData();
      } catch (error) {
        showToast(error.message, "error");
      }
    });

  document
    .getElementById("assign-gallery-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("assign-client-id").value;
      const galleryIds = Array.from(
        document.querySelectorAll("#assign-gallery-list input:checked")
      ).map((input) => input.value);
      try {
        const res = await fetch(`/api/clients/${id}/galleries`, {
          method: "PUT",
          headers: getAuthHeaders(),
          body: JSON.stringify({ galleryIds }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        showToast(data.message, "success");
        hideModal("assign-gallery-modal");
        await fetchList("clients");
        await fetchAllClientAndGalleryData();
      } catch (error) {
        showToast(error.message, "error");
      }
    });

  document.getElementById("confirm-yes").addEventListener("click", async () => {
    if (!itemToDelete.type || !itemToDelete.id) return;
    try {
      const pluralType =
        itemToDelete.type === "gallery" ? "galleries" : `${itemToDelete.type}s`;
      const res = await fetch(`/api/${pluralType}/${itemToDelete.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      showToast(data.message, "success");
      hideModal("confirm-modal");
      await fetchList(pluralType);
      await fetchStats();
      await fetchAllClientAndGalleryData();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      itemToDelete = { type: null, id: null };
    }
  });
  const fabButton = document.getElementById('fab-create');
    const bottomTabBar = document.querySelector('.dashboard-content > .nav-tabs'); // Note: Corrected selector if you changed it

    const handleLayoutForScreenSize = () => {
        if (window.innerWidth > 768) {
            // On DESKTOP, forcefully hide mobile elements
            if (fabButton) fabButton.style.display = 'none';
            if (bottomTabBar) bottomTabBar.style.display = 'none';
        } else {
            // On MOBILE, ensure they are visible
            if (fabButton) fabButton.style.display = 'flex';
            if (bottomTabBar) bottomTabBar.style.display = 'flex';
        }
    };

    // Run the check when the page first loads
    handleLayoutForScreenSize();

    // Also run the check whenever the browser window is resized
    window.addEventListener('resize', handleLayoutForScreenSize);
});
