(() => {
  const fileInput = document.getElementById("fileInput");
  const filePanel = document.getElementById("filePanel");
  const contentsPanel = document.getElementById("contentsPanel");
  const reportPanel = document.getElementById("reportPanel");
  const fileName = document.getElementById("fileName");
  const fileSize = document.getElementById("fileSize");
  const detectedType = document.getElementById("detectedType");
  const typeBadge = document.getElementById("typeBadge");
  const fileMessage = document.getElementById("fileMessage");
  const contentsBody = document.getElementById("contentsBody");
  const entryCount = document.getElementById("entryCount");
  const exportButton = document.getElementById("exportZipButton");
  const reportButton = document.getElementById("downloadReportButton");
  const reportList = document.getElementById("reportList");
  const compatBadge = document.getElementById("compatBadge");

  let currentFile = null;
  let zipEntries = [];
  let currentReport = [];

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB"];
    let value = bytes / 1024, i = 0;
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
    return `${value.toFixed(2)} ${units[i]}`;
  }

  function extension(path) {
    if (path.endsWith("/")) return "Folder";
    const name = path.split("/").pop();
    const idx = name.lastIndexOf(".");
    return idx > 0 ? name.slice(idx + 1).toLowerCase() : "No extension";
  }

  function addReport(title, detail) {
    currentReport.push({ title, detail });
    const li = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = `${title}: `;
    li.append(strong, document.createTextNode(detail));
    reportList.appendChild(li);
  }

  function resetPanels() {
    filePanel.classList.remove("hidden");
    contentsPanel.classList.add("hidden");
    reportPanel.classList.remove("hidden");
    contentsBody.replaceChildren();
    reportList.replaceChildren();
    currentReport = [];
    zipEntries = [];
    exportButton.disabled = true;
  }

  function showFileInfo(file, type) {
    fileName.textContent = file.name;
    fileSize.textContent = formatBytes(file.size);
    detectedType.textContent = type;
    typeBadge.textContent = type;
  }

  fileInput.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    currentFile = file;
    resetPanels();

    const lowerName = file.name.toLowerCase();
    const looksZip = lowerName.endsWith(".zip");
    const looksUnity = lowerName.endsWith(".unity3d");
    showFileInfo(file, looksZip ? "ZIP archive" : looksUnity ? "Unity AssetBundle candidate" : "Unknown file");

    if (file.size > 500 * 1024 * 1024) {
      fileMessage.textContent = "This file is larger than 500 MB. For safety and browser stability, this prototype will not inspect it.";
      addReport("Needs review", "The file is over 500 MB; try a smaller archive or inspect it on a desktop.");
      addReport("Conversion", "No conversion was attempted.");
      compatBadge.textContent = "Needs review";
      return;
    }

    if (looksZip) {
      if (typeof JSZip === "undefined") {
        fileMessage.textContent = "The ZIP library could not load. Check your internet connection and reload this page.";
        addReport("ZIP inspection", "JSZip library did not load.");
        compatBadge.textContent = "Needs review";
        return;
      }
      try {
        const zip = await JSZip.loadAsync(file, { checkCRC32: false, createFolders: false });
        const all = Object.values(zip.files);
        zipEntries = all.filter(entry => !entry.dir);
        entryCount.textContent = `${zipEntries.length} files`;
        for (const entry of all.slice(0, 1000)) {
          const tr = document.createElement("tr");
          const pathCell = document.createElement("td");
          const typeCell = document.createElement("td");
          const sizeCell = document.createElement("td");
          pathCell.textContent = entry.name;
          typeCell.textContent = entry.dir ? "Folder" : extension(entry.name);
          sizeCell.textContent = entry.dir ? "—" : "Available on export";
          tr.append(pathCell, typeCell, sizeCell);
          contentsBody.appendChild(tr);
        }
        contentsPanel.classList.remove("hidden");
        exportButton.disabled = zipEntries.length === 0;
        fileMessage.textContent = all.length > 1000
          ? `ZIP opened successfully. Showing the first 1,000 entries for safety; the archive contains ${all.length} entries.`
          : `ZIP archive opened successfully. Found ${all.length} entries. Files are inspected locally in your browser.`;
        addReport("ZIP archive", "Contents were listed successfully.");
        addReport("iOS compatibility", "A ZIP archive is only a container. Its contents must be reviewed individually before they can be used on iOS.");
        addReport("Unity assets", "This prototype lists filenames and extensions; it does not parse or convert native Unity AssetBundles.");
        compatBadge.textContent = "Needs review";
      } catch (error) {
        fileMessage.textContent = "This file could not be opened as a valid ZIP archive. It may be damaged, encrypted, or not a ZIP file.";
        addReport("ZIP inspection", "Failed to read this archive. Check that it is a valid, unencrypted ZIP.");
        addReport("Conversion", "No conversion was attempted.");
        compatBadge.textContent = "Unsupported";
      }
    } else if (looksUnity) {
      fileMessage.textContent = "This looks like a Unity .unity3d file. This browser prototype cannot parse or convert native Unity AssetBundles yet.";
      addReport("File detection", "The filename uses the .unity3d extension; this alone does not confirm its internal format.");
      addReport("iOS compatibility", "Needs technical inspection of Unity version, platform target, assets, and dependencies.");
      addReport("Next step", "Inspect it with a compatible Unity AssetBundle tool or an authorized Unity project workflow.");
      addReport("Conversion", "No conversion was attempted and no output was created.");
      compatBadge.textContent = "Unsupported";
    } else {
      fileMessage.textContent = "Please choose a .zip or .unity3d file.";
      addReport("File type", "This prototype supports ZIP inspection and basic .unity3d filename detection.");
      compatBadge.textContent = "Unsupported";
    }
  });

  exportButton.addEventListener("click", async () => {
    if (!currentFile || !currentFile.name.toLowerCase().endsWith(".zip") || typeof JSZip === "undefined") return;
    try {
      const zip = await JSZip.loadAsync(currentFile, { checkCRC32: false, createFolders: false });
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 5 } });
      downloadBlob(blob, currentFile.name.replace(/\.zip$/i, "") + "-export.zip");
      fileMessage.textContent = "ZIP export created. The original folder paths were preserved. The archive was re-packed, not converted to iOS.";
    } catch (error) {
      fileMessage.textContent = "Could not export this ZIP. The archive may be damaged or too large for this device.";
    }
  });

  reportButton.addEventListener("click", () => {
    if (!currentFile) return;
    const report = {
      app: "CADENZZA iOS Script Convert",
      file: currentFile.name,
      sizeBytes: currentFile.size,
      detectedType: detectedType.textContent,
      compatibilityStatus: compatBadge.textContent,
      findings: currentReport,
      note: "This is an inspection report only. No Unity conversion was performed."
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    downloadBlob(blob, currentFile.name + ".report.json");
  });

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
})();