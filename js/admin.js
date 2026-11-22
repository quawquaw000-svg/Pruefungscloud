import { db, storage, firebaseConfigured } from "./auth.js";
import { collection, doc, getDocs, getDoc, updateDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { openExamViewer } from "./file-viewer.js";

let activeTab = "pending";

export async function initAdmin() {
  if (!firebaseConfigured || !window.App.isAdmin) {
    document.querySelector("#admin-content").innerHTML = '<div class="empty-state">Nur autorisierte Administratoren können diesen Bereich öffnen.</div>';
    return;
  }
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.onclick = () => {
      document.querySelectorAll("[data-admin-tab]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      activeTab = button.dataset.adminTab;
      loadAdmin();
    };
  });
  await loadAdmin();
}

async function loadAdmin() {
  const list = document.querySelector("#admin-list");
  list.innerHTML = '<div class="empty-state">Moderationsdaten werden geladen…</div>';
  try {
    const [examsSnapshot, reportsSnapshot, usersSnapshot] = await Promise.all([
      getDocs(collection(db, "exams")),
      getDocs(collection(db, "reports")),
      getDocs(collection(db, "users"))
    ]);
    const exams = examsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    const reports = reportsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    const counts = {
      all: exams.length,
      approved: exams.filter((exam) => exam.status === "approved").length,
      pending: exams.filter((exam) => exam.status === "pending").length,
      rejected: exams.filter((exam) => exam.status === "rejected").length,
      reports: reports.filter((report) => report.status === "open").length,
      users: usersSnapshot.size
    };
    document.querySelector("#admin-stats").innerHTML = `
      <div class="stat-card"><span>Alle Prüfungen</span><strong>${counts.all}</strong></div>
      <div class="stat-card"><span>Freigegeben</span><strong>${counts.approved}</strong></div>
      <div class="stat-card"><span>Wartend</span><strong>${counts.pending}</strong></div>
      <div class="stat-card"><span>Abgelehnt</span><strong>${counts.rejected}</strong></div>
      <div class="stat-card"><span>Offene Meldungen</span><strong>${counts.reports}</strong></div>
      <div class="stat-card"><span>Nutzer</span><strong>${counts.users}</strong></div>`;

    if (activeTab === "reports") renderReports(reports);
    else if (activeTab === "all") renderExams(exams);
    else renderExams(exams.filter((exam) => exam.status === "pending"));
  } catch (error) {
    list.innerHTML = '<div class="empty-state">Moderationsdaten konnten nicht geladen werden.</div>';
    window.App.toast(`Admin-Fehler: ${error.message}`, "error");
  }
}

function renderExams(exams) {
  const list = document.querySelector("#admin-list");
  if (!exams.length) {
    list.innerHTML = '<div class="empty-state">Keine Einträge vorhanden.</div>';
    return;
  }
  list.innerHTML = exams.map((exam) => `<article class="admin-row" data-exam-id="${exam.id}">
    <div><h3>${window.App.escapeHtml(exam.subject)} – ${window.App.escapeHtml(exam.topic)} <span class="status-pill status-${window.App.escapeHtml(exam.status)}">${window.App.escapeHtml(exam.status)}</span></h3>
      <p>${window.App.escapeHtml(exam.teacher)} · ${window.App.escapeHtml(exam.examClass)} · ${window.App.escapeHtml(exam.uploaderName || "Anonym")}</p></div>
    <div class="admin-row-actions">
      <button class="secondary-button" type="button" data-admin-open>Öffnen</button>
      ${exam.status !== "approved" ? '<button class="primary-button" type="button" data-admin-approve>Freigeben</button>' : ""}
      ${exam.status !== "rejected" ? '<button class="secondary-button" type="button" data-admin-reject>Ablehnen</button>' : ""}
      <button class="danger-button" type="button" data-admin-delete>Löschen</button>
    </div>
  </article>`).join("");
  list.querySelectorAll("[data-admin-open]").forEach((button) => button.addEventListener("click", async () => {
    const id = button.closest("[data-exam-id]").dataset.examId;
    const snapshot = await getDoc(doc(db, "exams", id));
    if (snapshot.exists()) openExamViewer({ id: snapshot.id, ...snapshot.data() });
  }));
  list.querySelectorAll("[data-admin-approve]").forEach((button) => button.addEventListener("click", () => setExamStatus(button, "approved")));
  list.querySelectorAll("[data-admin-reject]").forEach((button) => button.addEventListener("click", () => setExamStatus(button, "rejected")));
  list.querySelectorAll("[data-admin-delete]").forEach((button) => button.addEventListener("click", () => deleteExam(button)));
}

