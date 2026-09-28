(() => {
  const $ = selector => document.querySelector(selector);
  const ranking = $("#ranking");
  const dailyChart = $("#daily-chart");
  const historyList = $("#history");
  let initialState;
  let displayed;
  let me = { user: null, activities: [], kcalPerKm: 0, perLogCapKm: 15 };
  let map;
  let mapLayers;
  let routeBounds;
  let mapMarkers = [];
  let rankingMode = "route";
  let selectedActivity = "";
  let selectedUnit = "";
  let pendingItems = [];

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatKm(value) { return `${Number(value || 0).toFixed(2)} km`; }
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function jstDate(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(date);
    const part = type => parts.find(row => row.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  }

  function lineAtProgress(points, progressKm) {
    const distances = [0];
    const rad = n => n * Math.PI / 180;
    for (let i = 1; i < points.length; i++) {
      const [lat1, lng1] = points[i - 1], [lat2, lng2] = points[i];
      const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
      distances.push(distances[i - 1] + 6371008.8 * 2 * Math.asin(Math.sqrt(h)));
    }
    const target = progressKm * 1000;
    const done = [points[0]];
    for (let i = 1; i < distances.length; i++) {
      if (target >= distances[i]) done.push(points[i]);
      else if (target > distances[i - 1]) {
        const ratio = (target - distances[i - 1]) / (distances[i] - distances[i - 1]);
        done.push([
          points[i - 1][0] + (points[i][0] - points[i - 1][0]) * ratio,
          points[i - 1][1] + (points[i][1] - points[i - 1][1]) * ratio
        ]);
        break;
      } else break;
    }
    return done;
  }

  function tooltip(text) {
    const label = document.createElement("span");
    label.textContent = text;
    return label;
  }

  function updateMapTooltips() {
    if (!map) return;
    const width = map.getSize().x;
    for (const marker of mapMarkers) {
      const tip = marker.getTooltip();
      if (!tip) continue;
      const direction = map.latLngToContainerPoint(marker.getLatLng()).x >= width / 2 ? "left" : "right";
      tip.options.direction = direction;
      tip.options.offset = L.point(direction === "left" ? [-8, 0] : [8, 0]);
      tip.update();
    }
  }

  function drawMap(route) {
    if (!window.L || !route?.points?.length) return;
    if (!map) {
      map = L.map("map", { scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
      }).addTo(map);
      mapLayers = L.layerGroup().addTo(map);
      map.on("moveend zoomend resize", updateMapTooltips);
    }
    mapLayers.clearLayers();
    mapMarkers = [];
    const accent = css("--accent");
    const muted = css("--line-strong");
    const bounds = L.latLngBounds(route.points);
    routeBounds = bounds;
    L.polyline(route.points, { color: muted, weight: 5, opacity: .9, dashArray: "3 8", lineCap: "round" }).addTo(mapLayers);
    const moved = lineAtProgress(route.points, route.progressKm || 0);
    if (moved.length > 1) L.polyline(moved, { color: accent, weight: 6, opacity: .96, lineCap: "round", lineJoin: "round" }).addTo(mapLayers);

    mapMarkers.push(L.circleMarker(route.points[0], { radius: 7, color: css("--text"), weight: 2, fillColor: css("--surface"), fillOpacity: 1 })
      .addTo(mapLayers).bindTooltip(tooltip(`スタート ${route.origin}`), { permanent: true, direction: "right", offset: [8, 0], className: "map-tooltip" }));
    mapMarkers.push(L.marker(route.points.at(-1), {
      title: `ゴール ${route.destination}`, alt: `ゴール ${route.destination}`,
      icon: L.divIcon({ className: "goal-flag", html: '<span aria-hidden="true"></span>', iconSize: [24, 30], iconAnchor: [5, 29] })
    }).addTo(mapLayers).bindTooltip(tooltip(`ゴール ${route.destination}`), { permanent: true, direction: "left", offset: [-8, 0], className: "map-tooltip" }));
    const current = route.current || route.points[0];
    mapMarkers.push(L.circleMarker(current, { radius: 9, color: css("--surface"), weight: 3, fillColor: accent, fillOpacity: 1 })
      .addTo(mapLayers).bindTooltip(tooltip("ほっぽちゃん"), { permanent: true, direction: "top", offset: [0, -9], className: "map-tooltip" }));
    map.fitBounds(bounds, { padding: [32, 32] });
    requestAnimationFrame(() => { map.invalidateSize(); updateMapTooltips(); });
  }

  function countdown() {
    const now = new Date();
    const date = jstDate(now).split("-").map(Number);
    let target = Date.UTC(date[0], date[1] - 1, date[2], 7, 5);
    if (target <= now.getTime()) target += 86400000;
    const minutes = Math.ceil((target - now.getTime()) / 60000);
    const hours = Math.floor(minutes / 60);
    return `${hours}時間${minutes % 60}分`;
  }

  function renderStats(route) {
    const moves = displayed.moves || [];
    const stat = (selector, value, unit) => $(selector).replaceChildren(document.createTextNode(`${value} `), element("small", "", unit));
    stat("#pending-stat", Number(route.pendingKm || 0).toFixed(2), "km");
    $("#countdown-stat").textContent = countdown();
    stat("#member-stat", String((displayed.members || []).length), "人");
    const average = moves.length ? moves.reduce((sum, move) => sum + Number(move.km || 0), 0) / moves.length : 0;
    const remaining = Math.max(0, Number(route.totalKm) - Number(route.progressKm));
    if (average) stat("#eta-stat", `あと約${Math.ceil(remaining / average)}`, "日");
    else $("#eta-stat").textContent = "—";
  }

  function renderRanking() {
    ranking.replaceChildren();
    const data = rankingMode === "all" ? initialState?.allTimeMembers : displayed?.members;
    if (!data?.length) { ranking.append(element("li", "empty-list", "まだ記録がありません")); return; }
    const max = Math.max(...data.map(member => Number(member.km) || 0), .01);
    data.forEach((member, index) => {
      const row = element("li", "rank-row");
      const rank = element("span", `rank-badge rank-${index + 1}`, String(index + 1));
      rank.setAttribute("aria-label", `${index + 1}位`);
      const main = element("div", "rank-main");
      const top = element("div", "rank-topline");
      top.append(element("span", "rank-name", member.userName), element("span", "rank-km", formatKm(member.km)));
      const track = element("div", "bar-track");
      const bar = element("span");
      bar.style.width = `${Math.max(2, Number(member.km) / max * 100)}%`;
      track.append(bar);
      main.append(top, track);
      const detail = element("span", "rank-detail", `${Number(member.count || 0)} 回記録 · 最終 ${new Date(member.lastAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", timeZone: "Asia/Tokyo" })}`);
      main.append(detail);
      row.append(rank, main);
      ranking.append(row);
    });
  }

  function renderDays(moves, pendingKm) {
    dailyChart.replaceChildren();
    const recent = (moves || []).slice(-7);
    const today = jstDate();
    const chartItems = recent.map(move => ({ date: move.date, km: Number(move.km) || 0, pending: false }));
    if (Number(pendingKm) > 0) chartItems.push({ date: today, km: Number(pendingKm), pending: true });
    const average = recent.length ? recent.reduce((sum, move) => sum + (Number(move.km) || 0), 0) / recent.length : 0;
    $("#daily-average").textContent = `平均 ${average ? `${average.toFixed(2)} km/日` : "— km/日"}`;
    if (!chartItems.length) { dailyChart.append(element("p", "empty-list", "前進した日はまだありません")); return; }
    const max = Math.max(...chartItems.map(move => move.km), .01);
    chartItems.forEach(move => {
      const col = element("div", "day-column");
      const day = move.pending ? "今日" : move.date === today ? "今日" : move.date.slice(5).replace("-", "/");
      col.title = `${day}: ${formatKm(move.km)}${move.pending ? "（未反映）" : ""}`;
      col.setAttribute("aria-label", col.title);
      const area = element("div", "day-bar-area");
      const bar = element("div", `day-bar${move.pending ? " pending" : ""}`);
      bar.style.height = `${Math.max(3, move.km / max * 100)}%`;
      area.append(bar);
      col.append(element("span", "day-value", move.km.toFixed(1)), area, element("span", "day-label", day));
      dailyChart.append(col);
    });
  }

  function renderHistory() {
    historyList.replaceChildren();
    const active = initialState?.route;
    const items = [...(active ? [{ ...active, currentRoute: true }] : []), ...(initialState?.history || [])];
    $("#history-panel").hidden = items.length === 0;
    if (!items.length) return;
    for (const item of items) {
      const button = element("button", "history-item");
      button.type = "button";
      button.setAttribute("aria-current", String(displayed?.route?.id === item.id));
      const copy = element("span", "history-copy");
      copy.append(element("strong", "", `${item.origin} → ${item.destination}`));
      copy.append(element("span", "", formatKm(item.totalKm)));
      const statusText = item.status === "active" ? "進行中" : item.status === "finished" ? "完走" : "キャンセル";
      const status = element("span", `status-pill ${item.status}`, statusText);
      button.append(copy, status);
      button.addEventListener("click", async () => {
        if (active?.id === item.id) { displayed = initialState; render(); return; }
        button.disabled = true;
        try {
          const response = await fetch(`/api/routes/${encodeURIComponent(item.id)}`);
          if (!response.ok) throw new Error("route fetch failed");
          displayed = await response.json();
          render();
        } catch { $("#load-error").hidden = false; }
        finally { button.disabled = false; }
      });
      historyList.append(button);
    }
  }

  function showRecordError(message) {
    const node = $("#record-error");
    node.textContent = message;
    node.hidden = false;
  }

  function renderAuth() {
    const loggedIn = Boolean(me.user);
    $("#header-user").hidden = !loggedIn;
    $("#header-status").textContent = loggedIn ? "Discord 連携中" : "Discord でログインして記録";
    $("#user-name").textContent = me.user?.name || "";
    $("#user-avatar").textContent = [...(me.user?.name || "").trim()][0] || "?";
    $("#logged-out-card").hidden = loggedIn;
    $("#record-form").hidden = !loggedIn;
    $("#success-card").hidden = true;
    $("#record-user").textContent = loggedIn ? `${me.user.name} としてログイン中` : "";
    $("#cap-note").textContent = `1回の記録は最大 ${Number(me.perLogCapKm || 15)} km · 毎日 16:05 に地図へ反映`;
    if (loggedIn) renderActivities();
  }

  function selectedOption() { return me.activities.find(option => option.activity === selectedActivity); }

  function renderActivities() {
    const chips = $("#activity-chips");
    chips.replaceChildren();
    if (!me.activities.length) {
      chips.append(element("span", "muted", "種目を読み込めませんでした。ページを再読み込みしてください。"));
      return;
    }
    if (!selectedActivity) selectedActivity = me.activities.find(option => option.activity === "ランニング")?.activity || me.activities[0].activity;
    for (const option of me.activities) {
      const button = element("button", "activity-chip", option.activity);
      button.type = "button";
      button.dataset.activity = option.activity;
      button.setAttribute("aria-pressed", String(option.activity === selectedActivity));
      button.addEventListener("click", () => {
        selectedActivity = option.activity;
        selectedUnit = option.units.find(unit => unit.unit === "km")?.unit || option.units[0]?.unit || "";
        renderActivities();
        chips.querySelector('[aria-pressed="true"]')?.focus();
      });
      chips.append(button);
    }
    const option = selectedOption();
    const picker = $("#unit-picker");
    picker.replaceChildren();
    if (!option?.units.some(unit => unit.unit === selectedUnit)) selectedUnit = option?.units.find(unit => unit.unit === "km")?.unit || option?.units[0]?.unit || "";
    for (const unit of option?.units || []) {
      const button = element("button", "", unit.unit);
      button.type = "button";
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(unit.unit === selectedUnit));
      button.tabIndex = unit.unit === selectedUnit ? 0 : -1;
      button.addEventListener("click", () => {
        selectedUnit = unit.unit;
        renderActivities();
        picker.querySelector('[aria-checked="true"]')?.focus();
      });
      button.addEventListener("keydown", event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const units = option.units;
        const index = units.findIndex(item => item.unit === selectedUnit);
        const next = (index + (event.key === "ArrowRight" ? 1 : units.length - 1)) % units.length;
        selectedUnit = units[next].unit;
        renderActivities();
        picker.querySelector('[aria-checked="true"]')?.focus();
      });
      picker.append(button);
    }
  }

  function itemKm(item) { return Number(item.amount) * Number(item.kcalFactor) / Number(me.kcalPerKm); }

  function renderPending() {
    const list = $("#pending-list");
    list.replaceChildren();
    pendingItems.forEach((item, index) => {
      const row = element("li", "pending-row");
      row.append(element("span", "pending-name", `${item.activity} ${item.amount}${item.unit}`));
      const actions = element("span", "pending-actions");
      actions.append(element("span", "pending-km", formatKm(itemKm(item))));
      const remove = element("button", "remove-item", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", `${item.activity} ${item.amount}${item.unit} を削除`);
      remove.addEventListener("click", () => { pendingItems.splice(index, 1); renderPending(); });
      actions.append(remove);
      row.append(actions);
      list.append(row);
    });
    const rawTotal = pendingItems.reduce((sum, item) => sum + itemKm(item), 0);
    const total = Math.min(rawTotal, Number(me.perLogCapKm) || 15);
    const submit = $("#submit-record");
    submit.textContent = `記録する（合計 ${total.toFixed(2)} km）`;
    submit.disabled = pendingItems.length === 0;
    $("#add-item").disabled = pendingItems.length >= 10;
  }

  function render() {
    const route = displayed?.route;
    $(".hero").classList.toggle("no-route", !route);
    renderHistory();
    $("#home-button").hidden = !route || route.id === initialState?.route?.id;
    $("#route-content").hidden = !route;
    $("#empty-state").hidden = Boolean(route);
    $("#map-card").hidden = !route;
    $("#stats").hidden = !route;
    if (!route) {
      $("#route-title").textContent = "経路はまだありません";
      $("#current-place").textContent = "— あたり";
      $("#place-card").hidden = true;
      renderRanking();
      renderDays([], 0);
      return;
    }
    $("#place-card").hidden = false;
    const progress = Math.max(0, Number(route.progressKm) || 0);
    const pending = Math.max(0, Number(route.pendingKm) || 0);
    const total = Math.max(0, Number(route.totalKm) || 0);
    const progressPercent = total ? Math.min(100, progress / total * 100) : 0;
    const pendingPercent = total ? Math.min(100 - progressPercent, pending / total * 100) : 0;
    $("#route-title").textContent = `${route.origin} → ${route.destination}`;
    $("#current-place").textContent = `${route.currentPlace || (progress === 0 ? route.origin : "現在地を更新中")} あたり`;
    $("#progress-percent").textContent = `${progressPercent.toFixed(1)}%`;
    $("#progress-count").textContent = `${formatKm(progress)} / ${formatKm(total)}`;
    $(".progress-track").setAttribute("aria-valuenow", String(Math.round(progressPercent)));
    $("#progress-fill").style.width = `${progressPercent}%`;
    $("#pending-fill").style.left = `${progressPercent}%`;
    $("#pending-fill").style.width = `${pendingPercent}%`;
    $("#goal-remaining").textContent = `ゴールまで ${formatKm(Math.max(0, total - progress))}`;
    renderStats(route);
    drawMap(route);
    renderRanking();
    renderDays(displayed.moves, pending);
  }

  function showLoginMessage() {
    const url = new URL(location.href);
    const loginStatus = url.searchParams.get("login");
    if (loginStatus === "not_member" || loginStatus === "error") {
      $("#login-message-text").textContent = loginStatus === "not_member"
        ? "この Discord サーバーのメンバーだけが記録できます。"
        : "ログインに失敗しました。もう一度お試しください。";
      $("#login-message").hidden = false;
      url.searchParams.delete("login");
      history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }

  function bindRecordForm() {
    $("#add-item").addEventListener("click", () => {
      const amount = Number($("#amount").value);
      const unit = selectedOption()?.units.find(option => option.unit === selectedUnit);
      if (!Number.isFinite(amount) || amount <= 0 || !unit) {
        showRecordError("量を正しく入力してください。");
        return;
      }
      if (pendingItems.length >= 10) return;
      $("#record-error").hidden = true;
      pendingItems.push({ activity: selectedActivity, amount, unit: unit.unit, kcalFactor: unit.kcalFactor });
      renderPending();
    });

    $("#record-form").addEventListener("submit", async event => {
      event.preventDefault();
      if (!pendingItems.length) return;
      const button = $("#submit-record");
      button.disabled = true;
      $("#record-error").hidden = true;
      try {
        const response = await fetch("/api/log", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: pendingItems.map(({ activity, amount, unit }) => ({ activity, amount, unit })) })
        });
        const result = await response.json();
        if (response.status === 401) {
          me.user = null;
          renderAuth();
          return;
        }
        if (!response.ok) {
          showRecordError((result.errors || [result.error || "記録に失敗しました。時間をおいて再度お試しください。"]).join("\n"));
          return;
        }
        $("#success-title").textContent = `${Number(result.km).toFixed(2)} km 記録しました`;
        $("#success-items").textContent = pendingItems.map(item => `${item.activity} ${item.amount}${item.unit}`).join(" · ");
        $("#success-total").textContent = formatKm(result.userTotalKm);
        $("#success-remaining").textContent = formatKm(result.remainingKm);
        $("#success-capped").hidden = !result.capped;
        $("#record-form").hidden = true;
        $("#success-card").hidden = false;
        try {
          const stateResponse = await fetch("/api/state");
          if (stateResponse.ok) {
            initialState = await stateResponse.json();
            displayed = initialState;
            render();
          }
        } catch { /* The saved log remains successful if only the dashboard refresh fails. */ }
      } catch {
        showRecordError("記録に失敗しました。時間をおいて再度お試しください。");
      } finally {
        if (!$("#record-form").hidden) renderPending();
      }
    });

    $("#continue-recording").addEventListener("click", () => {
      pendingItems = [];
      $("#record-error").hidden = true;
      $("#success-card").hidden = true;
      $("#record-form").hidden = false;
      renderPending();
      $("#amount").focus();
    });
    $("#dismiss-login-message").addEventListener("click", () => { $("#login-message").hidden = true; });
    $("#logout-button").addEventListener("click", async () => {
      try { await fetch("/auth/logout", { method: "POST" }); } catch { /* Clear local identity when the server cannot be reached. */ }
      me.user = null;
      pendingItems = [];
      renderAuth();
      renderPending();
    });
  }

  $("#home-button").addEventListener("click", () => { displayed = initialState; render(); });
  $("#current-button").addEventListener("click", () => {
    if (!map || !displayed?.route?.current) return;
    map.setView(displayed.route.current, Math.max(map.getZoom(), 14));
    requestAnimationFrame(updateMapTooltips);
  });
  $("#fit-button").addEventListener("click", () => {
    if (!map || !routeBounds) return;
    map.fitBounds(routeBounds, { padding: [32, 32] });
    requestAnimationFrame(updateMapTooltips);
  });
  document.querySelectorAll("[data-ranking]").forEach(button => button.addEventListener("click", () => {
    rankingMode = button.dataset.ranking;
    document.querySelectorAll("[data-ranking]").forEach(tab => tab.setAttribute("aria-selected", String(tab === button)));
    renderRanking();
  }));

  showLoginMessage();
  bindRecordForm();
  Promise.all([
    fetch("/api/state").then(response => { if (!response.ok) throw new Error("state fetch failed"); return response.json(); }),
    fetch("/api/me").then(response => response.ok ? response.json() : null).catch(() => null)
  ]).then(([state, userData]) => {
    initialState = state;
    displayed = state;
    if (userData) me = userData;
    renderAuth();
    renderPending();
    render();
    window.setInterval(() => {
      if (displayed?.route) $("#countdown-stat").textContent = countdown();
    }, 60000);
  }).catch(() => { $("#load-error").hidden = false; });
})();
