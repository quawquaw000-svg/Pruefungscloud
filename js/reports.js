import { db, firebaseConfigured } from "./auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const reasons = ["Falsches Fach", "Falsche Klasse", "Falscher Lehrer", "Doppelte Prüfung", "Unpassende oder fehlerhafte Datei", "Urheberrechtliches Problem", "Sonstiges"];

export function openReportModal(examId) {
  if (!firebaseConfigured) {
    window.App.toast("Meldungen sind erst nach der Firebase-Einrichtung verfügbar.", "error");
    return;
  }
  window.App.openModal(`<div class="modal-header"><h2>Prüfung melden</h2><button class="modal-close" type="button" data-close-modal>×</button></div>
    <form class="report-form" id="report-form">
      <label>Grund
        <select id="report-reason" required>${reasons.map((reason) => `<option value="${window.App.escapeHtml(reason)}">${window.App.escapeHtml(reason)}</option>`).join("")}</select>
      </label>
      <label>Kurze Beschreibung
        <textarea id="report-description" maxlength="500" placeholder="Optional"></textarea>
      </label>
      <button class="primary-button" type="submit">Meldung senden</button>
    </form>`);
  document.querySelector("[data-close-modal]").addEventListener("click", () => window.App.closeModal());
  document.querySelector("#report-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitReport(examId);
  });
}

async function submitReport(examId) {
  const uid = window.App.user?.uid;
  if (!uid) {
    window.App.toast("Die Anmeldung wird noch vorbereitet.", "error");
    return;
  }
  const reportRef = doc(db, "reports", `${uid}_${examId}`);
  try {
    const existing = await getDoc(reportRef);
    if (existing.exists()) {
      window.App.toast("Sie haben diese Prüfung bereits gemeldet.", "error");
      window.App.closeModal();
      return;
    }
    await setDoc(reportRef, {
      examId,
      reporterUid: uid,
      reason: document.querySelector("#report-reason").value,
      description: document.querySelector("#report-description").value.trim(),
      status: "open",
      createdAt: serverTimestamp()
    });
    window.App.closeModal();
    window.App.toast("Meldung wurde gesendet.", "success");
  } catch (error) {
    window.App.toast(`Meldung fehlgeschlagen: ${error.message}`, "error");
  }
}
