import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// 👤 пользователи (временно в памяти)
const users = {}; 
// 🏠 комнаты
const rooms = {};

io.on("connection", (socket) => {
  console.log("connect:", socket.id);

  // регистрация пользователя
  socket.on("register", ({ tgId, name }) => {
    if (!users[tgId]) {
      users[tgId] = {
        tgId,
        name,
        balance: 1000, // стартовый баланс
      };
    }

    socket.emit("user_data", users[tgId]);
  });

  // создать комнату
  socket.on("create_room", ({ tgId, game }) => {
    const roomId = "room-" + Math.random().toString(36).slice(2, 8);

    rooms[roomId] = {
      game,
      players: [tgId],
      pot: 0,
    };

    socket.join(roomId);
    socket.emit("room_created", { roomId });
  });

  // войти в комнату
  socket.on("join_room", ({ tgId, roomId }) => {
    if (!rooms[roomId]) return;

    rooms[roomId].players.push(tgId);
    socket.join(roomId);

    io.to(roomId).emit("room_update", rooms[roomId]);
  });
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
