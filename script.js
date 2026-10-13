const API = "https://www.emsifa.com/api-wilayah-indonesia/v2";

const $ = (id) => document.getElementById(id);
const provinceEl = $("province");
const regencyEl = $("regency");
const districtEl = $("district");
const form = $("searchForm");
const errorEl = $("error");
const submitBtn = $("submitBtn");
const resultEl = $("result");
const summaryEl = $("summary");
const codesEl = $("codes");
const infoRegion = $("infoRegion");
const infoCount = $("infoCount");

const cache = new Map();

async function getList(path) {
  if (cache.has(path)) return cache.get(path);
  const res = await fetch(`${API}/${path}`);
  if (!res.ok) throw new Error(`Gagal memuat data (${res.status})`);
  const json = await res.json();
  const list = Array.isArray(json) ? json : json.data || [];
  const normalized = list.map((x) => ({ ...x, id: String(x.id ?? x.code), name: x.name }));
  cache.set(path, normalized);
  return normalized;
}

function fillSelect(el, items, placeholder) {
  el.innerHTML = "";
  el.append(new Option(placeholder, ""));
  items
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "id"))
    .forEach((it) => el.append(new Option(titleCase(it.name), it.id)));
  el.disabled = items.length === 0;
}

function resetSelect(el, placeholder) {
  el.innerHTML = "";
  el.append(new Option(placeholder, ""));
  el.disabled = true;
}

function titleCase(str) {
  if (str !== str.toUpperCase()) return str;
  return str.toLowerCase().replace(/(^|[\s\-\/(])([a-z])/g, (_, a, b) => a + b.toUpperCase());
}

function selectedText(el) {
  return el.options[el.selectedIndex]?.text || "";
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = !msg;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function loadProvinces() {
  try {
    const data = await getList("provinces.json");
    fillSelect(provinceEl, data, "Pilih provinsi");
  } catch (e) {
    resetSelect(provinceEl, "Gagal memuat");
    showError("Tidak dapat memuat data provinsi. Periksa koneksi internet Anda lalu muat ulang halaman.");
  }
}

provinceEl.addEventListener("change", async () => {
  showError("");
  resetSelect(regencyEl, "Pilih provinsi dulu");
  resetSelect(districtEl, "Pilih kabupaten/kota dulu");
  if (!provinceEl.value) return;
  regencyEl.innerHTML = "<option>Memuat...</option>";
  try {
    const data = await getList(`regencies/${provinceEl.value}.json`);
    fillSelect(regencyEl, data, "Pilih kabupaten/kota");
  } catch (e) {
    resetSelect(regencyEl, "Gagal memuat");
    showError(e.message);
  }
});

regencyEl.addEventListener("change", async () => {
  showError("");
  resetSelect(districtEl, "Pilih kabupaten/kota dulu");
  if (!regencyEl.value) return;
  districtEl.innerHTML = "<option>Memuat...</option>";
  try {
    const data = await getList(`districts/${regencyEl.value}.json`);
    fillSelect(districtEl, data, "Pilih kecamatan");
  } catch (e) {
    resetSelect(districtEl, "Gagal memuat");
    showError(e.message);
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");

  if (!provinceEl.value || !regencyEl.value || !districtEl.value) {
    showError("Lengkapi provinsi, kabupaten/kota, dan kecamatan terlebih dahulu.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.classList.add("loading");
  try {
    const villages = await getList(`villages/${districtEl.value}.json`);
    renderResult(villages);
  } catch (err) {
    showError(err.message || "Terjadi kesalahan saat mengambil data.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove("loading");
  }
});

function renderResult(villages) {
  const province = selectedText(provinceEl);
  const regency = selectedText(regencyEl);
  const district = selectedText(districtEl);

  const groups = new Map();
  let lat = 0, lng = 0, geoCount = 0;
  villages.forEach((v) => {
    const code = v.postal_code ? String(v.postal_code) : "Tidak tersedia";
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push(titleCase(v.name));
    if (typeof v.lat === "number" && typeof v.lng === "number") {
      lat += v.lat; lng += v.lng; geoCount++;
    }
  });

  const codes = [...groups.keys()].sort();
  const realCodes = codes.filter((c) => c !== "Tidak tersedia");

  const coord = geoCount
    ? `${(lat / geoCount).toFixed(4)}, ${(lng / geoCount).toFixed(4)}`
    : "-";

  summaryEl.innerHTML = `
    <div><small>Provinsi</small><span>${escapeHTML(province)}</span></div>
    <div><small>Kabupaten / Kota</small><span>${escapeHTML(regency)}</span></div>
    <div><small>Kecamatan</small><span>${escapeHTML(district)}</span></div>
    <div><small>Kelurahan / Desa</small><span>${villages.length}</span></div>
    <div><small>Perkiraan koordinat</small><span>${coord}</span></div>
  `;

  if (!villages.length) {
    codesEl.innerHTML = `<div class="code-item"><p class="code-places">Data kelurahan/desa tidak ditemukan untuk kecamatan ini.</p></div>`;
  } else {
    codesEl.innerHTML = codes
      .map((code) => {
        const places = groups.get(code).sort((a, b) => a.localeCompare(b, "id"));
        const isNum = code !== "Tidak tersedia";
        return `
          <div class="code-item">
            <div class="code-head">
              <span class="code-num" ${isNum ? "" : 'style="font-size:14px;color:#6b7280"'}>${escapeHTML(code)}</span>
              ${isNum ? `<button type="button" class="copy" data-code="${escapeHTML(code)}">Salin</button>` : ""}
            </div>
            <p class="code-places">${places.map(escapeHTML).join(", ")}</p>
          </div>`;
      })
      .join("");
  }

  infoRegion.textContent = `${district}, ${regency}`;
  infoCount.textContent = realCodes.length
    ? `${realCodes.length} kode pos (${realCodes.length === 1 ? realCodes[0] : realCodes[0] + " – " + realCodes[realCodes.length - 1]})`
    : "Tidak tersedia";

  resultEl.hidden = false;
  resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

codesEl.addEventListener("click", async (e) => {
  const btn = e.target.closest(".copy");
  if (!btn) return;
  try {
    await navigator.clipboard.writeText(btn.dataset.code);
    btn.textContent = "Tersalin ✓";
  } catch {
    btn.textContent = btn.dataset.code;
  }
  setTimeout(() => (btn.textContent = "Salin"), 1500);
});

loadProvinces();
