import { activeRoute, cancelRoute, createRoute, pendingKm, recordLog, userKm } from "../db";
import { kcalToKm, parseRecord } from "../exercise";
import type { Env } from "../env";
import { getRoute, RouteUserError } from "../ors";
import { editOriginal } from "./api";

type Option = { name: string; value?: string };
type Interaction = {
  type: number;
  token?: string;
  data?: { name?: string; options?: Option[] };
  member?: { permissions?: string; user?: { id?: string; username?: string; global_name?: string } };
  user?: { id?: string; username?: string; global_name?: string };
};

const permission = 0x20n;
const reply = (content: string, ephemeral = false): Response => Response.json({
  type: 4,
  data: { content, ...(ephemeral ? { flags: 64 } : {}), allowed_mentions: { parse: [] } }
});
const option = (interaction: Interaction, name: string): string | undefined => interaction.data?.options?.find(row => row.name === name)?.value;

export async function handleInteraction(interaction: Interaction, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (interaction.type === 1) return Response.json({ type: 1 });
  if (interaction.type !== 2 || !interaction.data?.name) return reply("未対応の Interaction です。", true);

  const name = interaction.data.name;
  const needsAdmin = name === "route" || name === "cancel";
  if (needsAdmin && !(BigInt(interaction.member?.permissions ?? "0") & permission)) return reply("この操作にはサーバー管理権限が必要です。", true);
  const user = interaction.member?.user ?? interaction.user;
  if (!user?.id) return reply("サーバー内で実行してください。", true);
  const userId = user.id;

  if (name === "log") {
    const input = option(interaction, "record") ?? "";
    const parsed = parseRecord(input);
    if (!parsed.ok) return reply(`${parsed.errors.join("\n")}\n例: 腹筋:30回 ランニング:3km`, true);
    const route = await activeRoute(env.DB);
    if (!route) return reply("経路が登録されていません。管理者に /route を実行してもらってください。", true);
    const configuredCap = Number(env.PER_LOG_CAP_KM);
    const converted = kcalToKm(parsed.kcal, Number.isFinite(configuredCap) && configuredCap > 0 ? configuredCap : 15);
    await recordLog(env.DB, {
      routeId: route.id, userId, userName: user.global_name ?? user.username ?? "メンバー",
      kcal: parsed.kcal, km: converted.km, capped: converted.capped, detail: JSON.stringify(parsed.items)
    });
    const [totalKm, pending] = await Promise.all([userKm(env.DB, route.id, user.id), pendingKm(env.DB, route.id)]);
    const estimatedRemaining = Math.max(0, (route.total_m - route.progress_m) / 1000 - pending);
    return reply([
      `記録しました: ${converted.km.toFixed(2)} km${converted.capped ? "（1回の上限を適用）" : ""}`,
      `この経路での累計: ${totalKm.toFixed(2)} km`,
      `未反映分を含めた目的地まで: ${estimatedRemaining.toFixed(2)} km`
    ].join("\n"));
  }

  if (name === "status") {
    const route = await activeRoute(env.DB);
    if (!route) return reply("現在、経路は登録されていません。管理者に /route を実行してもらってください。");
    const [pending, move] = await Promise.all([
      pendingKm(env.DB, route.id),
      env.DB.prepare("SELECT place_name AS place FROM moves WHERE route_id = ? ORDER BY move_date DESC LIMIT 1").bind(route.id).first<{ place: string | null }>()
    ]);
    const totalKm = route.total_m / 1000;
    const progressKm = route.progress_m / 1000;
    return reply([
      `${route.origin_name} → ${route.destination_name}`,
      `現在地: ${move?.place ?? (route.progress_m === 0 ? route.origin_name : "地名不明")}`,
      `進捗: ${progressKm.toFixed(2)} / ${totalKm.toFixed(2)} km（${Math.floor(progressKm * 100 / totalKm)}%）`,
      `残り: ${Math.max(0, totalKm - progressKm).toFixed(2)} km · 本日未反映: ${pending.toFixed(2)} km`,
      env.SITE_URL
    ].join("\n"));
  }

  if (name === "route") {
    const start = option(interaction, "start")?.trim();
    const goal = option(interaction, "goal")?.trim();
    if (!start || !goal || start.length > 256 || goal.length > 256) return reply("出発地と目的地を 1〜256 文字で入力してください。", true);
    if (!interaction.token) return reply("応答トークンがありません。", true);
    const token = interaction.token;
    const applicationId = env.DISCORD_APPLICATION_ID;
    ctx.waitUntil((async () => {
      try {
        if (await activeRoute(env.DB)) throw new RouteUserError("すでに進行中の経路があります。先に /cancel を実行してください。");
        const route = await getRoute(start, goal, env.ORS_API_KEY, env.ORS_PROFILE || "foot-walking");
        const id = await createRoute(env.DB, { ...route, createdBy: userId });
        await editOriginal(applicationId, token, { content: `経路を登録しました: ${route.origin} → ${route.destination}（${(route.totalM / 1000).toFixed(2)} km）\n${env.SITE_URL}`, allowed_mentions: { parse: [] } });
        console.log("Route registered", id);
      } catch (error) {
        let message: string;
        if (error instanceof RouteUserError) message = error.message;
        else if (String(error).includes("UNIQUE constraint failed: routes.status")) {
          console.error("Concurrent route registration rejected", error);
          message = "すでに進行中の経路があります。先に /cancel を実行してください。";
        } else {
          console.error("Route registration failed", error);
          message = "経路登録に失敗しました。時間をおいて再度お試しください。";
        }
        try { await editOriginal(applicationId, token, { content: `経路登録に失敗しました: ${message}`, allowed_mentions: { parse: [] } }); }
        catch (followupError) { console.error("Route response failed", followupError); }
      }
    })());
    return Response.json({ type: 5 });
  }

  if (name === "cancel") {
    const route = await activeRoute(env.DB);
    if (!route) return reply("キャンセルする進行中の経路がありません。", true);
    await cancelRoute(env.DB, route.id);
    return reply(`経路「${route.origin_name} → ${route.destination_name}」をキャンセルしました。`);
  }

  return reply("コマンドが見つかりません。", true);
}
