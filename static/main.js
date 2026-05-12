
// --- Custom Alert / Toast UI ---
(function setupCustomAlerts() {
  function ensureToastContainer() {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      document.body.appendChild(container);
    }
    return container;
  }
  function inferType(message) {
    const msg = String(message || "");
    if (msg.startsWith("?") || msg.toLowerCase().includes("success")) return "success";
    if (msg.toLowerCase().includes("error") || msg.startsWith("?") || msg.startsWith("?")) return "error";
    return "warning";
  }

  function showToast(message, type = "warning", timeout = 4500) {
    const container = ensureToastContainer();
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    const icon = document.createElement("span");

    icon.className = "toast-icon";
    icon.innerText = type === "success" ? "?" : type === "error" ? "!" : "?";

    const msg = document.createElement("div");
    msg.className = "toast-message";
    msg.textContent = String(message || "");

    const close = document.createElement("button");
    close.className = "toast-close";
    close.innerHTML = "&times;";
    close.onclick = () => {
      toast.classList.add("toast-hide");
      setTimeout(() => toast.remove(), 200);
    };

    toast.appendChild(icon);
    toast.appendChild(msg);
    toast.appendChild(close);
    container.appendChild(toast);

    const timer = setTimeout(() => {
      toast.classList.add("toast-hide");
      setTimeout(() => toast.remove(), 200);
    }, timeout);

    toast.addEventListener("mouseenter", () => clearTimeout(timer), { once: true });
  }

  
  function ensureAlertModal() {
    let modal = document.getElementById("alert-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "alert-modal";
      modal.className = "alert-modal";
      modal.innerHTML = `
        <div class="alert-modal-backdrop"></div>
        <div class="alert-modal-card">
          <div class="alert-modal-title">Warning</div>
          <div class="alert-modal-message"></div>
          <div class="alert-modal-actions">
            <button class="btn btn-primary" id="alert-modal-ok">OK</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      const okBtn = modal.querySelector("#alert-modal-ok");
      okBtn.addEventListener("click", () => hideModalAlert());
      const backdrop = modal.querySelector(".alert-modal-backdrop");
      backdrop.addEventListener("click", () => hideModalAlert());
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") hideModalAlert();
      });
    }
    return modal;
  }

  function showModalAlert(message) {
    const modal = ensureAlertModal();
    const msgEl = modal.querySelector(".alert-modal-message");
    msgEl.textContent = message;
    modal.classList.add("active");
  }

  function hideModalAlert() {
    const modal = document.getElementById("alert-modal");
    if (modal) modal.classList.remove("active");
  }

window.notify = showToast;
  window.alert = function (message) {
    showModalAlert(String(message || ""));
  };
})();

// main.js - Global Variables & App Initialization

// --- Global State Variables ---
let siteData = {
  site_name: '',
  latitude: 0,
  longitude: 0
};

let bills = [];
let billCounter = 0;
let fetchedSolarData = null; 
let finalReportData = {}; // Holds all data for PDF/Excel export
let markerSource;
let map; // OpenLayers map object

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', function() {
  // Call functions from our other JS files
  addNewBill(); // From bill.js
  initializeMap(); // From map.js
});