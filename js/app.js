import { CONFIG } from "../config.js";
import { firebaseConfigured, ensureAnonymousAuth, auth, refreshAdminState } from "./auth.js";
import { initUpload } from "./upload.js";
import { initCloud } from "./cloud.js";
import { initFavorites } from "./favorites.js";
import { initAdmin } from "./admin.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

window.App = {
  user: null,
  isAdmin: false,
  firebaseConfigured,
  toast(message, type = "") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    $("#toast-region").append(toast);
    setTimeout(() => toast.remove(), 4500);
  },
  setLoading(value) {
    $("#loading-overlay").hidden = !value;
  },
  openModal(content) {
    $("#modal-root").innerHTML = `<div class="modal-backdrop" role="presentation"><div class="modal" role="dialog" aria-modal="true">${content}</div></div>`;
    const backdrop = $("#modal-root .modal-backdrop");
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) window.App.closeModal();
    });
  },
  closeModal() {
    $("#modal-root").innerHTML = "";
  }
};

function populateSelect(select, values, includeEmpty = true) {
  select.innerHTML = (includeEmpty ? '<option value="">Bitte auswählen</option>' : "") +
    values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
}

function escapeHtml(value = "") {
  const node = document.createElement("span");
  node.textContent = String(value);
  return node.innerHTML;
}

window.App.escapeHtml = escapeHtml;

function navigate(name) {
  $$(".view").forEach((view) => view.classList.remove("active"));
  $$(".segmented-switch").forEach((button) => button.classList.remove("active"));
  const target = $(`#${name}-view`);
  if (target) target.classList.add("active");
  if (name === "upload" || name === "cloud") $(`.segmented-switch[data-nav="${name}"]`)?.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "favorites") initFavorites();
  if (name === "cloud") initCloud();
  if (name === "admin") initAdmin();
}

async function init() {
  const savedTheme = localStorage.getItem("exam-cloud-theme");
  if (savedTheme === "dark") {
    document.documentElement.dataset.theme = "dark";
    $("#theme-icon").textContent = "☀";
  }

  populateSelect($("#uploader-class"), CONFIG.classes);
  populateSelect($("#exam-class"), CONFIG.classes);
  populateSelect($("#exam-subject"), CONFIG.subjects);
  $("#filter-subject").innerHTML = '<option value="">Alle Fächer</option>' + CONFIG.subjects.map((subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`).join("");
  $("#filter-class").innerHTML = '<option value="">Alle Klassen</option>' + CONFIG.classes.map((schoolClass) => `<option value="${escapeHtml(schoolClass)}">${escapeHtml(schoolClass)}</option>`).join("");
  CONFIG.teachers.forEach((teacher) => {
    $("#teacher-options").insertAdjacentHTML("beforeend", `<option value="${escapeHtml(teacher)}"></option>`);
  });
  $("#upload-help").textContent = `PDF oder JPG, JPEG, PNG, WEBP · maximal ${Math.round(CONFIG.maxFileSizeBytes / 1024 / 1024)} MB je Datei`;

  $$("[data-nav]").forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault();
    const name = button.dataset.nav;
    if (name === "admin" && !window.App.isAdmin) {
      window.App.toast("Dieser Bereich ist nur für Administratoren.", "error");
      return;
    }
    navigate(name);
  }));

  $("#theme-toggle").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "";
    localStorage.setItem("exam-cloud-theme", dark ? "dark" : "light");
    $("#theme-icon").textContent = dark ? "☀" : "☾";
  });

  initUpload();
  initCloud();

  if (!firebaseConfigured) {
    window.App.toast("Firebase ist noch nicht eingerichtet. Tragen Sie die Projektkonfiguration in firebase-config.js ein.", "error");
    return;
  }

  try {
    window.App.user = await ensureAnonymousAuth();
    window.App.isAdmin = await refreshAdminState();
    $("#admin-nav").hidden = !window.App.isAdmin;
  } catch (error) {
    window.App.toast(`Anmeldung fehlgeschlagen: ${error.message}`, "error");
  }

  if (auth?.currentUser) {
    auth.currentUser.getIdTokenResult(true).then((token) => {
      window.App.isAdmin = token.claims.admin === true;
      $("#admin-nav").hidden = !window.App.isAdmin;
    });
  }
}

init();
