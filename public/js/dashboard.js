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
  const fabCreate = document.getElementById("fab-create");
  const createItemModal = document.getElementById("create-item-modal");
  const createModalTitle = document.getElementById("create-modal-title");
  const createGalleryFormContainer = document.querySelector(
    "#create-gallery-form"
  )?.parentElement;
  const createClientFormContainer = document.querySelector(
    "#create-client-form"
  )?.parentElement;

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
  const getAdminTheme = () => localStorage.getItem("adminTheme") || "light";
  const applyAdminTheme = (theme) => {
    document.body.classList.toggle("admin-dark-theme", theme === "dark");
  };
  const showModal = (id) => document.getElementById(id)?.classList.add("show");
  const hideModal = (id) =>
    document.getElementById(id)?.classList.remove("show");
  const showLoading = (id) =>
    document.getElementById(id)?.classList.add("show");
  const hideLoading = (id) =>
    document.getElementById(id)?.classList.remove("show");

  const showToast = (message, type = "success") => {
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${
      type === "success" ? "fa-check-circle" : "fa-times-circle"
    }"></i><p>${message}</p>`;
    toast.addEventListener("transitionend", (e) => {
      if (e.propertyName === "opacity" && toast.classList.contains("hide")) {
        toast.remove();
      }
    });
    toastContainer.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => toast.classList.add("hide"), 4500);
  };

  const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), delay);
    };
  };

  const exportToCSV = (filename, headers, rows) => {
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(val => {
        const str = (val === null || val === undefined) ? "" : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      }).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // --- IMPROVED ERROR HANDLING ---
  const fetchWithErrorHandling = async (url, options = {}) => {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...getAuthHeaders(),
          ...options.headers,
        },
      });

      if (response.status === 401) {
        logout();
        return null;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `Request failed with status ${response.status}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("API Error:", error);
      showToast(error.message || "An error occurred", "error");
      throw error;
    }
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
                return `
                  <div class="item">
                    <div class="item-info">
                      <i class="fas fa-images fa-lg"></i>
                      <p><strong>${item.name}</strong></p>
                      <a href="/gallery/${item.slug}" target="_blank" class="item-subtext" style="text-decoration:none;">
                        <i class="fas fa-external-link-alt" style="width:auto; height:auto; background:none; color:inherit; display:inline; margin:0;"></i> View Live Gallery
                      </a>
                    </div>
                    <div class="item-actions-grid">
                      <button class="btn btn-secondary btn-small" data-action="share-gallery" data-name="${item.name}" data-slug="${item.slug}">
                        <i class="fas fa-share-alt"></i> <span>Share</span>
                      </button>
                      <button class="btn btn-danger btn-small" data-action="confirm-delete" data-type="gallery" data-id="${item._id}">
                        <i class="fas fa-trash-alt"></i> <span>Delete</span>
                      </button>
                    </div>
                  </div>
                `;
              }
              if (type === "clients") {
                return `
                  <div class="item">
                    <div class="item-info">
                      <i class="fas fa-user fa-lg"></i>
                      <p><strong class="clickable-title" data-action="view-client" data-id="${item._id}" title="Click to view details">${item.name}</strong></p>
                      <p class="item-subtext">Galleries Assigned: ${item.galleryIds?.length || 0}</p>
                    </div>
                    <div class="item-actions-grid" style="grid-template-columns: repeat(2, 1fr);">
                      <button class="btn btn-secondary btn-small" data-action="view-client" data-id="${item._id}">
                        <i class="fas fa-eye"></i> <span>View</span>
                      </button>
                      <button class="btn btn-secondary btn-small" data-action="edit-client" data-id="${item._id}">
                        <i class="fas fa-edit"></i> <span>Edit</span>
                      </button>
                      <button class="btn btn-secondary btn-small" data-action="assign-gallery" data-id="${item._id}">
                        <i class="fas fa-link"></i> <span>Assign</span>
                      </button>
                      <button class="btn btn-danger btn-small" data-action="confirm-delete" data-type="client" data-id="${item._id}">
                        <i class="fas fa-trash-alt"></i> <span>Delete</span>
                      </button>
                    </div>
                  </div>
                `;
              }
              if (type === "contacts") {
                return `
                  <div class="item">
                    <div class="item-info">
                      <i class="fas fa-address-card fa-lg"></i>
                      <p><strong>${item.name}</strong></p>
                      <p class="item-subtext">${item.email}</p>
                      ${item.phone ? `<p class="item-subtext" style="font-size:0.75rem; margin-top:2px;">Phone: ${item.phone}</p>` : ''}
                    </div>
                    <div class="item-actions-grid">
                      <button class="btn btn-secondary btn-small" data-action="view-submissions" data-email="${item.email}" data-name="${item.name}">
                        <i class="fas fa-history"></i> <span>History</span>
                      </button>
                      <button class="btn btn-danger btn-small" data-action="confirm-delete" data-type="contact" data-id="${item._id}">
                        <i class="fas fa-trash-alt"></i> <span>Delete</span>
                      </button>
                    </div>
                  </div>
                `;
              }
            })
            .join("");
    renderPagination(type, { total, page, totalPages });
  };

  const renderPagination = (type, { total, page, totalPages }) => {
    const singularType = typeMap[type];
    const pagEl = document.getElementById(`${singularType}-pagination`);
    if (!pagEl || total === 0) {
      if (pagEl) pagEl.innerHTML = "";
      return;
    }
    pagEl.innerHTML = `<button data-action="prev-page" data-type="${type}" ${
      page === 1 ? "disabled" : ""
    }>Previous</button><span>Page ${page} of ${totalPages}</span><button data-action="next-page" data-type="${type}" ${
      page >= totalPages ? "disabled" : ""
    }>Next</button>`;
  };

  // --- API & DATA HANDLING ---
  const fetchStats = async () => {
    try {
      const stats = await fetchWithErrorHandling("/api/dashboard-stats", {
        cache: "no-cache",
      });

      if (stats) {
        const elements = {
          "total-galleries": stats.totalGalleries,
          "unassigned-galleries": stats.unassignedGalleries,
          "total-clients": stats.totalClients,
          "total-selections": stats.totalSelections,
        };

        Object.entries(elements).forEach(([id, value]) => {
          const element = document.getElementById(id);
          if (element) {
            element.textContent = value || 0;
          }
        });
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  };

  const fetchList = async (type) => {
    const singularType = typeMap[type];
    if (!singularType) return;

    const loaderId = `${singularType}-loader`;
    showLoading(loaderId);

    try {
      const { page, search } = state[type];
      const result = await fetchWithErrorHandling(
        `/api/${type}?page=${page}&search=${encodeURIComponent(search)}`,
        { cache: "no-cache" }
      );

      if (result) {
        renderList(type, result);
      }
    } catch (error) {
      console.error(`Failed to fetch ${type}:`, error);
    } finally {
      hideLoading(loaderId);
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

  const handleFormSubmit = async (url, method, body, form, callback) => {
    const submitBtn = form.querySelector('button[type="submit"]');
    if (!submitBtn) return;

    // Validate form data
    const requiredFields = form.querySelectorAll("[required]");
    let isValid = true;

    requiredFields.forEach((field) => {
      if (!field.value.trim()) {
        field.classList.add("error");
        isValid = false;
      } else {
        field.classList.remove("error");
      }
    });

    if (!isValid) {
      showToast("Please fill in all required fields.", "error");
      return;
    }

    submitBtn.classList.add("loading");
    submitBtn.disabled = true;

    try {
      const data = await fetchWithErrorHandling(url, {
        method,
        body: JSON.stringify(body),
      });

      if (data) {
        showToast(
          data.message || "Operation completed successfully",
          "success"
        );
        form.reset();

        // Close any open details elements
        const detailsElement = form.closest("details");
        if (detailsElement) detailsElement.open = false;

        // Close modal if it exists
        hideModal("create-item-modal");

        if (callback) callback();
      }
    } catch (error) {
      console.error("Form submission error:", error);
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
          (sub) => {
            const queryText = sub.selectedPhotos.map(p => `"${p.name}"`).join(" OR ");
            const lightroomText = sub.selectedPhotos.map(p => {
              const name = p.name || "";
              return name.replace(/\.[^/.]+$/, "");
            }).join(", ");
            return `
              <div class="submission-item">
                <div class="submission-header">
                  <p><strong>Date:</strong> ${new Date(sub.submittedAt).toLocaleString()}</p>
                  <p><strong>Gallery:</strong> <span class="gallery-badge">${sub.gallerySlug || "N/A"}</span></p>
                </div>
                
                <p class="selections-label"><strong>Selections (${sub.selectedPhotos.length}):</strong></p>
                <ul class="photo-selection-list">
                  ${sub.selectedPhotos.map((p, idx) => `
                    <li>
                      <span class="photo-index">${idx + 1}</span>
                      <div class="photo-info-wrapper">
                        <span class="photo-name">${p.name}</span>
                        ${p.note ? `<span class="photo-note"><i class="fas fa-comment-dots"></i> Note: ${p.note}</span>` : ''}
                      </div>
                      ${p.id ? `<a href="https://drive.google.com/open?id=${p.id}" target="_blank" class="photo-link-icon" title="View in Google Drive"><i class="fas fa-external-link-alt"></i></a>` : ''}
                    </li>
                  `).join("")}
                </ul>

                <div class="search-query-container">
                  <div class="search-query-header">
                    <span class="search-query-label"><i class="fab fa-google-drive"></i> Google Drive Search Query</span>
                  </div>
                  <div class="search-query-box-wrapper">
                    <code class="search-query-code">${queryText}</code>
                    <button class="btn btn-primary btn-small copy-query-btn" data-query="${encodeURIComponent(queryText)}">
                      <i class="fas fa-copy"></i> <span>Copy</span>
                    </button>
                  </div>
                </div>

                <div class="search-query-container" style="margin-top: 12px;">
                  <div class="search-query-header">
                    <span class="search-query-label"><i class="fas fa-camera"></i> Adobe Lightroom Query (Base Filenames)</span>
                  </div>
                  <div class="search-query-box-wrapper">
                    <code class="search-query-code">${lightroomText}</code>
                    <button class="btn btn-primary btn-small copy-lr-btn" data-query="${encodeURIComponent(lightroomText)}">
                      <i class="fas fa-copy"></i> <span>Copy Lightroom List</span>
                    </button>
                  </div>
                </div>
              </div>
            `;
          }
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

  const shareGallery = async (name, slug) => {
    const galleryUrl = `${window.location.origin}/gallery/${slug}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Signature Photography: ${name}`,
          text: `View the "${name}" photo gallery.`,
          url: galleryUrl,
        });
      } catch (err) {
        // Share cancelled
      }
    } else {
      try {
        await navigator.clipboard.writeText(galleryUrl);
        showToast("Gallery link copied!", "success");
      } catch (err) {
        showToast("Failed to copy link.", "error");
      }
    }
  };

  // --- LAYOUT VISIBILITY MANAGEMENT ---
  const handleLayoutVisibility = () => {
    const fabButton = document.getElementById("fab-create");
    const bottomTabBar = document.querySelector(
      ".dashboard-content > .tab-nav"
    );

    if (window.innerWidth <= 768) {
      // On MOBILE, ensure they are visible
      if (fabButton) {
        fabButton.style.display = "flex";
        fabButton.style.visibility = "visible";
      }
      if (bottomTabBar) {
        bottomTabBar.style.display = "flex";
        bottomTabBar.style.visibility = "visible";
      }
    } else {
      // On DESKTOP, hide mobile elements
      if (fabButton) {
        fabButton.style.display = "none";
      }
      if (bottomTabBar) {
        bottomTabBar.style.display = "none";
      }
    }
  };

  // --- SIDEBAR TOGGLE FUNCTIONALITY ---
  const initializeSidebarToggle = () => {
    if (sidebarToggle) {
      sidebarToggle.addEventListener("click", (e) => {
        e.preventDefault();
        document.body.classList.toggle("sidebar-open");
      });
    }

    if (sidebarOverlay) {
      sidebarOverlay.addEventListener("click", () => {
        document.body.classList.remove("sidebar-open");
      });
    }

    // Close sidebar on escape key
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        document.body.classList.contains("sidebar-open")
      ) {
        document.body.classList.remove("sidebar-open");
      }
    });
  };

  // --- INITIALIZATION & CORE APP LOGIC ---
  const showDashboard = async () => {
    if (loginView) loginView.style.display = "none";
    if (dashboardContent) dashboardContent.classList.add("visible");
    if (adminWelcome)
      adminWelcome.textContent = `Welcome, ${
        localStorage.getItem("adminUsername") || "Admin"
      }`;

    // Load each piece of data separately for better error handling
    try {
      await fetchStats();
      await fetchList("galleries");
      await fetchList("clients");
      await fetchList("contacts");
      await fetchAllClientAndGalleryData();
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
      showToast("Error loading dashboard data. Please refresh.", "error");
    }
  };

  window.refreshDashboardData = async () => {
    try {
      await fetchStats();
      await fetchList("galleries");
      await fetchList("clients");
      await fetchList("contacts");
      await fetchAllClientAndGalleryData();
    } catch (error) {
      console.error("Failed to refresh dashboard data:", error);
    }
  };

  const logout = () => {
    localStorage.clear();
    location.reload();
  };

  // --- ADD VALIDATION STYLES ---
  const addValidationStyles = () => {
    const style = document.createElement("style");
    style.textContent = `
      .form-group input.error,
      .form-group select.error {
        border-color: #dc3545 !important;
        box-shadow: 0 0 8px rgba(220, 53, 69, 0.3) !important;
      }
      
      .dashboard-initialized .dashboard-main {
        opacity: 1;
        transform: translateY(0);
      }
      
      .dashboard-main {
        opacity: 0;
        transform: translateY(20px);
        transition: opacity 0.3s ease, transform 0.3s ease;
      }
    `;
    document.head.appendChild(style);
  };

  // --- THEME AND UI INITIALIZATION ---
  applyAdminTheme(getAdminTheme());
  addValidationStyles();

  if (themeToggle)
    themeToggle.addEventListener("click", () => {
      const next = getAdminTheme() === "dark" ? "light" : "dark";
      localStorage.setItem("adminTheme", next);
      applyAdminTheme(next);
    });

  // Initialize sidebar toggle
  initializeSidebarToggle();

  if (logoutBtn)
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      logout();
    });

  // --- TAB NAVIGATION ---
  allTabNavs.forEach((nav) => {
    nav.addEventListener("click", (e) => {
      const tabButton = e.target.closest(".tab-btn");
      if (!tabButton) return;
      const targetTab = tabButton.dataset.tab;
      allTabNavs.forEach((navBar) => {
        navBar
          .querySelectorAll(".tab-btn")
          .forEach((btn) =>
            btn.classList.toggle("active", btn.dataset.tab === targetTab)
          );
      });
      document
        .querySelectorAll(".tab-panel")
        .forEach((panel) =>
          panel.classList.toggle("active", panel.id === `${targetTab}-panel`)
        );
    });
  });

  // --- LOGIN FORM ---
  if (loginForm)
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = document.getElementById("username").value;
      const password = document.getElementById("password").value;
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

  // --- GLOBAL EVENT DELEGATION ---
  document.addEventListener("click", async (e) => {
    const toggleButton = e.target.closest(".password-toggle");
    if (toggleButton) {
      const parent = toggleButton.parentElement;
      const input = parent.querySelector("input");
      const icon = toggleButton.querySelector("i");
      if (input && icon) {
        const isPassword = input.type === "password";
        input.type = isPassword ? "text" : "password";
        icon.classList.toggle("fa-eye", !isPassword);
        icon.classList.toggle("fa-eye-slash", isPassword);
      }
      return;
    }

    const copyBtn = e.target.closest(".copy-query-btn, .copy-lr-btn");
    if (copyBtn) {
      const isLR = copyBtn.classList.contains("copy-lr-btn");
      const msg = isLR ? "Adobe Lightroom query copied!" : "Google Drive search query copied!";
      const query = decodeURIComponent(copyBtn.dataset.query);
      navigator.clipboard.writeText(query)
        .then(() => {
          showToast(msg, "success");
          const originalHTML = copyBtn.innerHTML;
          copyBtn.innerHTML = `<i class="fas fa-check"></i> <span>Copied!</span>`;
          copyBtn.classList.add("copied");
          setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
            copyBtn.classList.remove("copied");
          }, 2000);
        })
        .catch(err => {
          console.error("Copy failed:", err);
          showToast(isLR ? "Failed to copy Lightroom list." : "Failed to copy search query.", "error");
        });
      return;
    }

    const copyShareBtn = e.target.closest(".copy-client-share-btn");
    if (copyShareBtn) {
      const clientId = copyShareBtn.dataset.clientId;
      const gallerySlug = copyShareBtn.dataset.gallerySlug;
      const originalHTML = copyShareBtn.innerHTML;
      copyShareBtn.disabled = true;
      copyShareBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
      fetch(`/api/clients/${clientId}/share-link?gallerySlug=${gallerySlug}`, { headers: getAuthHeaders() })
        .then(res => res.json())
        .then(data => {
          if (data.shareUrl) {
            navigator.clipboard.writeText(data.shareUrl)
              .then(() => {
                showToast("Auto-login secure link copied!", "success");
                copyShareBtn.innerHTML = `<i class="fas fa-check"></i> Copied!`;
                setTimeout(() => {
                  copyShareBtn.innerHTML = originalHTML;
                  copyShareBtn.disabled = false;
                }, 2000);
              });
          } else {
            throw new Error(data.message || "Failed to generate link.");
          }
        })
        .catch(err => {
          showToast(err.message || "Could not generate link.", "error");
          copyShareBtn.innerHTML = originalHTML;
          copyShareBtn.disabled = false;
        });
      return;
    }

    const whatsappShareBtn = e.target.closest(".whatsapp-client-share-btn");
    if (whatsappShareBtn) {
      const clientId = whatsappShareBtn.dataset.clientId;
      const clientName = decodeURIComponent(whatsappShareBtn.dataset.clientName);
      const gallerySlug = whatsappShareBtn.dataset.gallerySlug;
      const originalHTML = whatsappShareBtn.innerHTML;
      whatsappShareBtn.disabled = true;
      whatsappShareBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
      fetch(`/api/clients/${clientId}/share-link?gallerySlug=${gallerySlug}`, { headers: getAuthHeaders() })
        .then(res => res.json())
        .then(data => {
          if (data.shareUrl) {
            const message = `Hi ${clientName}, your photo gallery is ready! You can view and select your favorite photos using this link: ${data.shareUrl}`;
            const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
            window.open(whatsappUrl, "_blank");
            showToast("Opening WhatsApp Web...", "success");
            whatsappShareBtn.innerHTML = originalHTML;
            whatsappShareBtn.disabled = false;
          } else {
            throw new Error(data.message || "Failed to generate link.");
          }
        })
        .catch(err => {
          showToast(err.message || "Could not generate link.", "error");
          whatsappShareBtn.innerHTML = originalHTML;
          whatsappShareBtn.disabled = false;
        });
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
        ?.querySelector(`.dropdown-menu[data-menu-for="${id}"]`);
      if (!originalMenu) return;
      const clonedMenu = originalMenu.cloneNode(true);
      clonedMenu.classList.add("dropdown-menu-global");
      clonedMenu.dataset.owner = id;
      document.body.appendChild(clonedMenu);
      const btnRect = target.getBoundingClientRect();
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
        ).textContent = `Are you sure you want to delete this ${type}?`;
        showModal("confirm-modal");
        break;
      case "view-submissions":
        openSubmissionHistoryModal(email, name);
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
          const assigned = state.allGalleries.filter((g) =>
            client.galleryIds.includes(g._id)
          );
          galleryUList.innerHTML =
            assigned.length > 0
              ? assigned.map((g) => `
                  <li style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                    <span>${g.name}</span>
                    <div style="display: flex; gap: 6px;">
                      <button class="btn btn-secondary btn-small copy-client-share-btn" data-client-id="${client._id}" data-gallery-slug="${g.slug}" style="padding: 4px 10px; font-size: 0.75rem;">
                        <i class="fas fa-link"></i> Copy Link
                      </button>
                      <button class="btn btn-primary btn-small whatsapp-client-share-btn" data-client-id="${client._id}" data-client-name="${encodeURIComponent(client.name)}" data-gallery-slug="${g.slug}" style="padding: 4px 10px; font-size: 0.75rem;">
                        <i class="fab fa-whatsapp"></i> WhatsApp
                      </button>
                    </div>
                  </li>
                `).join("")
              : "<li>No galleries assigned.</li>";
          showModal("view-client-modal");
        }
        break;
      case "export-clients": {
        try {
          const result = await fetchWithErrorHandling("/api/clients?limit=10000", { cache: "no-cache" });
          if (result && result.data) {
            const headers = ["ID", "Name", "Username", "Created At", "Assigned Galleries Count"];
            const rows = result.data.map(c => [
              c.id,
              c.name,
              c.username,
              c.createdAt,
              c.galleryIds ? c.galleryIds.length : 0
            ]);
            exportToCSV("clients.csv", headers, rows);
            showToast("Clients exported to CSV successfully!", "success");
          }
        } catch (err) {
          console.error("Export clients failed:", err);
        }
        break;
      }
      case "export-contacts": {
        try {
          const result = await fetchWithErrorHandling("/api/contacts?limit=10000", { cache: "no-cache" });
          if (result && result.data) {
            const headers = ["ID", "Name", "Email", "Phone", "Created At", "Last Submitted At"];
            const rows = result.data.map(c => [
              c.id,
              c.name,
              c.email,
              c.phone,
              c.createdAt,
              c.lastSubmittedAt
            ]);
            exportToCSV("contacts.csv", headers, rows);
            showToast("Contacts exported to CSV successfully!", "success");
          }
        } catch (err) {
          console.error("Export contacts failed:", err);
        }
        break;
      }
    }
  });

  // --- SEARCH FUNCTIONALITY ---
  Object.keys(typeMap).forEach((type) => {
    const searchInput = document.getElementById(`${typeMap[type]}-search`);
    if (searchInput)
      searchInput.addEventListener(
        "keyup",
        debounce((e) => {
          state[type].search = e.target.value;
          state[type].page = 1;
          fetchList(type);
        }, 500)
      );
  });

  // --- MODAL CONTROLS ---
  document
    .querySelectorAll(".modal .close-btn, #confirm-no")
    .forEach((btn) =>
      btn.addEventListener("click", (e) =>
        hideModal(e.target.closest(".modal").id)
      )
    );

  // --- CREATE GALLERY FORM ---
  if (createGalleryForm)
    createGalleryForm.addEventListener("submit", (e) => {
      e.preventDefault();
      handleFormSubmit(
        "/api/galleries",
        "POST",
        {
          name: document.getElementById("gallery-name").value,
          folderLink: document.getElementById("folder-link").value,
          clientId: document.getElementById("client-select").value,
          selectionLimit: document.getElementById("gallery-limit").value,
        },
        createGalleryForm,
        () => {
          fetchList("galleries");
          fetchStats();
          fetchAllClientAndGalleryData();
        }
      );
    });

  // --- CREATE CLIENT FORM ---
  if (createClientForm)
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

  // --- EDIT CLIENT FORM ---
  document
    .getElementById("edit-client-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const clientId = document.getElementById("edit-client-id").value;
      const formData = {
        name: document.getElementById("edit-client-name").value,
        username: document.getElementById("edit-client-username").value,
      };
      const password = document.getElementById("edit-client-password").value;
      if (password.trim()) formData.password = password;

      handleFormSubmit(
        `/api/clients/${clientId}`,
        "PUT",
        formData,
        form,
        () => {
          fetchList("clients");
          fetchAllClientAndGalleryData();
          hideModal("edit-client-modal");
        }
      );
    });

  // --- ASSIGN GALLERY FORM ---
  document
    .getElementById("assign-gallery-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const clientId = document.getElementById("assign-client-id").value;
      const checkboxes = form.querySelectorAll(
        'input[name="galleryIds"]:checked'
      );
      const galleryIds = Array.from(checkboxes).map((cb) => cb.value);

      handleFormSubmit(
        `/api/clients/${clientId}/assign`,
        "PUT",
        { galleryIds },
        form,
        () => {
          fetchList("clients");
          fetchAllClientAndGalleryData();
          hideModal("assign-gallery-modal");
        }
      );
    });

  // --- DELETE CONFIRMATION ---
  document
    .getElementById("confirm-yes")
    ?.addEventListener("click", async () => {
      if (!itemToDelete.type || !itemToDelete.id) return;

      try {
        const endpointType = itemToDelete.type === "gallery" ? "galleries" : `${itemToDelete.type}s`;
        await fetchWithErrorHandling(
          `/api/${endpointType}/${itemToDelete.id}`,
          {
            method: "DELETE",
          }
        );

        fetchList(endpointType);
        fetchStats();
        fetchAllClientAndGalleryData();
        hideModal("confirm-modal");
        itemToDelete = { type: null, id: null };
      } catch (error) {
        console.error("Delete operation failed:", error);
      }
    });

  // --- FAB (FLOATING ACTION BUTTON) FOR MOBILE ---
  if (
    fabCreate &&
    createItemModal &&
    createGalleryFormContainer &&
    createClientFormContainer
  ) {
    fabCreate.addEventListener("click", () => {
      const activeTab = document.querySelector(".tab-nav .tab-btn.active")
        ?.dataset.tab;
      const modalBody = createItemModal.querySelector(".modal-body");
      modalBody.innerHTML = "";
      if (activeTab === "galleries") {
        createModalTitle.textContent = "Create Gallery";
        modalBody.appendChild(createGalleryFormContainer);
        showModal("create-item-modal");
      } else if (activeTab === "clients") {
        createModalTitle.textContent = "Create Client";
        modalBody.appendChild(createClientFormContainer);
        showModal("create-item-modal");
      }
    });
  }

  // --- LAYOUT VISIBILITY MANAGEMENT ---
  // Run the layout visibility check when the page loads
  handleLayoutVisibility();

  // Listen for window resize events with debouncing
  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(handleLayoutVisibility, 250);
  });

  // Add CSS class for proper initialization
  document.body.classList.add("dashboard-initialized");

  // --- FINAL INITIALIZATION ---
  // Check authentication and show appropriate view
  if (getToken()) {
    showDashboard();
  } else {
    // Ensure login view is visible
    if (loginView) loginView.style.display = "flex";
    if (dashboardContent) dashboardContent.classList.remove("visible");
  }
});
