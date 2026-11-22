# Prüfungscloud

Eine moderne, vollständig statische Schulplattform zum Hochladen, Finden, Favorisieren, Anzeigen und Herunterladen alter Prüfungen. Die Anwendung läuft auf GitHub Pages und verwendet Firebase Authentication, Firestore und Storage.

## Projektstruktur

```text
index.html
config.js
firebase-config.js
css/
js/
firebase/
  firestore.rules
  storage.rules
  firestore.indexes.json
README.md
```

## 1. Firebase-Projekt erstellen

1. Öffnen Sie die [Firebase-Konsole](https://console.firebase.google.com/).
2. Erstellen Sie ein neues Projekt.
3. Öffnen Sie die Projekteinstellungen und wählen Sie dort eine Web-App aus.
4. Kopieren Sie die angezeigten Werte `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId` und `appId`.
5. Tragen Sie diese Werte in `firebase-config.js` ein.
6. Die Firebase-Konfiguration ist für Browser-Projekte vorgesehen und ersetzt keine serverseitigen Security Rules.

## 2. Anonymous Authentication aktivieren

1. Öffnen Sie in Firebase `Authentication`.
2. Wählen Sie `Get started`.
3. Aktivieren Sie unter `Sign-in method` den Anbieter `Anonymous`.
4. Nach dem ersten Seitenaufruf meldet sich die Anwendung automatisch anonym an.

## 3. Firestore einrichten

1. Öffnen Sie `Firestore Database`.
2. Klicken Sie auf `Datenbank erstellen`.
3. Wählen Sie einen geeigneten Standort aus.
4. Starten Sie zunächst im Produktionsmodus.
5. Veröffentlichen Sie die Datei `firebase/firestore.rules` über die Firebase-Konsole oder Firebase CLI.
6. Optional veröffentlichen Sie `firebase/firestore.indexes.json` als Indexkonfiguration.

Die wichtigsten Sammlungen sind:

- `exams`: Prüfungsmetadaten und Status (`pending`, `approved`, `rejected`)
- `reports`: Meldungen, eine Meldung je UID und Prüfung
- `users/{uid}/favorites/{examId}`: persönliche Favoriten
- `users/{uid}`: minimale Nutzerdaten

Nur Prüfungen mit Status `approved` dürfen öffentlich angezeigt werden.

## 4. Firebase Storage einrichten

1. Öffnen Sie `Storage`.
2. Erstellen Sie den Storage-Bucket.
3. Veröffentlichen Sie `firebase/storage.rules`.
4. Die Regeln erlauben PDF-, JPG-, JPEG-, PNG- und WEBP-Dateien bis 20 MB.
5. Die Frontend-Konfiguration begrenzt mehrere Bilder zusätzlich auf 12 Dateien je Prüfung.

## 5. Security Rules veröffentlichen

Mit Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase init
firebase deploy --only firestore:rules,storage
firebase deploy --only firestore:indexes
```

Wählen Sie bei der Einrichtung das bestehende Firebase-Projekt. Falls das Projekt nicht in eine Konfigurationsdatei eingebunden werden soll, können Sie die Regeln direkt in der Firebase-Konsole kopieren und veröffentlichen.

## 6. Ersten Administrator einrichten

Die Admin-Berechtigung wird über Firebase Custom Claims gesetzt. Das Setzen von Claims kann aus Sicherheitsgründen nicht zuverlässig allein in diesem statischen Frontend erfolgen.

Benötigt wird eine vertrauenswürdige Umgebung, zum Beispiel Firebase Admin SDK in einer einmalig ausgeführten Cloud Function oder ein lokal geschütztes Administrationstool:

```js
const admin = require("firebase-admin");
admin.initializeApp();

await admin.auth().setCustomUserClaims("FIREBASE_UID_DES_ADMINS", {
  admin: true
});
```

Der Nutzer muss sich danach einmal ab- und anmelden oder sein ID-Token erneuern. Die Website ruft das Token beim Laden und bei der Authentifizierung neu ab.

Für eine dauerhafte Lösung sollten Custom Claims über einen geschützten Server oder eine geschützte Admin-Cloud-Function verwaltet werden. Ein normaler Nutzer kann sich selbst niemals per Firestore oder Firestore Rules zum Administrator erklären.

## 7. GitHub Pages aktivieren

1. Laden Sie alle Dateien in ein GitHub-Repository hoch.
2. Öffnen Sie in GitHub `Settings` → `Pages`.
3. Wählen Sie unter `Build and deployment` als Quelle `Deploy from a branch`.
4. Wählen Sie den gewünschten Branch und den Hauptordner `/ (root)`.
5. Speichern Sie die Einstellungen.
6. Öffnen Sie die angezeigte GitHub-Pages-Adresse.

Firebase ist für Browseranwendungen konfigurierbar. Falls GitHub Pages unter einer anderen Domain läuft, muss diese Domain gegebenenfalls als autorisierte Domain in Firebase Authentication hinterlegt werden.

## 8. Website aktualisieren

Ändern Sie die Dateien lokal und laden Sie die Änderungen per Git auf den Branch hoch, der für GitHub Pages eingerichtet ist.

```bash
git add .
git commit -m "Prüfungscloud aktualisieren"
git push
```

## 9. Klassen und Lehrer ändern

Öffnen Sie `config.js`.

```js
classes: ["1a", "1b", "2a", "2b"],
teachers: ["Frau Muster", "Herr Beispiel"]
```

Die Fächer stehen ebenfalls in `config.js`. Die neuen Werte werden in allen Formularen und Filtern verwendet.

Weitere Einstellungen befinden sich ebenfalls in `config.js`:

- `allowedTypes`
- `maxFileSizeBytes`
- `maxImagesPerExam`
- `maxPdfPerExam`

## 10. Sicherheitshinweise

- Prüfungsmetadaten werden mit Status `pending` erstellt und müssen in der Admin-Oberfläche freigegeben werden.
- Anonyme Nutzer können nicht freigeben, ablehnen oder löschen.
- Favoriten sind am Firestore-Pfad der anonymen UID gebunden.
- Jeder Nutzer kann dieselbe Prüfung nur einmal melden.
- Public Firebase-Konfiguration ist kein Geheimnis; Sicherheit entsteht durch Authentication und Security Rules.
- Ein tatsächlicher Uploadername wird bei anonymem Upload nicht in den öffentlichen Metadaten gespeichert.
- Die Backend-seitige Erweiterung durch Cloud Functions kann für besonders strikte Prüfungen, automatische Virusprüfung, Custom-Claim-Verwaltung und serverseitige Duplikaterkennung ergänzt werden.

## 11. Lokaler Test

Da Browsermodule über HTTP(S) geladen werden sollten, starten Sie einen kleinen lokalen Server:

```bash
python -m http.server 8080
```

Danach `http://localhost:8080` öffnen.

Ohne gültige Firebase-Konfiguration zeigt die Anwendung eine verständliche Einrichtungsfehlermeldung. Nach dem Eintragen der Firebase-Werte funktionieren Anmeldung, Upload, Cloud, Favoriten und Meldungen mit den veröffentlichen Rules.
