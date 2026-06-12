document.addEventListener("DOMContentLoaded", () => {
  // --- STATE & CONFIG ---
  let selectedPhotos = [];
  let allPhotos = [];
  let currentLightboxIndex = -1;
  let currentPage = 1;
  let totalPages = 1;
  let isLoading = false;
  let selectionLimit = null;

  // --- QUERY PARAM AUTO-LOGIN PARSING ---
  const urlParams = new URLSearchParams(window.location.search);
  const tokenParam = urlParams.get("token");
  const nameParam = urlParams.get("name");
  if (tokenParam) {
    sessionStorage.setItem("clientToken", tokenParam);
    if (nameParam) {
      sessionStorage.setItem("clientName", decodeURIComponent(nameParam));
    }
    // Scrub credentials from address bar
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  const pathSegments = window.location.pathname.split("/").filter(Boolean);
  const gallerySlug = pathSegments[pathSegments.length - 1] || "";

  // --- ELEMENT SELECTORS ---
  const clientLoginView = document.getElementById("client-login-view");
  const galleryContainer = document.getElementById("gallery-container");
  const clientLoginForm = document.getElementById("client-login-form");
  const photoGallery = document.getElementById("photo-gallery");
  const stickySubmitBtn = document.getElementById("sticky-submit-btn");
  const selectionCountBtn = document.getElementById("selection-count-btn");
  const submissionModal = document.getElementById("submission-modal");
  const selectionForm = document.getElementById("selection-form");
  const closeModalBtn = document.getElementById("close-modal-btn");
  const loadingSentinel = document.getElementById("loading-sentinel");
  const loginMessageArea = document.getElementById("login-message-area");
  const headerSubtitle = document.getElementById("header-subtitle");
  const pageMainTitle = document.getElementById("page-main-title");
  const toastContainer = document.getElementById("toast-container");
  const lightboxOverlay = document.getElementById("lightbox-overlay");
  const lightboxImg = document.getElementById("lightbox-img");
  const lightboxClose = document.getElementById("lightbox-close");
  const lightboxPrev = document.getElementById("lightbox-prev");
  const lightboxNext = document.getElementById("lightbox-next");
  const lightboxCheckbox = document.getElementById(
    "lightbox-selection-checkbox"
  );
  const lightboxLoader = document.getElementById("lightbox-loader");
  const selectedOnlyToggle = document.getElementById("selected-only-toggle");
  const lightboxPhotoNote = document.getElementById("lightbox-photo-note");
  const selectionLimitContainer = document.getElementById("selection-limit-container");
  const selectionLimitStatus = document.getElementById("selection-limit-status");

  // Two-step modal elements
  const reviewGrid = document.getElementById("review-grid");
  const reviewContinueBtn = document.getElementById("review-continue-btn");
  const formBackBtn = document.getElementById("form-back-btn");
  const modalStepReview = document.getElementById("modal-step-review");
  const modalStepForm = document.getElementById("modal-step-form");
  const selectionCountModalForm = document.getElementById("selection-count-modal-form");

  // --- OBSERVER FOR LAZY LOADING IMAGES ---
  const imageObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const container = entry.target;
          const mainImage = container.querySelector(".main-image");
          if (mainImage && mainImage.dataset.src) {
            mainImage.src = mainImage.dataset.src;
          }
          observer.unobserve(container);
        }
      });
    },
    { rootMargin: "600px" }
  );

  // --- OBSERVER FOR PAGINATION ---
  const paginationObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        fetchPhotos();
      }
    },
    { rootMargin: "1000px" }
  );

  // --- HELPERS ---
  const getClientToken = () => sessionStorage.getItem("clientToken");

  window.showToast = (message, type = "success", timeout = 3500) => {
    if (!toastContainer) return;
    const t = document.createElement("div");
    t.className = `sp-toast ${type === "success" ? "success" : "error"}`;
    t.innerHTML = `<strong>${
      type === "success" ? "Success" : "Error"
    }:</strong><span style="margin-left:6px">${message}</span>`;
    toastContainer.appendChild(t);
    setTimeout(() => (t.style.opacity = "0.01"), timeout);
    setTimeout(() => t.remove(), timeout + 600);
  };

  const showLoginError = (message) => {
    if (!loginMessageArea) return;
    loginMessageArea.textContent = message;
    loginMessageArea.style.display = "block";
    loginMessageArea.style.animation = "shake 0.5s ease-in-out";
    setTimeout(() => {
      if (loginMessageArea) loginMessageArea.style.animation = "";
    }, 500);
  };

  const clearLoginError = () => {
    if (loginMessageArea) {
      loginMessageArea.style.display = "none";
      loginMessageArea.textContent = "";
    }
  };

  // --- API & DATA FETCHING ---
  // --- SKELETON HELPERS ---
  const SKELETON_RATIOS = [
    [3, 4], [4, 5], [2, 3], [3, 2], [4, 3], [16, 9], [1, 1], [5, 7]
  ];
  let _skeletonNodes = [];

  const insertSkeletons = (count = 6) => {
    const columns = photoGallery ? photoGallery.querySelectorAll(".gallery-column") : [];
    if (columns.length === 0) return;
    _skeletonNodes = [];
    for (let i = 0; i < count; i++) {
      const col = columns[i % columns.length];
      const [w, h] = SKELETON_RATIOS[i % SKELETON_RATIOS.length];
      const skel = document.createElement("div");
      skel.className = "photo-container skeleton-placeholder";
      skel.style.aspectRatio = `${w} / ${h}`;
      col.appendChild(skel);
      _skeletonNodes.push(skel);
    }
  };

  const removeSkeletons = () => {
    _skeletonNodes.forEach((n) => n.remove());
    _skeletonNodes = [];
  };

  const fetchPhotos = async () => {
    if (selectedOnlyToggle && selectedOnlyToggle.checked) return;
    if (isLoading || (currentPage > totalPages && totalPages > 1)) return;
    isLoading = true;
    if (loadingSentinel)
      loadingSentinel.querySelector(".loader").style.display = "inline-block";

    // Pre-render shimmer skeletons so columns visually extend below viewport
    if (currentPage > 1) insertSkeletons(6);

    try {
      const res = await fetch(
        `/api/my-gallery?slug=${gallerySlug}&page=${currentPage}&limit=60`,
        {
          headers: { Authorization: `Bearer ${getClientToken()}` },
        }
      );
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.error || "Access Denied / Session Expired";
        window.showToast(errMsg, "error");
        sessionStorage.clear();
        setTimeout(() => {
          window.location.href = "/";
        }, 2500);
        removeSkeletons();
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch gallery data.");
      const data = await res.json();
      totalPages = data.totalPages;
      if (data.selectionLimit) {
        selectionLimit = parseInt(data.selectionLimit) || null;
      }
      removeSkeletons();
      allPhotos.push(...data.photos);
      renderPhotos(data.photos);
      currentPage++;
    } catch (error) {
      console.error(error);
      removeSkeletons();
    } finally {
      isLoading = false;
      if (loadingSentinel)
        loadingSentinel.querySelector(".loader").style.display = "none";
      if (currentPage > totalPages && loadingSentinel) {
        loadingSentinel.style.display = "none";
      }
    }
  };

  // --- RENDER FUNCTIONS ---
  const setupColumns = () => {
    if (!photoGallery) return;
    photoGallery.innerHTML = "";
    // 3 columns on desktop, 2 columns on mobile/tablet devices
    const colCount = window.innerWidth <= 768 ? 2 : 3;
    for (let i = 0; i < colCount; i++) {
      const col = document.createElement("div");
      col.className = "gallery-column";
      photoGallery.appendChild(col);
    }
  };

  const renderPhotos = (photos) => {
    const columns = photoGallery.querySelectorAll(".gallery-column");
    if (columns.length === 0) return;

    // Track column heights based on already appended children's aspect ratios
    const colHeights = Array.from(columns).map((col) => {
      let height = 0;
      col.querySelectorAll(".photo-container").forEach((c) => {
        const arStr = c.style.aspectRatio;
        if (arStr) {
          const parts = arStr.split("/");
          const w = parseFloat(parts[0]);
          const h = parseFloat(parts[1]);
          if (w && h) {
            height += h / w; // Normalized height contribution
          }
        }
      });
      return height;
    });

    photos.forEach((photo) => {
      const container = document.createElement("div");
      container.className = "photo-container";
      container.dataset.photoId = photo.id;
      container.dataset.photoName = photo.name;
      
      // Reserve aspect ratio space to prevent page layout jumps
      const width = photo.width || 400;
      const height = photo.height || 300;
      container.style.aspectRatio = `${width} / ${height}`;

      const bgImage = document.createElement("img");
      bgImage.className = "bg-image";
      const mainImage = document.createElement("img");
      mainImage.className = "main-image";
      mainImage.alt = photo.name;
      mainImage.referrerPolicy = "no-referrer";
      mainImage.dataset.src = photo.url;
      mainImage.onload = () => {
        bgImage.src = mainImage.src;
        container.classList.add("loaded");
      };
      const checkbox = document.createElement("div");
      checkbox.className = "selection-checkbox";
      container.append(bgImage, mainImage, checkbox);

      // Find the shortest column index
      let shortestColIndex = 0;
      let minHeight = colHeights[0];
      for (let i = 1; i < colHeights.length; i++) {
        if (colHeights[i] < minHeight) {
          minHeight = colHeights[i];
          shortestColIndex = i;
        }
      }

      columns[shortestColIndex].appendChild(container);
      colHeights[shortestColIndex] += height / width;

      imageObserver.observe(container);
    });
  };

  const updateStickyButtonVisibility = () => {
    if (stickySubmitBtn) {
      stickySubmitBtn.classList.toggle("visible", selectedPhotos.length > 0);
    }
  };

  // --- REVIEW GRID POPULATION ---
  const populateReviewGrid = () => {
    if (!reviewGrid) return;
    reviewGrid.innerHTML = "";
    selectedPhotos.forEach((photo) => {
      const thumb = document.createElement("div");
      thumb.className = "review-thumb";
      thumb.dataset.photoId = photo.id;

      const img = document.createElement("img");
      img.src = photo.url || `https://drive.google.com/thumbnail?id=${photo.id}&sz=w400`;
      img.alt = photo.name;
      img.referrerPolicy = "no-referrer";
      img.loading = "lazy";
      thumb.appendChild(img);

      if (photo.note && photo.note.trim()) {
        const noteEl = document.createElement("div");
        noteEl.className = "thumb-note";
        noteEl.title = photo.note;
        noteEl.textContent = photo.note;
        thumb.appendChild(noteEl);
      }

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-thumb";
      removeBtn.innerHTML = "&times;";
      removeBtn.title = "Remove from selection";
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleSelection(photo.id, photo.name);
        populateReviewGrid();
      });
      thumb.appendChild(removeBtn);

      reviewGrid.appendChild(thumb);
    });
  };

  // --- MODAL STEP NAVIGATION ---
  const openReviewStep = () => {
    if (modalStepReview) modalStepReview.classList.add("active");
    if (modalStepForm) modalStepForm.classList.remove("active");
    populateReviewGrid();
  };

  const openFormStep = () => {
    if (modalStepForm) modalStepForm.classList.add("active");
    if (modalStepReview) modalStepReview.classList.remove("active");
    if (selectionCountModalForm) selectionCountModalForm.textContent = selectedPhotos.length;
  };

  const updateSelectionUI = () => {
    const count = selectedPhotos.length;
    if (selectionCountBtn) selectionCountBtn.textContent = count;
    const modalCountEl = document.getElementById("selection-count-modal");
    if (modalCountEl) modalCountEl.textContent = count;

    // Render Quota Progress Badge
    if (selectionLimitContainer && selectionLimitStatus) {
      if (selectionLimit !== null && selectionLimit > 0) {
        selectionLimitContainer.style.display = "block";
        selectionLimitStatus.textContent = `${count} / ${selectionLimit}`;
        
        // Visual warning updates
        if (count >= selectionLimit) {
          selectionLimitContainer.style.color = "var(--brand-gold-dark)";
          if (count > selectionLimit) {
            selectionLimitContainer.style.color = "#dc3545"; // Warning red if over limit
          }
        } else {
          selectionLimitContainer.style.color = "var(--text-color-secondary)";
        }
      } else {
        selectionLimitContainer.style.display = "none";
      }
    }

    document.querySelectorAll(".photo-container").forEach((el) => {
      el.classList.toggle(
        "selected",
        selectedPhotos.some((p) => p.id === el.dataset.photoId)
      );
    });
    if (currentLightboxIndex > -1) {
      const currentPhoto = allPhotos[currentLightboxIndex];
      const selectedItem = selectedPhotos.find((p) => p.id === currentPhoto.id);
      if (lightboxCheckbox) {
        lightboxCheckbox.classList.toggle("selected", !!selectedItem);
      }
      if (lightboxPhotoNote) {
        lightboxPhotoNote.value = selectedItem ? (selectedItem.note || "") : "";
      }
    }
    updateStickyButtonVisibility();
  };

  // --- LIGHTBOX LOGIC ---
  const openLightbox = (photoId) => {
    currentLightboxIndex = allPhotos.findIndex((p) => p.id === photoId);
    if (currentLightboxIndex === -1) return;
    updateLightboxImage();
    if (lightboxOverlay) lightboxOverlay.style.display = "flex";
    document.body.classList.add("lightbox-active");
  };

  const closeLightbox = () => {
    if (lightboxOverlay) lightboxOverlay.style.display = "none";
    if (lightboxImg) lightboxImg.src = "";
    if (lightboxLoader) lightboxLoader.style.display = "none";
    currentLightboxIndex = -1;
    document.body.classList.remove("lightbox-active");
  };

  const updateLightboxImage = () => {
    if (currentLightboxIndex < 0 || !allPhotos[currentLightboxIndex]) return;
    const photo = allPhotos[currentLightboxIndex];
    if (lightboxImg && lightboxLoader) {
      lightboxLoader.style.display = "block";
      lightboxImg.style.opacity = "0";
      lightboxImg.referrerPolicy = "no-referrer";
      lightboxImg.onload = () => {
        lightboxLoader.style.display = "none";
        lightboxImg.style.opacity = "1";
      };
      lightboxImg.src = `https://drive.google.com/thumbnail?id=${photo.id}&sz=w1920`;

      // Pre-fetch adjacent images for seamless slideshow UX
      if (allPhotos.length > 1) {
        const nextIdx = (currentLightboxIndex + 1) % allPhotos.length;
        const nextPhoto = allPhotos[nextIdx];
        if (nextPhoto) {
          const preloadNext = new Image();
          preloadNext.src = `https://drive.google.com/thumbnail?id=${nextPhoto.id}&sz=w1920`;
        }

        const prevIdx = (currentLightboxIndex - 1 + allPhotos.length) % allPhotos.length;
        const prevPhoto = allPhotos[prevIdx];
        if (prevPhoto) {
          const preloadPrev = new Image();
          preloadPrev.src = `https://drive.google.com/thumbnail?id=${prevPhoto.id}&sz=w1920`;
        }
      }
    }
    updateSelectionUI();
  };

  const showNextImage = () => {
    currentLightboxIndex = (currentLightboxIndex + 1) % allPhotos.length;
    updateLightboxImage();
  };

  const showPrevImage = () => {
    currentLightboxIndex =
      (currentLightboxIndex - 1 + allPhotos.length) % allPhotos.length;
    updateLightboxImage();
  };

  const toggleSelection = (photoId, photoName, note = "") => {
    // Look up URL from allPhotos
    const photoData = allPhotos.find((p) => p.id === photoId);
    const photoUrl = photoData ? photoData.url : `https://drive.google.com/thumbnail?id=${photoId}&sz=w400`;
    const photo = { id: photoId, name: photoName, note: note, url: photoUrl };
    const index = selectedPhotos.findIndex((p) => p.id === photo.id);
    if (index > -1) {
      selectedPhotos.splice(index, 1);
    } else {
      // Enforce selection limit
      if (selectionLimit !== null && selectionLimit > 0 && selectedPhotos.length >= selectionLimit) {
        window.showToast(`Selection limit of ${selectionLimit} photos reached! Please remove another photo first.`, "error");
        return;
      }
      selectedPhotos.push(photo);
    }
    updateSelectionUI();
  };

  const updatePhotoNote = (photoId, photoName, note) => {
    const index = selectedPhotos.findIndex((p) => p.id === photoId);
    if (index > -1) {
      selectedPhotos[index].note = note;
    } else {
      if (note.trim() !== "") {
        // Enforce selection limit on auto-select
        if (selectionLimit !== null && selectionLimit > 0 && selectedPhotos.length >= selectionLimit) {
          window.showToast(`Selection limit of ${selectionLimit} photos reached! Could not select photo.`, "error");
          if (lightboxPhotoNote) lightboxPhotoNote.value = "";
          return;
        }
        const photoData = allPhotos.find((p) => p.id === photoId);
        const photoUrl = photoData ? photoData.url : `https://drive.google.com/thumbnail?id=${photoId}&sz=w400`;
        selectedPhotos.push({ id: photoId, name: photoName, note: note, url: photoUrl });
      }
    }
    updateSelectionUI();
  };

  // --- FORM LOGIC ---
  const validateLoginForm = (username, password) => {
    const errors = [];
    if (!username.trim()) errors.push("Username is required");
    if (!password.trim()) errors.push("Password is required");
    return errors;
  };

  const validateSubmissionForm = (name, email, phone) => {
    const errors = [];
    if (!name.trim()) errors.push("Name is required");
    if (!email.trim()) errors.push("Email is required");
    if (!phone.trim()) errors.push("Phone number is required");
    if (name.length < 2) errors.push("Name must be at least 2 characters");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errors.push("Please enter a valid email address");
    const cleanPhone = phone.replace(/[^\d+]/g, "");
    if (!/^\+?\d{7,15}$/.test(cleanPhone))
      errors.push("Please enter a valid phone number");
    return errors;
  };

  const displayGallerySelection = (galleries) => {
    if (!clientLoginView) return;
    const clientName = sessionStorage.getItem("clientName");
    const welcomeTitle = clientName
      ? `Welcome, ${clientName.split(" ")[0]}`
      : "Select a Gallery";
    clientLoginView.innerHTML = `<div class="login-page-wrapper"><div class="login-brand-panel"><h1>${welcomeTitle}</h1><p>You have access to multiple galleries. Please choose one to continue.</p></div><div class="login-form-panel"><div class="gallery-links">${galleries
      .map(
        (g) =>
          `<a href="/gallery/${g.slug}" class="submit-btn gallery-link-btn">${g.name}</a>`
      )
      .join("")}</div></div></div>`;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    clearLoginError();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const username = document.getElementById("client-username").value;
    const password = document.getElementById("client-password").value;
    if (validateLoginForm(username, password).length > 0) {
      showLoginError("Username and password are required.");
      return;
    }
    submitBtn.classList.add("loading");
    submitBtn.disabled = true;
    try {
      const res = await fetch("/api/auth/client-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Login failed");
      sessionStorage.setItem("clientToken", data.token);
      sessionStorage.setItem("clientName", data.clientName);
      showToast(data.message, "success");
      if (data.action === "redirect") {
        window.location.href = data.destination;
      } else if (data.action === "select") {
        displayGallerySelection(data.galleries);
      }
    } catch (error) {
      showLoginError(error.message || "An unknown error occurred.");
    } finally {
      submitBtn.classList.remove("loading");
      submitBtn.disabled = false;
    }
  };

  const handleSubmitSelections = async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const clientName = document.getElementById("client-name").value;
    const clientEmail = document.getElementById("client-email").value;
    const clientPhone = document.getElementById("client-phone").value;
    const validationErrors = validateSubmissionForm(
      clientName,
      clientEmail,
      clientPhone
    );
    if (validationErrors.length > 0) {
      showToast(validationErrors.join(". "), "error");
      return;
    }
    if (selectedPhotos.length === 0) {
      showToast("Please select at least one photo before submitting.", "error");
      return;
    }
    submitBtn.classList.add("loading");
    submitBtn.disabled = true;
    const formData = {
      clientName: clientName.trim(),
      clientEmail: clientEmail.trim(),
      clientPhone: clientPhone.trim(),
      selectedPhotos: selectedPhotos,
      gallerySlug: gallerySlug,
    };
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.message || `Submission failed with status ${res.status}`
        );
      }
      if (selectionForm) selectionForm.style.display = "none";
      const successMessage = document.getElementById("success-message");
      if (successMessage) successMessage.style.display = "block";
      showToast("Your selections have been submitted successfully!", "success");
      selectedPhotos = [];
      updateSelectionUI();
    } catch (error) {
      console.error("Submission error:", error);
      showToast(
        error.message || "There was an error submitting your selections.",
        "error"
      );
    } finally {
      submitBtn.classList.remove("loading");
      submitBtn.disabled = false;
    }
  };

  // --- UI LOGIC ---
  const showGalleryView = () => {
    if (clientLoginView) clientLoginView.style.display = "none";
    if (galleryContainer) galleryContainer.style.display = "block";
    const clientName = sessionStorage.getItem("clientName");
    if (pageMainTitle) {
      pageMainTitle.textContent = clientName
        ? `${clientName}'s Gallery`
        : "Your Private Gallery";
    }
    if (headerSubtitle) {
      headerSubtitle.textContent =
        "Select your favorite photos for editing and final delivery.";
    }
    setupColumns();
    fetchPhotos();
  };

  // --- INITIALIZATION & EVENT LISTENERS ---
  if (clientLoginForm) {
    clientLoginForm.addEventListener("submit", handleLogin);
  }
  if (photoGallery) {
    photoGallery.addEventListener("click", (e) => {
      const container = e.target.closest(".photo-container");
      if (!container) return;
      if (e.target.classList.contains("selection-checkbox")) {
        toggleSelection(container.dataset.photoId, container.dataset.photoName);
      } else {
        openLightbox(container.dataset.photoId);
      }
    });
  }
  if (lightboxClose) {
    lightboxClose.addEventListener("click", closeLightbox);
    lightboxNext.addEventListener("click", showNextImage);
    lightboxPrev.addEventListener("click", showPrevImage);
    lightboxCheckbox.addEventListener("click", () => {
      const current = allPhotos[currentLightboxIndex];
      if (current) {
        const noteVal = lightboxPhotoNote ? lightboxPhotoNote.value : "";
        toggleSelection(current.id, current.name, noteVal);
      }
    });
    // Keyboard navigation for lightbox
    document.addEventListener("keydown", (e) => {
      if (lightboxOverlay && lightboxOverlay.style.display === "flex") {
        if (e.key === "Escape") closeLightbox();
        if (e.key === "ArrowRight") showNextImage();
        if (e.key === "ArrowLeft") showPrevImage();
      }
    });
  }

  if (lightboxPhotoNote) {
    lightboxPhotoNote.addEventListener("input", () => {
      if (currentLightboxIndex > -1) {
        const current = allPhotos[currentLightboxIndex];
        updatePhotoNote(current.id, current.name, lightboxPhotoNote.value);
      }
    });
  }

  if (selectedOnlyToggle) {
    selectedOnlyToggle.addEventListener("change", (e) => {
      if (photoGallery) {
        photoGallery.classList.toggle("filter-selected-only", e.target.checked);
      }
    });
  }

  // Mobile navigation menu and dropdown toggle
  const mobileMenuToggle = document.querySelector(".mobile-menu-toggle");
  const navList = document.querySelector(".main-nav .nav-list");
  if (mobileMenuToggle && navList) {
    mobileMenuToggle.addEventListener("click", () => {
      navList.classList.toggle("active");
    });
  }
  document.addEventListener("click", (e) => {
    const dropdownToggle = e.target.closest(".nav-item.dropdown > a");
    if (dropdownToggle) {
      e.preventDefault();
      const parent = dropdownToggle.closest(".dropdown");
      parent.classList.toggle("open");
    }
  });
  if (stickySubmitBtn) {
    stickySubmitBtn.addEventListener("click", () => {
      if (selectedPhotos.length === 0) {
        showToast(
          "Please select at least one photo before submitting.",
          "error"
        );
        return;
      }
      if (submissionModal) submissionModal.style.display = "flex";
      openReviewStep();
    });
  }
  if (reviewContinueBtn) {
    reviewContinueBtn.addEventListener("click", () => {
      if (selectedPhotos.length === 0) {
        showToast("Please select at least one photo.", "error");
        return;
      }
      openFormStep();
    });
  }
  if (formBackBtn) {
    formBackBtn.addEventListener("click", openReviewStep);
  }
  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
      if (submissionModal) submissionModal.style.display = "none";
    });
  }
  if (selectionForm) {
    selectionForm.addEventListener("submit", handleSubmitSelections);
  }
  if (loadingSentinel) {
    paginationObserver.observe(loadingSentinel);
  }
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
    }
  });

  // Handle debounced re-layout on window resize if column count changes
  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (galleryContainer && galleryContainer.style.display === "block" && allPhotos.length > 0) {
        const currentCols = photoGallery.querySelectorAll(".gallery-column").length;
        const targetCols = window.innerWidth <= 768 ? 2 : 3;
        if (currentCols !== targetCols) {
          setupColumns();
          renderPhotos(allPhotos);
        }
      }
    }, 150);
  });

  if (getClientToken() && gallerySlug) {
    showGalleryView();
  }
});
