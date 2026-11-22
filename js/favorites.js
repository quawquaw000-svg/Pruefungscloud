import { db, firebaseConfigured } from "./auth.js";
import { collection, doc, getDoc, getDocs, runTransaction, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { openExamViewer } from "./file-viewer.js";

const favoriteIds = new Set();
let loaded = false;

export function isFavorite(examId) {
  return favoriteIds.has(examId);
}

export async function toggleFavorite(examId) {
  if (!firebaseConfigured || !window.App.user) {
    window.App.toast("Favoriten sind erst nach der Firebase-Anmeldung verfügbar.", "error");
    return;
  }
  const uid = window.App.user.uid;
  const favoriteRef = doc(db, "users", uid, "favorites", examId);
  const examRef = doc(db, "exams", examId);
  try {
    await runTransaction(db, async (transaction) => {
      const favoriteDoc = await transaction.get(favoriteRef);
      const examDoc = await transaction.get(examRef);
      if (!examDoc.exists()) throw new Error("Prüfung wurde nicht gefunden.");
      if (favoriteDoc.exists()) {
        transaction.delete(favoriteRef);
        const count = Math.max(0, (examDoc.data().favoriteCount || 0) - 1);
        transaction.update(examRef, { favoriteCount: count });
        favoriteIds.delete(examId);
      } else {
        transaction.set(favoriteRef, { examId, createdAt: serverTimestamp() });
        transaction.update(examRef, { favoriteCount: (examDoc.data().favoriteCount || 0) + 1 });
        favoriteIds.add(examId);
      }
    });
    document.querySelector("#favorite-count").textContent = favoriteIds.size;
  } catch (error) {
    window.App.toast(`Favorit konnte nicht geändert werden: ${error.message}`, "error");
  }
}

export async function initFavorites() {
  const grid = document.querySelector("#favorites-grid");
  if (!firebaseConfigured) {
    grid.innerHTML = '<div class="empty-state">Die Firebase-Konfiguration wird noch benötigt.</div>';
    return;
  }
  grid.innerHTML = '<div class="empty-state">Favoriten werden geladen…</div>';
  try {
    favoriteIds.clear();
    const snapshot = await getDocs(collection(db, "users", window.App.user.uid, "favorites"));
    const exams = [];
    for (const favorite of snapshot.docs) {
      const examId = favorite.id;
      favoriteIds.add(examId);
      const examDoc = await getDoc(doc(db, "exams", examId));
      if (examDoc.exists() && examDoc.data().status === "approved") exams.push({ id: examDoc.id, ...examDoc.data() });
    }
    loaded = true;
    document.querySelector("#favorite-count").textContent = favoriteIds.size;
    if (!exams.length) {
      grid.innerHTML = '<div class="empty-state">Sie haben noch keine Favoriten gespeichert.</div>';
      return;
    }
    grid.innerHTML = exams.map((exam) => `<article class="exam-card" data-exam-id="${exam.id}">
      <div class="exam-card-header"><span class="subject-pill">${window.App.escapeHtml(exam.subject)}</span><button class="card-icon active" type="button" data-remove-favorite title="Favorit entfernen">♥</button></div>
      <div class="exam-card-body"><h2>${window.App.escapeHtml(exam.topic)}</h2><div class="exam-meta"><span>Lehrer: <strong>${window.App.escapeHtml(exam.teacher)}</strong></span><span>Klasse: <strong>${window.App.escapeHtml(exam.examClass)}</strong></span></div></div>
      <div class="exam-card-footer"><button class="secondary-button" type="button" data-open-favorite>Öffnen</button></div>
    </article>`).join("");
    grid.querySelectorAll("[data-remove-favorite]").forEach((button) => button.addEventListener("click", async () => {
      const id = button.closest("[data-exam-id]").dataset.examId;
      await toggleFavorite(id);
      initFavorites();
    }));
    grid.querySelectorAll("[data-open-favorite]").forEach((button) => button.addEventListener("click", () => {
      const id = button.closest("[data-exam-id]").dataset.examId;
      const exam = exams.find((item) => item.id === id);
      openExamViewer(exam);
    }));
  } catch (error) {
    grid.innerHTML = '<div class="empty-state">Favoriten konnten nicht geladen werden.</div>';
    window.App.toast(`Favoritenfehler: ${error.message}`, "error");
  }
}
