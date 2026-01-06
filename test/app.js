/**
 * 부산 맛집(부산광역시_부산맛집정보) OpenAPI + Kakao Map
 * - 리스트: getFoodKr?pageNo&numOfRows
 * - 상세: getFoodKr?UC_SEQ=...
 *
 * 참고 파라미터: serviceKey, pageNo, numOfRows, resultType=json, UC_SEQ
 */

const API_BASE = "https://apis.data.go.kr/6260000/FoodService";

// ✅ 여기에 공공데이터포털 일반 인증키(Decoding 키)를 넣으세요.
const SERVICE_KEY = "U3rjn1OQzoe833jk5RJokTl1sVFUmIQp7dGTZl0tcvNU7p2blLzjccSSgrAHQgyLYlBIm7Qt0wOFwQRvvG7h8Q%3D%3D";

let state = {
  pageNo: 1,
  numOfRows: 20,
  keyword: "",
  gugun: "",
  items: [],
  totalCount: 0,
  selected: null
};

let kakaoMap = null;
let kakaoMarker = null;

const $ = (sel) => document.querySelector(sel);

const elList = $("#list");
const elCount = $("#countText");
const elPage = $("#pageText");
const elLoading = $("#listLoading");
const elError = $("#listError");

const elEmptyDetail = $("#emptyDetail");
const elDetail = $("#detail");

const elSearchInput = $("#searchInput");
const elSearchBtn = $("#searchBtn");
const elGugun = $("#gugunSelect");
const elRows = $("#rowsSelect");
const elPrev = $("#prevBtn");
const elNext = $("#nextBtn");

const elFav = $("#favBtn");
const elImg = $("#detailImg");
const elDTitle = $("#dTitle");
const elDAddr = $("#dAddr");
const elDDesc = $("#dDesc");
const elDMenu = $("#dMenu");
const elDTel = $("#dTel");
const elDTime = $("#dTime");

init();

function init() {
  elRows.value = String(state.numOfRows);

  elSearchBtn.addEventListener("click", () => {
    state.keyword = (elSearchInput.value || "").trim();
    state.pageNo = 1;
    renderList();
  });

  elSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") elSearchBtn.click();
  });

  elRows.addEventListener("change", () => {
    state.numOfRows = Number(elRows.value);
    state.pageNo = 1;
    renderList();
  });

  elGugun.addEventListener("change", () => {
    state.gugun = elGugun.value;
    state.pageNo = 1;
    renderList();
  });

  elPrev.addEventListener("click", () => {
    if (state.pageNo > 1) {
      state.pageNo -= 1;
      renderList();
    }
  });

  elNext.addEventListener("click", () => {
    // totalCount가 있으면 마지막 페이지 계산 가능
    const lastPage = state.totalCount
      ? Math.ceil(state.totalCount / state.numOfRows)
      : state.pageNo + 1;

    if (state.pageNo < lastPage) {
      state.pageNo += 1;
      renderList();
    }
  });

  elFav.addEventListener("click", () => {
    if (!state.selected) return;
    toggleFavorite(state.selected.UC_SEQ);
    renderDetail(state.selected);
  });

  // 첫 로드
  renderList();
}

async function renderList() {
  setListStatus({ loading: true, error: "" });

  try {
    const data = await fetchFoodList(state.pageNo, state.numOfRows);

    const rawItems = normalizeItems(data);
    state.totalCount = Number(data?.getFoodKr?.totalCount || data?.totalCount || 0);

    // 구군 옵션 채우기(최초 1회+데이터 기반)
    fillGugunOptionsOnce(rawItems);

    // 검색/필터는 프론트에서 적용(API가 필터 파라미터 제공하지 않는다고 가정)
    const filtered = rawItems.filter((it) => {
      const matchesGugun = state.gugun ? (it.GUGUN_NM === state.gugun) : true;
      const matchesKeyword = state.keyword
        ? textBlob(it).includes(state.keyword.toLowerCase())
        : true;
      return matchesGugun && matchesKeyword;
    });

    state.items = filtered;

    elCount.textContent = `${filtered.length}개`;
    elPage.textContent = `${state.pageNo}`;

    elList.innerHTML = filtered.map(cardTemplate).join("");

    // 이벤트 바인딩
    elList.querySelectorAll("[data-ucseq]").forEach((card) => {
      card.addEventListener("click", async (e) => {
        // 버튼 클릭은 카드 클릭 전파 방지
        const target = e.target;
        if (target.closest("button")) return;

        const ucSeq = card.getAttribute("data-ucseq");
        await openDetail(ucSeq);
      });
    });

    elList.querySelectorAll("[data-fav]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const ucSeq = btn.getAttribute("data-fav");
        toggleFavorite(ucSeq);
        btn.textContent = isFavorite(ucSeq) ? "♥" : "♡";
      });
    });

    elList.querySelectorAll("[data-map]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const ucSeq = btn.getAttribute("data-map");
        await openDetail(ucSeq);
        // 모바일에서 상세로 자연스럽게 이동
        $("#detail").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    setListStatus({ loading: false, error: "" });
  } catch (err) {
    console.error(err);
    setListStatus({ loading: false, error: formatErr(err) });
  }
}

