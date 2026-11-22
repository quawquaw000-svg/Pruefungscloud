import { CONFIG } from "../config.js";
import { db, storage, firebaseConfigured } from "./auth.js";
import { collection, doc, getDocs, query, where, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { ref, uploadBytesResumable, deleteObject } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

let selectedFiles = [];
let uploadTasks = [];

export function initUpload() {
  const input = document.querySelector("#file-input");
  const dropZone = document.querySelector("#drop-zone");
  document.querySelector("#file-picker-button").addEventListener("click", () => input.click());
  dropZone.addEventListener("click", (event) => {
    if (!event.target.closest("button")) input.click();
  });
  dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") input.click();
  });
  input.addEventListener("change", () => addFiles(input.files));
  for (const type of ["dragenter", "dragover"]) {
    dropZone.addEventListener(type, (event) => {
      event.preventEvent?.();
      event.preventDefault();
      dropZone.classList.add("dragover");
    });
  }
  for (const type of ["dragleave", "drop"]) {
    dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      dropZone.classList.remove("dragover");
    });
  }
  dropZone.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));
  document.querySelector("#anonymous-upload").addEventListener("change", (event) => {
    document.querySelector("#uploader-name").disabled = event.target.checked;
  });
  document.querySelector("#upload-form").addEventListener("submit", submitUpload);
  document.querySelector("#cancel-upload").addEventListener("click", () => {
    uploadTasks.forEach((task) => task.cancel());
  });
}

function addFiles(fileList) {
  const incoming = [...fileList];
  for (const file of incoming) {
    if (!CONFIG.allowedTypes.includes(file.type)) {
      window.App.toast(`${file.name}: Dateityp wird nicht unterstützt.`, "error");
      continue;
    }
    if (file.size > CONFIG.maxFileSizeBytes) {
      window.App.toast(`${file.name}: Datei ist größer als ${Math.round(CONFIG.maxFileSizeBytes / 1024 / 1024)} MB.`, "error");
      continue;
    }
    if (file.type === "application/pdf" && (selectedFiles.some((item) => item.type === "application/pdf") || incoming.filter((item) => item.type === "application/pdf").length > CONFIG.maxPdfPerExam)) {
      window.App.toast("Für eine Prüfung ist nur eine PDF-Datei erlaubt.", "error");
      continue;
    }
    const imageCount = selectedFiles.filter((item) => item.type !== "application/pdf").length;
    if (file.type !== "application/pdf" && imageCount >= CONFIG.maxImagesPerExam) {
      window.App.toast(`Es können höchstens ${CONFIG.maxImagesPerExam} Bilder verwendet werden.`, "error");
      continue;
    }
    if (!selectedFiles.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) selectedFiles.push(file);
  }
  renderFiles();
}

