import express from "express";
import http from "http";
import { Server } from "socket.io";
import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pkg;

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL not set");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  // Используй ssl только если требуется (Supabase требует SSL)
  ssl: { rejectUnauthorized: false },
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: FRONTEND_ORIGIN },
});

// В памяти: активные комнаты (состояние раунда, таймеры)
const rooms = {};

// --- Вспомогательные функции ---
async function upsertUser(tgId, username, firstName) {
  const res = await pool.query(
    `INSERT INTO users(tg_id, username, first_name, last_active)
     VALUES($1, $2, $3, now())
     ON CONFLICT (tg_id) DO UPDATE
       SET username = EXCLUDED.username,
           first_name = EXCLUDED.first_name,
           last_active = now()
     RETURNING tg_id, username, first_name, balance;`,
    [tgId, username, firstName]
  );
  return res.rows[0];
}

async function getUser(tgId) {
  const res = await pool.query('SELECT * FROM users WHERE tg_id=$1', [tgId]);
  return res.rows[0] || null;
}

// --- Socket.IO logic ---
io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("register", async (payload) => {
    // payload: { tgId, username, first_name }
    try {
      const { tgId, username, first_name } = payload;
      if (!tgId) return socket.emit("error", "no_tgId");

      const user = await upsertUser(tgId, username, first_name);
      socket.data.tgId = tgId; // привязываем к сокету
      socket.emit("user_data", user);
    } catch (e) {
      console.error("register error", e);
      socket.emit("error", "register_failed");
    }
  });

  socket.on("create_room", async ({ tgId, game }) => {
    // создаём комнату в БД и в памяти
    try {
      const roomId = "room-" + Math.random().toString(36).slice(2, 9);
      rooms[roomId] = { game, players: [], pot: 0 };

      await pool.query(
        "INSERT INTO rooms(room_id, game, creator_tg) VALUES($1,$2,$3)",
        [roomId, game, tgId]
      );

      socket.join(roomId);
      rooms[roomId].players.push(tgId);
      io.to(roomId).emit("room_update", rooms[roomId]);
      socket.emit("room_created", { roomId });
      console.log("created room", roomId);
    } catch (e) {
      console.error("create_room error", e);
      socket.emit("error", "create_room_failed");
    }
  });

  socket.on("join_room", ({ tgId, roomId }) => {
    if (!rooms[roomId]) {
      // Попробуем загрузить метаинфу из БД (если после перезапуска)
      // Для простоты — вернём ошибку
      return socket.emit("error", "room_not_found");
    }
    socket.join(roomId);
    if (!rooms[roomId].players.includes(tgId)) {
      rooms[roomId].players.push(tgId);
    }
    io.to(roomId).emit("room_update", rooms[roomId]);
  });

  // example: bet processing with DB transactional update
  socket.on("bet", async ({ tgId, roomId, amount }) => {
    try {
      amount = Number(amount);
      if (!amount || amount <= 0) return socket.emit("error", "bad_bet");

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // lock user row
        const userRes = await client.query(
          "SELECT tg_id, balance FROM users WHERE tg_id=$1 FOR UPDATE",
          [tgId]
        );
        if (userRes.rowCount === 0) {
          await client.query("ROLLBACK");
          return socket.emit("error", "user_not_found");
        }
        const user = userRes.rows[0];
        if (Number(user.balance) < amount) {
          await client.query("ROLLBACK");
          return socket.emit("error", "insufficient_balance");
        }

        // Simple RNG
        const rnd = Math.floor(Math.random() * 100); // 0..99
        let reward = 0;
        let outcome = "lose";
        if (rnd < 45) {
          reward = -amount;
          outcome = "lose";
        } else if (rnd < 95) {
          reward = amount;
          outcome = "win";
        } else {
          reward = amount * 9;
          outcome = "jackpot";
        }

        const newBalance = Number(user.balance) + reward;

        // update balance
        await client.query("UPDATE users SET balance=$1 WHERE tg_id=$2", [
          newBalance,
          tgId,
        ]);

        // persist round and transaction
        await client.query(
          `INSERT INTO rounds(room_id, user_tg, bet_amount, outcome, reward, details)
           VALUES($1,$2,$3,$4,$5,$6)`,
          [roomId, tgId, amount, outcome, reward, { rnd }]
        );

        await client.query(
          `INSERT INTO transactions(user_tg, amount, reason)
           VALUES($1,$2,$3)`,
          [tgId, reward, "play"]
        );

        await client.query("COMMIT");

        // update in-memory room pot
        if (rooms[roomId]) {
          rooms[roomId].pot = (rooms[roomId].pot || 0) + amount;
        }

        // emit result to the room
        io.to(roomId).emit("bet_made", {
          user_tg: tgId,
          amount,
          pot: rooms[roomId] ? rooms[roomId].pot : null,
          outcome,
          reward,
          newBalance,
        });
      } catch (e) {
        await client.query("ROLLBACK");
        console.error("bet tx error", e);
        socket.emit("error", "bet_failed");
      } finally {
        client.release();
      }
    } catch (e) {
      console.error("bet error", e);
      socket.emit("error", "server_error");
    }
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
  });
});

app.get("/", (req, res) => {
  res.send("TG Casino Backend is running");
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