async function openDetail(ucSeq) {
  // 상세는 API에서 UC_SEQ로 다시 받아오는 편이 안전
  try {
    const data = await fetchFoodDetail(ucSeq);
    const item = normalizeItems(data)[0] || state.items.find((x) => String(x.UC_SEQ) === String(ucSeq));

    if (!item) throw new Error("상세 데이터를 찾을 수 없습니다.");

    state.selected = item;
    renderDetail(item);
  } catch (err) {
    console.error(err);
    alert("상세 로드 실패: " + formatErr(err));
  }
}

function renderDetail(item) {
  elEmptyDetail.classList.add("hidden");
  elDetail.classList.remove("hidden");

  // 이미지: API 필드명이 다를 수 있어 후보를 여러 개 둠
  const imgUrl =
    item.MAIN_IMG_NORMAL ||
    item.MAIN_IMG_THUMB ||
    item.IMG_URL ||
    item.MAIN_IMG ||
    "";

  elImg.src = imgUrl || placeholderImage();
  elImg.alt = item.MAIN_TITLE || item.TITLE || "맛집 이미지";

  elDTitle.textContent = item.MAIN_TITLE || "-";
  elDAddr.textContent = item.ADDR1 || item.ADDR || "-";
  elDDesc.textContent = (item.ITEMCNTNTS || item.SUBTITLE || item.TITLE || "-").trim();
  elDMenu.textContent = item.RPRSNTV_MENU || item.MENU || "-";
  elDTel.textContent = item.CNTCT_TEL || item.TEL || "-";
  elDTime.textContent = item.USAGE_DAY_WEEK_AND_TIME || item.USAGE_TIME || "-";

  // 찜 버튼 UI
  elFav.textContent = isFavorite(item.UC_SEQ) ? "♥" : "♡";

  // 지도
  const lat = Number(item.LAT);
  const lng = Number(item.LNG);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    renderKakaoMap(lat, lng, item.MAIN_TITLE || "선택한 위치");
  } else {
    // 좌표 없으면 지도 영역에 안내
    $("#map").innerHTML = `<div style="padding:12px;color:#64748b;">좌표 정보(LAT/LNG)가 없어 지도를 표시할 수 없어요.</div>`;
  }
}

/* ---------------- API ---------------- */

async function fetchFoodList(pageNo, numOfRows) {
  const url = buildUrl({
    serviceKey: SERVICE_KEY,
    pageNo,
    numOfRows,
    resultType: "json"
  });

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function fetchFoodDetail(ucSeq) {
  const url = buildUrl({
    serviceKey: SERVICE_KEY,
    pageNo: 1,
    numOfRows: 1,
    resultType: "json",
    UC_SEQ: ucSeq
  });

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function buildUrl(params) {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") usp.append(k, String(v));
  });
  return `${API_BASE}?${usp.toString()}`;
}

/**
 * 응답 구조가 환경/버전에 따라 달라질 수 있어서 최대한 안전하게 정규화
 * data.getFoodKr.item / data.getFoodKr.items / data.getFoodKr.body.items 등 케이스 대응
 */
function normalizeItems(data) {
  const root = data?.getFoodKr || data?.response?.body || data;
  const items =
    root?.item ||
    root?.items ||
    root?.body?.items ||
    root?.body?.item ||
    [];

  if (Array.isArray(items)) return items;
  if (items && typeof items === "object") return [items];
  return [];
}

