document.addEventListener("DOMContentLoaded", () => {
  // --- STATE & CONFIG ---
  let selectedPhotos = [];
  let allPhotos = [];
  let currentLightboxIndex = -1;
  let currentPage = 1;
  let totalPages = 1;
  let isLoading = false;
  const gallerySlug = window.location.pathname.split("/").pop();

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
  console.log("Checking for #loading-sentinel element:", loadingSentinel);

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
    { rootMargin: "200px" }
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
  // In public/js/script.js

const fetchPhotos = async () => {
    if (isLoading || (currentPage > totalPages && totalPages > 1)) return;
    isLoading = true;

    // The FIX is changing 'block' to 'inline-block' to match the CSS
    if (loadingSentinel) loadingSentinel.querySelector('.loader').style.display = 'inline-block';

    try {
        const res = await fetch(`/api/my-gallery?slug=${gallerySlug}&page=${currentPage}&limit=50`, {
            headers: { Authorization: `Bearer ${getClientToken()}` },
        });
        if (res.status === 401) {
            sessionStorage.clear();
            window.location.reload();
            return;
        }
        if (!res.ok) throw new Error("Failed to fetch gallery data.");

        const data = await res.json();
        totalPages = data.totalPages;
        allPhotos.push(...data.photos);
        renderPhotos(data.photos);
        currentPage++;
    } catch (error) {
        console.error(error);
    } finally {
        isLoading = false;
        // Also hide the spinner when done
        if (loadingSentinel) loadingSentinel.querySelector('.loader').style.display = 'none';

        if (currentPage > totalPages && loadingSentinel) {
            loadingSentinel.style.display = 'none';
        }
    }
};
  // --- RENDER FUNCTIONS ---
  const renderPhotos = (photos) => {
    const fragment = document.createDocumentFragment();
    photos.forEach((photo) => {
      const container = document.createElement("div");
      container.className = "photo-container";
      container.dataset.photoId = photo.id;
      container.dataset.photoName = photo.name;
      const loader = document.createElement("div");
      loader.className = "loader";
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
      container.append(loader, bgImage, mainImage, checkbox);
      fragment.appendChild(container);
      imageObserver.observe(container);
    });
    photoGallery.appendChild(fragment);
  };

  const updateStickyButtonVisibility = () => {
    if (stickySubmitBtn && selectedPhotos.length > 0) {
      stickySubmitBtn.classList.add("visible");
    } else if (stickySubmitBtn) {
      stickySubmitBtn.classList.remove("visible");
    }
  };

  const updateSelectionUI = () => {
    const count = selectedPhotos.length;
    if (selectionCountBtn) selectionCountBtn.textContent = count;
    if (document.getElementById("selection-count-modal")) {
      document.getElementById("selection-count-modal").textContent = count;
    }
    document.querySelectorAll(".photo-container").forEach((el) => {
      el.classList.toggle(
        "selected",
        selectedPhotos.some((p) => p.id === el.dataset.photoId)
      );
    });
    if (currentLightboxIndex > -1) {
      const currentPhoto = allPhotos[currentLightboxIndex];
      if (lightboxCheckbox) {
        lightboxCheckbox.classList.toggle(
          "selected",
          selectedPhotos.some((p) => p.id === currentPhoto.id)
        );
      }
    }
    updateStickyButtonVisibility();
  };

  // --- LIGHTBOX LOGIC ---
  // In public/js/script.js

  const openLightbox = (photoId) => {
    console.log(`2. openLightbox received ID: ${photoId}`);

    currentLightboxIndex = allPhotos.findIndex((p) => p.id === photoId);
    console.log(`3. Found photo at index: ${currentLightboxIndex}`);

    if (currentLightboxIndex === -1) {
      console.error("ERROR: Photo ID was not found in the allPhotos array!");
      return;
    }

    const foundPhoto = allPhotos[currentLightboxIndex];
    console.log("4. The photo object at that index is:", foundPhoto);

    updateLightboxImage();
    if (lightboxOverlay) lightboxOverlay.style.display = "flex";
    document.body.classList.add("lightbox-active");
  };

  const closeLightbox = () => {
    if (lightboxOverlay) lightboxOverlay.style.display = "none";
    if (lightboxImg) lightboxImg.src = "";

    // Also hide the loader if the lightbox is closed early
    if (lightboxLoader) lightboxLoader.style.display = "none";

    currentLightboxIndex = -1;
    document.body.classList.remove("lightbox-active");
  };

  const updateLightboxImage = () => {
    if (currentLightboxIndex < 0 || !allPhotos[currentLightboxIndex]) return;
    const photo = allPhotos[currentLightboxIndex];

    if (lightboxImg && lightboxLoader) {
      // 1. Show the loader
      lightboxLoader.style.display = "block";
      // 2. Hide the old image to prevent showing stale content
      lightboxImg.style.opacity = "0";

      lightboxImg.referrerPolicy = "no-referrer";

      // 3. When the new image finishes loading...
      lightboxImg.onload = () => {
        // 4. Hide the loader and show the image
        lightboxLoader.style.display = "none";
        lightboxImg.style.opacity = "1";
      };

      // 5. Set the src to start the download
      lightboxImg.src = `https://drive.google.com/thumbnail?id=${photo.id}&sz=w1920`;
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

  const toggleLightboxSelection = () => {
    if (currentLightboxIndex > -1) {
      const photo = allPhotos[currentLightboxIndex];
      toggleSelection(photo.id, photo.name);
    }
  };

  const toggleSelection = (photoId, photoName) => {
    const photo = { id: photoId, name: photoName };
    const index = selectedPhotos.findIndex((p) => p.id === photo.id);
    if (index > -1) {
      selectedPhotos.splice(index, 1);
    } else {
      selectedPhotos.push(photo);
    }
    updateSelectionUI();
  };

  // --- FORM VALIDATION & SELECTION ---
  const validateLoginForm = (username, password) => {
    const errors = [];
    if (!username.trim()) errors.push("Username is required");
    if (!password.trim()) errors.push("Password is required");
    return errors;
  };

  const displayGallerySelection = (galleries) => {
    if (!clientLoginView) return;
    const clientName = sessionStorage.getItem("clientName");
    const welcomeTitle = clientName
      ? `Welcome, ${clientName.split(" ")[0]}`
      : "Select a Gallery";
    clientLoginView.innerHTML = `
            <div class="login-page-wrapper">
                <div class="login-brand-panel"><h1>${welcomeTitle}</h1><p>You have access to multiple galleries. Please choose one to continue.</p></div>
                <div class="login-form-panel"><div class="gallery-links">${galleries
                  .map(
                    (g) =>
                      `<a href="/gallery/${g.slug}" class="submit-btn gallery-link-btn">${g.name}</a>`
                  )
                  .join("")}</div></div>
            </div>`;
  };

  const handleSubmitSelections = async (e) => {
    e.preventDefault();
    // This function is for the final submission form, its logic is defined in your index.html
  };

  // --- EVENT HANDLERS ---
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
    fetchPhotos();
  };

  // --- INITIALIZATION & EVENT LISTENERS ---
  // In public/js/script.js
// DELETE the entire section at the bottom of your file and REPLACE it with this:

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
    lightboxCheckbox.addEventListener("click", toggleLightboxSelection);
}

if (stickySubmitBtn) {
    stickySubmitBtn.addEventListener("click", () => {
        if (selectedPhotos.length === 0) {
            showToast("Please select at least one photo before submitting.", "error");
            return;
        }
        if (submissionModal) submissionModal.style.display = "flex";
    });
}

if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
        if (submissionModal) submissionModal.style.display = "none";
    });
}

if (selectionForm) {
    selectionForm.addEventListener("submit", handleSubmitSelections);
}

// Observer for triggering the next page load
const paginationObserver = new IntersectionObserver((entries) => {
    // This will now log to the console when it checks the element
    console.log("Pagination observer is checking the sentinel..."); 
    if (entries[0].isIntersecting) {
        console.log("Sentinel is visible! Fetching more photos...");
        fetchPhotos();
    }
}, { rootMargin: "400px" });

if (loadingSentinel) {
    paginationObserver.observe(loadingSentinel);
}

// General click listener for password toggles
document.addEventListener('click', (e) => {
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

// Initial page load logic
if (getClientToken() && gallerySlug) {
    showGalleryView();
}
});