async function setExamStatus(button, status) {
  const id = button.closest("[data-exam-id]").dataset.examId;
  try {
    await updateDoc(doc(db, "exams", id), { status });
    window.App.toast(status === "approved" ? "Prüfung wurde freigegeben." : "Prüfung wurde abgelehnt.", "success");
    await loadAdmin();
  } catch (error) {
    window.App.toast(`Status konnte nicht geändert werden: ${error.message}`, "error");
  }
}

async function deleteExam(button) {
  const row = button.closest("[data-exam-id]");
  const id = row.dataset.examId;
  if (!confirm("Diese Prüfung und ihre Dateien endgültig löschen?")) return;
  try {
    const snapshot = await getDoc(doc(db, "exams", id));
    if (!snapshot.exists()) return;
    const exam = snapshot.data();
    for (const file of exam.files || []) {
      await deleteObject(ref(storage, file.storagePath)).catch(() => {});
    }
    await deleteDoc(doc(db, "exams", id));
    window.App.toast("Prüfung wurde gelöscht.", "success");
    await loadAdmin();
  } catch (error) {
    window.App.toast(`Löschen fehlgeschlagen: ${error.message}`, "error");
  }
}

function renderReports(reports) {
  const list = document.querySelector("#admin-list");
  if (!reports.length) {
    list.innerHTML = '<div class="empty-state">Keine Meldungen vorhanden.</div>';
    return;
  }
  list.innerHTML = reports.map((report) => `<article class="admin-row" data-report-id="${report.id}" data-exam-id="${window.App.escapeHtml(report.examId)}">
    <div><h3>${window.App.escapeHtml(report.reason)} <span class="status-pill status-${window.App.escapeHtml(report.status)}">${window.App.escapeHtml(report.status)}</span></h3><p>${window.App.escapeHtml(report.description || "Keine Beschreibung")}</p></div>
    <div class="admin-row-actions">
      <button class="secondary-button" type="button" data-view-reported>Prüfung ansehen</button>
      <button class="primary-button" type="button" data-resolve-report>Als bearbeitet markieren</button>
      <button class="secondary-button" type="button" data-ignore-report>Ignorieren</button>
      <button class="danger-button" type="button" data-remove-reported>Prüfung entfernen</button>
    </div>
  </article>`).join("");
  list.querySelectorAll("[data-view-reported]").forEach((button) => button.addEventListener("click", async () => {
    const id = button.closest("[data-exam-id]").dataset.examId;
    const snapshot = await getDoc(doc(db, "exams", id));
    if (snapshot.exists()) openExamViewer({ id: snapshot.id, ...snapshot.data() });
  }));
  list.querySelectorAll("[data-resolve-report]").forEach((button) => button.addEventListener("click", () => updateReport(button, "resolved")));
  list.querySelectorAll("[data-ignore-report]").forEach((button) => button.addEventListener("click", () => updateReport(button, "resolved")));
  list.querySelectorAll("[data-remove-reported]").forEach((button) => button.addEventListener("click", async () => {
    const row = button.closest("[data-exam-id]");
    const examId = row.dataset.examId;
    const examSnapshot = await getDoc(doc(db, "exams", examId));
    if (examSnapshot.exists()) await deleteExamDocument(examId, examSnapshot.data());
    await updateReport(button, "resolved");
  }));
}

async function updateReport(button, status) {
  const id = button.closest("[data-report-id]").dataset.reportId;
  await updateDoc(doc(db, "reports", id), { status });
  window.App.toast(status === "resolved" ? "Meldung wurde bearbeitet." : "Meldung wurde aktualisiert.", "success");
  await loadAdmin();
}

async function deleteExamDocument(id, exam) {
  for (const file of exam.files || []) await deleteObject(ref(storage, file.storagePath)).catch(() => {});
  await deleteDoc(doc(db, "exams", id));
}