function renderFiles() {
  const preview = document.querySelector("#file-preview");
  preview.innerHTML = selectedFiles.map((file, index) => {
    const url = file.type.startsWith("image/") ? URL.createObjectURL(file) : "";
    return `<div class="file-chip">
      ${url ? `<img class="file-thumb" src="${url}" alt="">` : `<div class="file-thumb"></div>`}
      <div class="file-info"><strong title="${window.App.escapeHtml(file.name)}">${window.App.escapeHtml(file.name)}</strong><span>${formatSize(file.size)}</span></div>
      <button class="remove-file" type="button" data-remove-file="${index}" aria-label="${window.App.escapeHtml(file.name)} entfernen">×</button>
    </div>`;
  }).join("");
  preview.querySelectorAll("[data-remove-file]").forEach((button) => button.addEventListener("click", () => {
    selectedFiles.splice(Number(button.dataset.removeFile), 1);
    renderFiles();
  }));
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function sha256(file) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function buildExamHash(files) {
  const parts = [];
  for (const file of files) parts.push(`${file.name}:${await sha256(file)};`);
  const bytes = new TextEncoder().encode(parts.join(""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function findDuplicate(hash) {
  const snapshot = await getDocs(query(collection(db, "exams"), where("hash", "==", hash), where("status", "==", "approved")));
  return snapshot.empty ? null : snapshot.docs[0].data();
}

async function submitUpload(event) {
  event.preventDefault();
  if (!firebaseConfigured) {
    window.App.toast("Firebase ist noch nicht eingerichtet.", "error");
    return;
  }
  const form = event.currentTarget;
  const fields = ["uploader-class", "exam-class", "exam-teacher", "exam-subject", "exam-topic"];
  let valid = true;
  fields.forEach((id) => {
    const element = document.querySelector(`#${id}`);
    element.classList.toggle("field-error", !element.value.trim());
    if (!element.value.trim()) valid = false;
  });
  if (!document.querySelector("#anonymous-upload").checked && !document.querySelector("#uploader-name").value.trim()) {
    document.querySelector("#uploader-name").classList.add("field-error");
    valid = false;
  }
  if (!selectedFiles.length) {
    window.App.toast("Bitte wählen Sie mindestens eine Datei aus.", "error");
    valid = false;
  }
  if (!valid) {
    window.App.toast("Bitte füllen Sie alle Pflichtfelder aus.", "error");
    return;
  }

  window.App.setLoading(true);
  try {
    const hash = await buildExamHash(selectedFiles);
    const duplicate = await findDuplicate(hash);
    if (duplicate) {
      const proceed = await new Promise((resolve) => {
        window.App.openModal(`<div class="modal-header"><h2>Mögliches Duplikat</h2><button class="modal-close" type="button" data-close-modal>×</button></div>
          <div class="report-form"><p>Eine identische Prüfung ist bereits vorhanden:</p><p><strong>${window.App.escapeHtml(duplicate.subject)} – ${window.App.escapeHtml(duplicate.topic)}</strong><br>${window.App.escapeHtml(duplicate.teacher)} · ${window.App.escapeHtml(duplicate.examClass)}</p><div style="display:flex;gap:8px"><button class="secondary-button" type="button" data-duplicate-cancel>Abbrechen</button><button class="primary-button" type="button" data-duplicate-proceed>Trotzdem einreichen</button></div></div>`);
        document.querySelector("[data-close-modal]").addEventListener("click", () => { window.App.closeModal(); resolve(false); });
        document.querySelector("[data-duplicate-cancel]").addEventListener("click", () => { window.App.closeModal(); resolve(false); });
        document.querySelector("[data-duplicate-proceed]").addEventListener("click", () => { window.App.closeModal(); resolve(true); });
      });
      if (!proceed) return;
    }

    const examRef = doc(collection(db, "exams"));
    const examId = examRef.id;
    const uid = window.App.user?.uid;
    const anonymous = document.querySelector("#anonymous-upload").checked;
    const fileType = selectedFiles[0].type === "application/pdf" ? "pdf" : "image";
    const uploaded = [];

    for (let index = 0; index < selectedFiles.length; index++) {
      const file = selectedFiles[index];
      const storagePath = `exams/${uid}/${examId}/${index}-${encodeURIComponent(file.name)}`;
      const task = uploadBytesResumable(ref(storage, storagePath), file, { contentType: file.type });
      uploadTasks = [...uploadTasks, task];
      await new Promise((resolve, reject) => {
        document.querySelector("#upload-progress").hidden = false;
        task.on("state_changed", (snapshot) => {
          const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          document.querySelector("#upload-progress-bar").style.width = `${percent}%`;
          document.querySelector("#upload-progress-text").textContent = `${percent} %`;
        }, reject, resolve);
      });
      uploaded.push({ name: file.name, size: file.size, type: file.type, storagePath });
    }

    await setDoc(examRef, {
      uploaderUid: uid,
      uploaderName: anonymous ? "Anonym" : document.querySelector("#uploader-name").value.trim(),
      anonymous,
      uploaderClass: document.querySelector("#uploader-class").value,
      examClass: document.querySelector("#exam-class").value,
      teacher: document.querySelector("#exam-teacher").value.trim(),
      subject: document.querySelector("#exam-subject").value,
      topic: document.querySelector("#exam-topic").value.trim(),
      fileType,
      files: uploaded,
      hash,
      status: "pending",
      favoriteCount: 0,
      createdAt: serverTimestamp()
    });
    form.reset();
    selectedFiles = [];
    uploadTasks = [];
    renderFiles();
    document.querySelector("#upload-progress").hidden = true;
    document.querySelector("#upload-progress-bar").style.width = "0";
    window.App.toast("Prüfung eingereicht. Ein Administrator muss sie zuerst freigeben.", "success");
  } catch (error) {
    window.App.toast(`Upload fehlgeschlagen: ${error.message}`, "error");
  } finally {
    window.App.setLoading(false);
  }
}
