const applicationId = process.env.DISCORD_APPLICATION_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;
if (!applicationId || !botToken) throw new Error("DISCORD_APPLICATION_ID と DISCORD_BOT_TOKEN が必要です");

const manageGuild = "32";
const commands = [
  {
    name: "log", description: "運動記録を登録します", contexts: [0],
    options: [{ name: "record", description: "例: 腹筋:30回 ランニング:3km", type: 3, required: true, max_length: 1000 }]
  },
  { name: "status", description: "現在の経路と進捗を表示します", contexts: [0] },
  {
    name: "route", description: "新しい経路を登録します", contexts: [0], default_member_permissions: manageGuild,
    options: [
      { name: "start", description: "出発地", type: 3, required: true, max_length: 256 },
      { name: "goal", description: "目的地", type: 3, required: true, max_length: 256 }
    ]
  },
  { name: "cancel", description: "進行中の経路をキャンセルします", contexts: [0], default_member_permissions: manageGuild }
];

const response = await fetch(`https://discord.com/api/v10/applications/${encodeURIComponent(applicationId)}/commands`, {
  method: "PUT",
  headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
  body: JSON.stringify(commands)
});
if (!response.ok) throw new Error(`コマンド登録に失敗しました (${response.status}): ${await response.text()}`);
console.log("Discord スラッシュコマンドを登録しました");
