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
  const unityDetails = document.getElementById("unityDetails");
  const unitySummary = document.getElementById("unitySummary");
  const unityHex = document.getElementById("unityHex");
  const unityStrings = document.getElementById("unityStrings");

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
    if (unityDetails) unityDetails.classList.add("hidden");
    if (unitySummary) unitySummary.replaceChildren();
    if (unityHex) unityHex.textContent = "";
    if (unityStrings) unityStrings.replaceChildren();
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
      await inspectUnityBundle(file);
    } else {
      fileMessage.textContent = "Please choose a .zip or .unity3d file.";
      addReport("File type", "This prototype supports ZIP inspection and basic .unity3d filename detection.");
      compatBadge.textContent = "Unsupported";
    }
  });


  async function inspectUnityBundle(file) {
    fileMessage.textContent = "Reading a small header sample locally. This can identify some common Unity bundle signatures, but it cannot fully parse or convert the bundle.";
    try {
      const sampleSize = Math.min(file.size, 256 * 1024);
      const buffer = await file.slice(0, sampleSize).arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const ascii = bytesToAscii(bytes);
      const firstLine = ascii.split("\n")[0].replace(/\0/g, "").trim();
      const headerType = detectUnityHeader(ascii);
      const unityVersion = findUnityVersion(ascii);
      const platformHints = findPlatformHints(ascii);
      const strings = extractReadableStrings(bytes, 5, 30);

      if (unityDetails) unityDetails.classList.remove("hidden");
      if (unitySummary) {
        const facts = [
          ["Header signature", headerType],
          ["First readable line", firstLine || "(no readable text)"],
          ["Unity version hint", unityVersion || "Not found in first 256 KB"],
          ["Platform hints", platformHints.length ? platformHints.join(", ") : "No clear platform marker found"],
          ["Bytes sampled", formatBytes(sampleSize)]
        ];
        unitySummary.replaceChildren();
        for (const [label, value] of facts) {
          const item = document.createElement("div");
          const dt = document.createElement("dt");
          const dd = document.createElement("dd");
          dt.textContent = label;
          dd.textContent = value;
          item.append(dt, dd);
          unitySummary.appendChild(item);
        }
      }

      if (unityHex) {
        const preview = Array.from(bytes.slice(0, 64), b => b.toString(16).padStart(2, "0")).join(" ");
        unityHex.textContent = preview || "(empty file)";
      }
      if (unityStrings) {
        unityStrings.replaceChildren();
        if (!strings.length) {
          const li = document.createElement("li");
          li.textContent = "No readable text strings found in the sampled bytes.";
          unityStrings.appendChild(li);
        } else {
          for (const value of strings) {
            const li = document.createElement("li");
            li.textContent = value;
            unityStrings.appendChild(li);
          }
        }
      }

      addReport("File detection", `Extension is .unity3d. Header check: ${headerType}.`);
      addReport("Unity version hint", unityVersion || "No Unity version string found in the first 256 KB; this does not prove the version is absent.");
      addReport("Platform hints", platformHints.length ? platformHints.join(", ") : "No clear platform marker found in the sampled bytes.");
      addReport("Inspection scope", `Only the first ${formatBytes(sampleSize)} were sampled. Readable strings and header signatures are clues, not a complete asset parse.`);
      addReport("iOS compatibility", "Cannot be confirmed from a header sample alone. Check the source Unity project, Unity version, target platform, dependencies, shaders, and asset formats.");
      addReport("Conversion", "No conversion was attempted and no output was created.");
      compatBadge.textContent = headerType.startsWith("Recognized") ? "Header recognized" : "Needs review";
      fileMessage.textContent = "Header sample inspected locally. Review the signature, version hints, and readable strings below. This is diagnostic information only—not a full Unity AssetBundle parser.";
    } catch (error) {
      fileMessage.textContent = "Could not read the file sample. Try a smaller file or another browser.";
      addReport("Unity inspection", "Failed to read the initial byte sample.");
      addReport("Conversion", "No conversion was attempted.");
      compatBadge.textContent = "Needs review";
    }
  }

  function bytesToAscii(bytes) {
    let out = "";
    for (const byte of bytes) out += byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : (byte === 10 ? "\n" : byte === 13 ? "\r" : "\0");
    return out;
  }

  function detectUnityHeader(ascii) {
    const start = ascii.replace(/^\uFEFF/, "");
    if (start.startsWith("UnityFS")) return "Recognized UnityFS signature";
    if (start.startsWith("UnityWeb")) return "Recognized legacy UnityWeb signature";
    if (start.startsWith("UnityRaw")) return "Recognized legacy UnityRaw signature";
    if (start.startsWith("UnityArchive")) return "Recognized UnityArchive signature";
    if (start.startsWith("Unity")) return "Possible Unity signature (unrecognized variant)";
    return "No common Unity bundle signature at byte 0";
  }

  function findUnityVersion(ascii) {
    const match = ascii.match(/20\d{2}\.\d+\.\d+[a-zA-Z]\d+/) || ascii.match(/\b\d{1,2}\.\d{1,2}\.\d{1,2}[a-zA-Z]\d+\b/);
    return match ? match[0] : "";
  }

  function findPlatformHints(ascii) {
    const candidates = [
      ["iOS", /iPhone|iPad|iOS|iPhonePlayer/i],
      ["Android", /Android|AndroidPlayer/i],
      ["Windows", /WindowsPlayer|Win64|Win32/i],
      ["macOS", /OSXPlayer|MacPlayer|StandaloneOSX/i],
      ["WebGL", /WebGL/i]
    ];
    return candidates.filter(([, pattern]) => pattern.test(ascii)).map(([name]) => name);
  }

  function extractReadableStrings(bytes, minLength, limit) {
    const found = [];
    let current = "";
    for (const byte of bytes) {
      if (byte >= 32 && byte <= 126) {
        current += String.fromCharCode(byte);
      } else {
        if (current.length >= minLength) found.push(current);
        current = "";
      }
      if (found.length >= limit) break;
    }
    if (current.length >= minLength && found.length < limit) found.push(current);
    return [...new Set(found)].slice(0, limit);
  }

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