/* ---------------- UI Helpers ---------------- */

function cardTemplate(it) {
  const title = it.MAIN_TITLE || "이름 없음";
  const addr = it.ADDR1 || "-";
  const menu = it.RPRSNTV_MENU || it.MENU || "-";
  const gugun = it.GUGUN_NM || "구/군";
  const ucSeq = it.UC_SEQ;

  return `
    <div class="card" data-ucseq="${escapeHtml(String(ucSeq))}">
      <div>
        <div class="card__title">${escapeHtml(title)}</div>
        <p class="card__sub">주소: ${escapeHtml(addr)}</p>
        <p class="card__sub">메뉴: ${escapeHtml(menu)}</p>
        <div class="card__chips">
          <span class="chip">${escapeHtml(gugun)}</span>
        </div>
      </div>

      <div class="card__actions">
        <button class="heart" data-fav="${escapeHtml(String(ucSeq))}" title="찜">
          ${isFavorite(ucSeq) ? "♥" : "♡"}
        </button>
        <button class="miniIcon" data-map="${escapeHtml(String(ucSeq))}" title="지도 보기">📍</button>
      </div>
    </div>
  `;
}

function setListStatus({ loading, error }) {
  elLoading.classList.toggle("hidden", !loading);
  elError.classList.toggle("hidden", !error);
  elError.textContent = error || "";
}

function textBlob(it) {
  return [
    it.MAIN_TITLE,
    it.ADDR1,
    it.RPRSNTV_MENU,
    it.TITLE,
    it.SUBTITLE,
    it.GUGUN_NM
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function fillGugunOptionsOnce(items) {
  if (elGugun.options.length > 1) return; // 이미 채움

  const set = new Set(items.map((x) => x.GUGUN_NM).filter(Boolean));
  [...set].sort().forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = g;
    elGugun.appendChild(opt);
  });
}

/* ---------------- Favorites (localStorage) ---------------- */

const FAV_KEY = "busan_food_favs_v1";

function getFavSet() {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(arr.map(String));
  } catch {
    return new Set();
  }
}
function saveFavSet(set) {
  localStorage.setItem(FAV_KEY, JSON.stringify([...set]));
}
function isFavorite(ucSeq) {
  const set = getFavSet();
  return set.has(String(ucSeq));
}
function toggleFavorite(ucSeq) {
  const set = getFavSet();
  const key = String(ucSeq);
  if (set.has(key)) set.delete(key);
  else set.add(key);
  saveFavSet(set);
}

/* ---------------- Kakao Map ---------------- */

function renderKakaoMap(lat, lng, title) {
  const container = $("#map");

  // Kakao SDK 로드 대기
  if (!window.kakao || !window.kakao.maps) {
    container.innerHTML = `<div style="padding:12px;color:#64748b;">카카오맵 SDK가 로드되지 않았어요. appkey를 확인해 주세요.</div>`;
    return;
  }

  const pos = new kakao.maps.LatLng(lat, lng);

  if (!kakaoMap) {
    kakaoMap = new kakao.maps.Map(container, {
      center: pos,
      level: 3
    });
    kakaoMarker = new kakao.maps.Marker({ position: pos });
    kakaoMarker.setMap(kakaoMap);
  } else {
    kakaoMap.setCenter(pos);
    kakaoMarker.setPosition(pos);
  }

  // 인포윈도우(간단)
  const iwContent = `<div style="padding:6px 8px;font-size:12px;">${escapeHtml(title)}</div>`;
  const iw = new kakao.maps.InfoWindow({ content: iwContent });
  iw.open(kakaoMap, kakaoMarker);
}

/* ---------------- Utils ---------------- */

function placeholderImage() {
  // 이미지가 없을 때 간단한 플레이스홀더(데이터 URI)
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700">
      <rect width="100%" height="100%" fill="#0b1220"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
        fill="#94a3b8" font-size="36" font-family="Arial">
        이미지 없음
      </text>
    </svg>
  `);
  return `data:image/svg+xml;charset=utf-8,${svg}`;
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatErr(err) {
  if (typeof err === "string") return err;
  return err?.message || "알 수 없는 오류";
}
