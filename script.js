import { io } from "socket.io-client"
  const tg = Telegram.WebApp;
  tg.expand();

    const user = Telegram.WebApp.initDataUnsafe.user || { id: Math.random(), first_name: "Guest" };
  const tgId = user.id;
  const name = user.first_name;

const socket = io("https://localhost:3000", {
  transports: ["websocket"]
});



socket.on("connect", () => {
  socket.emit("register", {
    tgId: user.id,
    username: user.username || null,
    first_name: user.first_name || "User"
  });
});

  socket.on("user_data", (data) => {
    document.getElementById("user").innerText =
      `👤 ${data.name} (ID: ${data.tgId})`;

    document.getElementById("balance").innerText =
      `💰 Баланс: ${data.balance}`;
  });

  function createRoom() {
    const game = document.getElementById("game").value;
    socket.emit("create_room", { tgId, game });
  }

  socket.on("room_created", ({ roomId }) => {
    document.getElementById("room").innerText =
      `🏠 Комната создана: ${roomId}`;
  });

  function joinRoom() {
    const roomId = document.getElementById("roomId").value;
    socket.emit("join_room", { tgId, roomId });
  }

  socket.on("room_update", (room) => {
    document.getElementById("room").innerText =
      `🎮 Игра: ${room.game}
👥 Игроков: ${room.players.length}`;
  });