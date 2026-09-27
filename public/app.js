(() => {
  const $ = selector => document.querySelector(selector);
  const ranking = $("#ranking");
  const dailyChart = $("#daily-chart");
  const historyList = $("#history");
  let initialState;
  let displayed;
  let map;
  let layers;
  let rankingMode = "route";

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatKm(value) { return `${Number(value || 0).toFixed(2)} km`; }

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
        done.push([points[i - 1][0] + (points[i][0] - points[i - 1][0]) * ratio, points[i - 1][1] + (points[i][1] - points[i - 1][1]) * ratio]);
        break;
      } else break;
    }
    return done;
  }

  function drawMap(route) {
    if (!window.L || !route?.points?.length) return;
    if (!map) {
      map = L.map("map", { scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' }).addTo(map);
      layers = L.layerGroup().addTo(map);
    }
    layers.clearLayers();
    L.polyline(route.points, { color: "#84909a", weight: 5, opacity: .72 }).addTo(layers);
    const moved = lineAtProgress(route.points, route.progressKm || 0);
    if (moved.length > 1) L.polyline(moved, { color: "#e44d48", weight: 6, opacity: .92 }).addTo(layers);
    const label = document.createElement("span");
    label.textContent = route.currentPlace || "現在地";
    L.circleMarker(route.current, { radius: 8, color: "#fff", weight: 3, fillColor: "#e44d48", fillOpacity: 1 }).addTo(layers).bindTooltip(label);
    map.fitBounds(L.latLngBounds(route.points), { padding: [22, 22] });
    requestAnimationFrame(() => map.invalidateSize());
  }

  function renderRanking() {
    ranking.replaceChildren();
    const data = rankingMode === "all" ? initialState.allTimeMembers : displayed.members;
    if (!data?.length) { ranking.append(element("li", "empty-list", "まだ記録がありません")); return; }
    const max = Math.max(...data.map(member => Number(member.km) || 0), .01);
    data.forEach((member, index) => {
      const row = element("li", "rank-row");
      row.append(element("span", "rank-number", String(index + 1).padStart(2, "0")));
      const main = element("div", "rank-main");
      main.append(element("span", "rank-name", member.userName));
      const track = element("div", "bar-track");
      const bar = element("span");
      bar.style.width = `${Math.max(2, Number(member.km) / max * 100)}%`;
      track.append(bar);
      main.append(track);
      row.append(main, element("span", "rank-km", formatKm(member.km)));
      ranking.append(row);
    });
  }

  function renderDays(moves) {
    dailyChart.replaceChildren();
    if (!moves?.length) { dailyChart.append(element("p", "empty-list", "前進した日はまだありません")); return; }
    const max = Math.max(...moves.map(move => Number(move.km) || 0), .01);
    moves.slice(-12).forEach(move => {
      const col = element("div", "day-column");
      col.title = `${move.date}: ${formatKm(move.km)}`;
      const area = element("div", "day-bar-area");
      const bar = element("div", "day-bar");
      bar.style.height = `${Math.max(3, Number(move.km) / max * 100)}%`;
      bar.setAttribute("aria-label", `${move.date} ${formatKm(move.km)}`);
      area.append(bar);
      col.append(area, element("span", "day-label", move.date.slice(5)));
      dailyChart.append(col);
    });
  }

  function renderHistory() {
    historyList.replaceChildren();
    const activeId = initialState.route?.id;
    const items = [...(initialState.route ? [{ ...initialState.route, currentRoute: true }] : []), ...(initialState.history || [])];
    if (!items.length) { historyList.append(element("span", "muted", "経路履歴はありません")); return; }
    items.forEach(item => {
      const button = element("button", "history-item");
      button.type = "button";
      button.dataset.routeId = String(item.id);
      button.setAttribute("aria-current", String(displayed.route?.id === item.id));
      button.append(element("strong", "", `${item.origin} → ${item.destination}`));
      button.append(element("span", "", `${formatKm(item.totalKm)} · ${item.status === "active" ? "進行中" : item.status === "finished" ? "完走" : "キャンセル"}`));
      button.addEventListener("click", async () => {
        if (item.id === activeId) { displayed = { ...initialState, route: initialState.route }; render(); return; }
        button.disabled = true;
        try {
          const response = await fetch(`/api/routes/${encodeURIComponent(item.id)}`);
          if (!response.ok) throw new Error("route fetch failed");
          displayed = await response.json();
          render();
        } catch { $("#load-error").hidden = false; }
      });
      historyList.append(button);
    });
  }

  function render() {
    const route = displayed.route;
    const routeChoices = (initialState.route ? 1 : 0) + (initialState.history || []).length;
    $("#history-panel").hidden = routeChoices === 0;
    renderHistory();
    $("#home-button").hidden = !initialState.route || route.id === initialState.route.id;
    $("#route-content").hidden = !route;
    $("#empty-state").hidden = Boolean(route);
    if (!route) {
      $("#route-title").textContent = "経路はまだありません";
      $("#route-note").textContent = "みんなの旅が始まるのを待っています";
      $("#progress-fill").style.width = "0%";
      return;
    }
    const percent = route.totalKm ? Math.min(100, route.progressKm / route.totalKm * 100) : 0;
    $("#route-title").textContent = `${route.origin} → ${route.destination}`;
    $("#route-note").textContent = `${route.currentPlace || "現在地を更新中"} · ${route.status === "active" ? "進行中" : route.status === "finished" ? "到着しました" : "キャンセル"}`;
    $(".progress-track").setAttribute("aria-valuenow", String(Math.round(percent)));
    $("#progress-fill").style.width = `${percent}%`;
    $("#progress-text").textContent = `${formatKm(route.progressKm)} / ${formatKm(route.totalKm)} · ${percent.toFixed(1)}%`;
    $("#pending-text").textContent = route.status === "active" ? `${formatKm(route.pendingKm)} 未反映 · 次回 16:05 に反映` : "";
    drawMap(route);
    renderRanking();
    renderDays(displayed.moves);
  }

  $("#home-button").addEventListener("click", () => { displayed = initialState; render(); });
  document.querySelectorAll("[data-ranking]").forEach(button => button.addEventListener("click", () => {
    rankingMode = button.dataset.ranking;
    document.querySelectorAll("[data-ranking]").forEach(tab => {
      const active = tab === button;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    renderRanking();
  }));

  fetch("/api/state").then(response => { if (!response.ok) throw new Error("state fetch failed"); return response.json(); }).then(state => {
    initialState = state;
    displayed = state;
    render();
  }).catch(() => { $("#load-error").hidden = false; });
})();
