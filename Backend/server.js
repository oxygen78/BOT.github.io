import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // для разработки, потом ограничишь
  },
});

// 🔹 Игровые комнаты (в памяти!)
const rooms = {};

// Подключение клиента
io.on("connection", (socket) => {
  console.log("Подключился:", socket.id);

  // Вход в комнату
  socket.on("join_room", ({ roomId, user }) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        pot: 0,
      };
    }

    rooms[roomId].players.push(user);

    // Уведомляем всех в комнате
    io.to(roomId).emit("room_update", rooms[roomId]);
  });

  // Ставка
  socket.on("bet", ({ roomId, amount, user }) => {
    if (!rooms[roomId]) return;

    rooms[roomId].pot += amount;

    io.to(roomId).emit("bet_made", {
      user,
      amount,
      pot: rooms[roomId].pot,
    });
  });

  socket.on("disconnect", () => {
    console.log("Отключился:", socket.id);
  });
});

server.listen(3000, () => {
  console.log("Socket.IO сервер запущен на http://localhost:3000");
});
