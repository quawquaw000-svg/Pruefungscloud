import { db, storage, firebaseConfigured } from "./auth.js";
import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { isFavorite, toggleFavorite } from "./favorites.js";
import { openReportModal } from "./reports.js";
import { openExamViewer } from "./file-viewer.js";

let allExams = [];
let initialized = false;

export async function initCloud() {
  if (!firebaseConfigured) {
    document.querySelector("#exam-grid").innerHTML = '<div class="empty-state">Die Firebase-Konfiguration wird noch benötigt.</div>';
    return;
  }
  if (!initialized) {
    ["free-search", "filter-subject", "filter-teacher", "filter-class", "filter-type", "filter-date", "filter-sort"].forEach((id) => {
      document.querySelector(`#${id}`).addEventListener(id === "free-search" ? "input" : "change", renderExams);
    });
    document.querySelector("#reset-filters").addEventListener("click", () => {
      document.querySelector("#free-search").value = "";
      document.querySelector("#filter-subject").value = "";
      document.querySelector("#filter-teacher").value = "";
      document.querySelector("#filter-class").value = "";
      document.querySelector("#filter-type").value = "";
      document.querySelector("#filter-date").value = "";
      document.querySelector("#filter-sort").value = "newest";
      renderExams();
    });
    initialized = true;
  }
  await loadExams();
}

async function loadExams() {
  const grid = document.querySelector("#exam-grid");
  grid.innerHTML = '<div class="empty-state">Prüfungen werden geladen…</div>';
  try {
    const snapshot = await getDocs(query(collection(db, "exams"), where("status", "==", "approved")));
    allExams = snapshot.docs.map((documentSnapshot) => ({ id: documentSnapshot.id, ...documentSnapshot.data() }));
    const teachers = [...new Set(allExams.map((exam) => exam.teacher).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    document.querySelector("#filter-teacher").innerHTML = '<option value="">Alle Lehrpersonen</option>' + teachers.map((teacher) => `<option value="${window.App.escapeHtml(teacher)}">${window.App.escapeHtml(teacher)}</option>`).join("");
    renderExams();
  } catch (error) {
    grid.innerHTML = '<div class="empty-state">Prüfungen konnten nicht geladen werden.</div>';
    window.App.toast(`Datenbankfehler: ${error.message}`, "error");
  }
}

function timestampValue(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return new Date(value).getTime() || 0;
}

function renderExams() {
  const subject = document.querySelector("#filter-subject").value;
  const teacher = document.querySelector("#filter-teacher").value;
  const examClass = document.querySelector("#filter-class").value;
  const type = document.querySelector("#filter-type").value;
  const date = document.querySelector("#filter-date").value;
  const search = document.querySelector("#free-search").value.trim().toLowerCase();
  const sort = document.querySelector("#filter-sort").value;

  let exams = allExams.filter((exam) => {
    const haystack = `${exam.subject} ${exam.topic} ${exam.teacher} ${exam.examClass} ${exam.uploaderName}`.toLowerCase();
    const dateString = new Date(timestampValue(exam.createdAt)).toISOString().slice(0, 10);
    return (!subject || exam.subject === subject) &&
      (!teacher || exam.teacher === teacher) &&
      (!examClass || exam.examClass === examClass) &&
      (!type || exam.fileType === type) &&
      (!date || dateString === date) &&
      (!search || haystack.includes(search));
  });

  exams.sort((a, b) => {
    if (sort === "oldest") return timestampValue(a.createdAt) - timestampValue(b.createdAt);
    if (sort === "subject") return (a.subject || "").localeCompare(b.subject || "");
    if (sort === "popular") return (b.favoriteCount || 0) - (a.favoriteCount || 0);
    return timestampValue(b.createdAt) - timestampValue(a.createdAt);
  });

  const grid = document.querySelector("#exam-grid");
  if (!exams.length) {
    grid.innerHTML = '<div class="empty-state">Keine Prüfungen entsprechen diesen Filtern.</div>';
    return;
  }
  grid.innerHTML = exams.map(examCard).join("");
  bindCardActions(grid);
}

function examCard(exam) {
  const date = timestampValue(exam.createdAt) ? new Date(timestampValue(exam.createdAt)).toLocaleDateString("de-CH") : "Unbekannt";
  return `<article class="exam-card" data-exam-id="${exam.id}">
    <div class="exam-card-header">
      <span class="subject-pill">${window.App.escapeHtml(exam.subject)}</span>
      <div class="card-actions">
        <button class="card-icon favorite-button ${isFavorite(exam.id) ? "active" : ""}" type="button" data-favorite title="Favorisieren" aria-label="Prüfung favorisieren">♥</button>
        <button class="card-icon" type="button" data-report title="Melden" aria-label="Prüfung melden">!</button>
      </div>
    </div>
    <div class="exam-card-body">
      <h2>${window.App.escapeHtml(exam.topic)}</h2>
      <div class="exam-meta">
        <span>Lehrer: <strong>${window.App.escapeHtml(exam.teacher)}</strong></span>
        <span>Klasse: <strong>${window.App.escapeHtml(exam.examClass)}</strong></span>
        ${exam.uploaderClass ? `<span>Uploader-Klasse: ${window.App.escapeHtml(exam.uploaderClass)}</span>` : ""}
        <span>Von: <strong>${exam.anonymous ? "Anonym" : window.App.escapeHtml(exam.uploaderName)}</strong></span>
        <span>${date} · ${exam.fileType === "pdf" ? "PDF" : "Bild(er)"} · ♥ ${exam.favoriteCount || 0}</span>
      </div>
    </div>
    <div class="exam-card-footer">
      <button class="secondary-button" type="button" data-open>Öffnen</button>
      <button class="primary-button" type="button" data-download>Herunterladen</button>
    </div>
  </article>`;
}

function bindCardActions(root) {
  root.querySelectorAll("[data-favorite]").forEach((button) => button.addEventListener("click", async (event) => {
    event.stopPropagation();
    const id = button.closest("[data-exam-id]").dataset.examId;
    await toggleFavorite(id);
    button.classList.toggle("active");
  }));
  root.querySelectorAll("[data-report]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    openReportModal(button.closest("[data-exam-id]").dataset.examId);
  }));
  root.querySelectorAll("[data-open]").forEach((button) => button.addEventListener("click", () => openExamViewer(allExams.find((exam) => exam.id === button.closest("[data-exam-id]").dataset.examId))));
  root.querySelectorAll("[data-download]").forEach((button) => button.addEventListener("click", async () => {
    const exam = allExams.find((item) => item.id === button.closest("[data-exam-id]").dataset.examId);
    await downloadExam(exam);
  }));
}

async function downloadExam(exam) {
  if (!exam?.files?.length) return;
  for (const file of exam.files) {
    const url = await getDownloadURL(ref(storage, file.storagePath));
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.target = "_blank";
    document.body.append(link);
    link.click();
    link.remove();
  }
}
