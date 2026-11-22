import { storage } from "./auth.js";
import { ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

let currentImageIndex = 0;

export async function openExamViewer(exam) {
  if (!exam?.files?.length) {
    window.App.toast("Für diese Prüfung sind keine Dateien hinterlegt.", "error");
    return;
  }
  window.App.openModal(`<div class="modal-header"><h2>${window.App.escapeHtml(exam.topic)}</h2><button class="modal-close" type="button" data-close-modal>×</button></div>
    <div class="viewer-info">
      <span>Fach: <strong>${window.App.escapeHtml(exam.subject)}</strong></span>
      <span>Lehrer: <strong>${window.App.escapeHtml(exam.teacher)}</strong></span>
      <span>Klasse: <strong>${window.App.escapeHtml(exam.examClass)}</strong></span>
      <span>Von: <strong>${exam.anonymous ? "Anonym" : window.App.escapeHtml(exam.uploaderName)}</strong></span>
    </div>
    <div id="viewer-body" class="viewer-body"></div>
    <div style="padding:12px 20px;text-align:right"><button class="primary-button" type="button" id="viewer-download">Datei herunterladen</button></div>`);
  document.querySelector("[data-close-modal]").addEventListener("click", () => window.App.closeModal());
  document.querySelector("#viewer-download").addEventListener("click", () => downloadAll(exam));

  if (exam.fileType === "pdf") {
    const url = await getDownloadURL(ref(storage, exam.files[0].storagePath));
    document.querySelector("#viewer-body").innerHTML = `<iframe class="pdf-frame" src="${url}#toolbar=1&navpanes=0" title="${window.App.escapeHtml(exam.topic)}"></iframe>`;
  } else {
    currentImageIndex = 0;
    await renderImages(exam);
  }
}

async function renderImages(exam) {
  const body = document.querySelector("#viewer-body");
  const file = exam.files[currentImageIndex];
  const url = await getDownloadURL(ref(storage, file.storagePath));
  body.innerHTML = `<div class="image-viewer"><img src="${url}" alt="${window.App.escapeHtml(exam.topic)}"></div>
    ${exam.files.length > 1 ? `<div class="image-controls"><button class="secondary-button" type="button" id="previous-image">Zurück</button><strong>${currentImageIndex + 1} / ${exam.files.length}</strong><button class="secondary-button" type="button" id="next-image">Weiter</button></div>` : ""}`;
  document.querySelector("#previous-image")?.addEventListener("click", async () => {
    currentImageIndex = (currentImageIndex - 1 + exam.files.length) % exam.files.length;
    await renderImages(exam);
  });
  document.querySelector("#next-image")?.addEventListener("click", async () => {
    currentImageIndex = (currentImageIndex + 1) % exam.files.length;
    await renderImages(exam);
  });
}

async function downloadAll(exam) {
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
